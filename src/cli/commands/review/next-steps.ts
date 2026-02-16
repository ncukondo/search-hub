/**
 * Dynamic next steps generation for review workflow.
 * Generates context-aware suggestions based on current article status distribution.
 */

import type { ReviewStatusResult } from './status.js';
import type { ReviewBasis, ReviewMode } from './types.js';
import type { Suggestion, SuggestionResult } from '../../suggestions/types.js';

export interface ReviewNextStepsContext {
  sessionId: string;
  statusResult: ReviewStatusResult;
  /** Review mode: screening (default) or picking */
  mode?: ReviewMode;
  /** Extract name for batch continuation */
  extractName?: string;
  /** Number of articles extracted in current batch */
  extractedCount?: number;
  /** Total articles matching the filter */
  totalMatching?: number;
  /** Limit used in extract */
  limit?: number;
  /** Offset used in extract */
  offset?: number;
}

export interface BatchContinuationParams {
  sessionId: string;
  extractName?: string | undefined;
  extractedCount: number;
  totalMatching: number;
  limit: number;
  offset?: number | undefined;
}

/**
 * Compute a batch continuation suggestion when --limit was used with remaining articles.
 * Returns null if no remaining articles.
 */
export function computeBatchContinuation(params: BatchContinuationParams): Suggestion | null {
  const nextOffset = (params.offset ?? 0) + params.extractedCount;
  const remaining = params.totalMatching - nextOffset;
  if (remaining <= 0) return null;

  const nextName = params.extractName ? `${params.extractName}-next` : 'next-batch';
  return {
    command: `search-hub review extract --session ${params.sessionId} --offset ${nextOffset} --limit ${params.limit} --name ${nextName}`,
    description: `${remaining} articles remaining — extract next batch`,
  };
}

/**
 * Detect the next review basis level from reviewer registry.
 * Progression: title → abstract → fulltext
 */
function detectNextBasis(reviewers: ReviewStatusResult['reviewers']): ReviewBasis {
  const bases = new Set(reviewers.map((r) => r.basis));
  if (!bases.has('title')) return 'title';
  if (!bases.has('abstract')) return 'abstract';
  return 'fulltext';
}

/**
 * Generate dynamic next steps based on review status distribution.
 *
 * Evaluation order (top-to-bottom, first match wins for primary suggestion):
 * 1. pending > 0 → extract for title screening
 * 2. agreed > 0 → finalize consensus articles
 * 3. (divided + allUncertain + incomplete) > 0 → extract for next basis level
 * 4. all finalized → register accepted articles
 *
 * Batch continuation is appended to seeAlso when applicable.
 */
export function generateReviewNextSteps(ctx: ReviewNextStepsContext): SuggestionResult | null {
  const { sessionId, statusResult: rs, mode = 'screening' } = ctx;

  if (rs.total === 0) return null;

  const result: SuggestionResult = { next: [], seeAlso: [] };

  if (mode === 'picking') {
    // Picking mode logic
    // 1. pending > 0: extract for title review
    if (rs.pending > 0) {
      result.next.push({
        command: `search-hub review extract --session ${sessionId} --basis title --filter pending --reviewer "<name>" --name title-picking`,
        description: `Extract ${rs.pending} pending articles for title review`,
      });
    }
    // 2. agreed-include > 0 (or all-uncertain): confirm at next basis level
    else if (rs.agreedInclude > 0 || rs.allUncertain > 0) {
      const nextBasis = detectNextBasis(rs.reviewers);
      const parts: string[] = [];
      if (rs.agreedInclude > 0) parts.push(`${rs.agreedInclude} picked`);
      if (rs.allUncertain > 0) parts.push(`${rs.allUncertain} uncertain`);
      const description = `${parts.join(' + ')} — confirm at ${nextBasis} level`;
      result.next.push({
        command: `search-hub review extract --session ${sessionId} --filter agreed-include,all-uncertain --basis ${nextBasis} --reviewer "<name>" --name ${nextBasis}-screening`,
        description,
      });
    }
    // 3. agreed > 0: finalize
    else {
      const agreed = rs.agreedInclude + rs.agreedExclude;
      if (agreed > 0) {
        result.next.push({
          command: `search-hub review finalize --session ${sessionId}`,
          description: `Finalize ${agreed} articles with consensus`,
        });
      }
      // 4. all finalized: export included
      else if (rs.finalized > 0 && rs.finalized === rs.total) {
        result.next.push({
          command: `search-hub review export --session ${sessionId} --only included`,
          description: `${rs.included} articles ready for export`,
        });
      }
      // No actionable state
      else {
        return null;
      }
    }
  } else {
    // Screening mode logic (default)
    // 1. pending > 0: title screening incomplete
    if (rs.pending > 0) {
      result.next.push({
        command: `search-hub review extract --session ${sessionId} --basis title --filter pending --reviewer "<name>" --name title-screening`,
        description: `Extract ${rs.pending} pending articles for title screening`,
      });
    }
    // 2. agreed > 0: suggest finalization
    else {
      const agreed = rs.agreedInclude + rs.agreedExclude;
      if (agreed > 0) {
        result.next.push({
          command: `search-hub review finalize --session ${sessionId}`,
          description: `Finalize ${agreed} articles with consensus`,
        });
      }
      // 3. divided, all-uncertain, or incomplete > 0: suggest further review
      else if (rs.divided > 0 || rs.allUncertain > 0 || rs.incomplete > 0) {
        const unresolved = rs.divided + rs.allUncertain + rs.incomplete;
        const nextBasis = detectNextBasis(rs.reviewers);
        result.next.push({
          command: `search-hub review extract --session ${sessionId} --filter divided,all-uncertain,incomplete --basis ${nextBasis} --reviewer "<name>" --name ${nextBasis}-screening`,
          description: `${unresolved} articles need ${nextBasis}-level review`,
        });
      }
      // 4. All finalized
      else if (rs.finalized > 0 && rs.finalized === rs.total) {
        result.next.push({
          command: `search-hub register ${sessionId} --reviewed`,
          description: 'Register accepted articles',
        });
      }
      // No actionable state
      else {
        return null;
      }
    }
  }

  // 5. Batch continuation (appended to seeAlso when applicable)
  if (
    ctx.limit !== undefined &&
    ctx.extractedCount !== undefined &&
    ctx.totalMatching !== undefined
  ) {
    const batch = computeBatchContinuation({
      sessionId,
      extractName: ctx.extractName,
      extractedCount: ctx.extractedCount,
      totalMatching: ctx.totalMatching,
      limit: ctx.limit,
      offset: ctx.offset,
    });
    if (batch) result.seeAlso.push(batch);
  }

  return result;
}
