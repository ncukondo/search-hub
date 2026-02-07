/**
 * Dynamic next steps generation for review workflow.
 * Generates context-aware suggestions based on current article status distribution.
 */

import type { ReviewStatusResult } from './status.js';
import type { ReviewBasis } from './types.js';
import type { SuggestionResult } from '../../suggestions/types.js';

export interface ReviewNextStepsContext {
  sessionId: string;
  statusResult: ReviewStatusResult;
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
 * 3. (conflicting + uncertain + incomplete) > 0 → extract for next basis level
 * 4. all finalized → register accepted articles
 *
 * Batch continuation is appended to seeAlso when applicable.
 */
export function generateReviewNextSteps(ctx: ReviewNextStepsContext): SuggestionResult | null {
  const { sessionId, statusResult: rs } = ctx;

  if (rs.total === 0) return null;

  const result: SuggestionResult = { next: [], seeAlso: [] };

  // 1. pending > 0: title screening incomplete
  if (rs.pending > 0) {
    result.next.push({
      command: `search-hub review extract --session ${sessionId} --basis title --filter pending --name title-screening`,
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
    // 3. conflicting, uncertain, or incomplete > 0: suggest further review
    else if (rs.conflicting > 0 || rs.uncertain > 0 || rs.incomplete > 0) {
      const unresolved = rs.conflicting + rs.uncertain + rs.incomplete;
      const nextBasis = detectNextBasis(rs.reviewers);
      result.next.push({
        command: `search-hub review extract --session ${sessionId} --filter conflicting,uncertain,incomplete --basis ${nextBasis} --name ${nextBasis}-screening`,
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

  // 5. Batch continuation (appended to seeAlso when applicable)
  if (
    ctx.limit !== undefined &&
    ctx.extractedCount !== undefined &&
    ctx.totalMatching !== undefined
  ) {
    const nextOffset = (ctx.offset ?? 0) + ctx.extractedCount;
    const remaining = ctx.totalMatching - nextOffset;
    if (remaining > 0) {
      const nextName = ctx.extractName ? `${ctx.extractName}-next` : 'next-batch';
      result.seeAlso.push({
        command: `search-hub review extract --session ${sessionId} --offset ${nextOffset} --limit ${ctx.limit} --name ${nextName}`,
        description: `${remaining} articles remaining — extract next batch`,
      });
    }
  }

  return result;
}
