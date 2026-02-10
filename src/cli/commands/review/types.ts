/**
 * Review workflow types for article assessment tracking
 */

import type { ArticleFulltextRef } from '@ncukondo/academic-fulltext';

export type ReviewDecision = 'include' | 'exclude' | 'uncertain';

/**
 * Basis of the review decision (what information was used)
 */
export type ReviewBasis = 'title' | 'abstract' | 'fulltext';

/**
 * Individual assessment of an article by a reviewer
 */
export interface Review {
  /** Reviewer identifier: "human:name" or "ai:name" */
  reviewer: string;
  /** Assessment decision */
  decision?: ReviewDecision;
  /** Basis of the decision (what information was used) */
  basis?: ReviewBasis;
  /** Optional comment or reason */
  comment?: string;
  /** ISO 8601 timestamp (optional - auto-assigned on merge if not provided) */
  timestamp?: string;
}

/**
 * Source information for merged duplicates
 */
export interface MergedSource {
  source: string;
  pmid?: string;
  doi?: string;
  scopusId?: string;
  arxivId?: string;
  ericId?: string;
}

/**
 * Article entry with identifiers, bibliographic info, and reviews
 */
export interface ArticleEntry {
  // Identifiers (at least one required for matching)
  doi?: string;
  pmid?: string;
  scopusId?: string;
  arxivId?: string;
  ericId?: string;

  // Bibliographic info (for reviewer reference)
  title: string;
  authors?: string;
  year?: string;
  abstract?: string;

  // Deduplication tracking
  mergedFrom?: MergedSource[];

  // Review data
  reviews: Review[];
  /** Historical reviews (only in extracted ReviewFiles, never in master file) */
  reviewHistory?: Review[];
  finalDecision?: 'include' | 'exclude' | null;

  // Fulltext reference (set by fulltext init/sync)
  fulltext?: ArticleFulltextRef;
}

/**
 * Top-level structure of the reviews.yaml file
 */
export interface ReviewerRecord {
  name: string;
  basis: ReviewBasis;
}

export interface ReviewFile {
  sessionId: string;
  /** Path to inclusion criteria file */
  criteria?: string;
  /** Reviewer identifier (only in extracted ReviewFiles) */
  reviewer?: string;
  /** Basis level for screening (only in extracted ReviewFiles) */
  basis?: ReviewBasis;
  articles: ArticleEntry[];
  /** Registry of reviewers who participated at each basis level */
  reviewers?: ReviewerRecord[];
}

/**
 * Work file article entry for AI agent workflow
 */
/** @deprecated Use ReviewFile format with reviews[] instead. Kept for backward compatibility. */
export interface WorkFileArticle {
  id: string;
  title: string;
  abstract?: string;
  /** Fulltext directory name (only for fulltext basis) */
  fulltext?: string;
  decision: ReviewDecision | null;
  comment: string;
}

/**
 * Work file structure for AI agent workflow
 */
/** @deprecated Use ReviewFile format with basis field instead. Kept for backward compatibility. */
export interface WorkFile {
  sessionId: string;
  basis: ReviewBasis;
  reviewer: string;
  articles: WorkFileArticle[];
}

/**
 * Basis priority rank: fulltext > abstract > title > undefined
 */
const BASIS_RANK: Record<string, number> = {
  title: 1,
  abstract: 2,
  fulltext: 3,
};

export function basisRank(basis: ReviewBasis | undefined): number {
  if (basis === undefined) return 0;
  return BASIS_RANK[basis] ?? 0;
}

/**
 * Review status classification (7-state model)
 */
export type ReviewStatus =
  | 'pending'
  | 'incomplete'
  | 'uncertain'
  | 'agreed-include'
  | 'agreed-exclude'
  | 'conflicting'
  | 'finalized';

/**
 * Classify the review status of an article entry
 *
 * Classification logic (in order):
 * 1. finalDecision set?           → finalized
 * 2. No reviews?                  → pending
 * 3. Registered reviewer missing? → incomplete
 * 4. include AND exclude present? → conflicting
 * 5. Any uncertain?               → uncertain
 * 6. All include?                 → agreed-include
 * 7. All exclude?                 → agreed-exclude
 */
export function classifyStatus(
  entry: ArticleEntry,
  registeredReviewers?: ReviewerRecord[]
): ReviewStatus {
  // 1. Finalized takes precedence
  if (entry.finalDecision !== undefined && entry.finalDecision !== null) {
    return 'finalized';
  }

  // No reviews = pending (reviews can be null from YAML parsing with only comments)
  const reviews = entry.reviews ?? [];
  if (reviews.length === 0) {
    return 'pending';
  }

  // 3. Check for incomplete (registered reviewer missing)
  // Only check reviewers whose registered basis ≤ article's highest reviewed basis
  if (registeredReviewers && registeredReviewers.length > 0) {
    const reviewerNames = new Set(reviews.map((r) => r.reviewer));
    let highestReviewedRank = 0;
    for (const r of reviews) {
      highestReviewedRank = Math.max(highestReviewedRank, basisRank(r.basis));
    }
    // When reviews have no basis (legacy), check all registered reviewers
    const applicableReviewers = highestReviewedRank === 0
      ? registeredReviewers
      : registeredReviewers.filter(
          (reg) => basisRank(reg.basis) <= highestReviewedRank
        );
    const hasAllReviewers = applicableReviewers.every((reg) =>
      reviewerNames.has(reg.name)
    );
    if (applicableReviewers.length > 0 && !hasAllReviewers) {
      return 'incomplete';
    }
  }

  // Get reviews that have decisions
  const reviewsWithDecisions = reviews.filter((r) => r.decision !== undefined);

  if (reviewsWithDecisions.length === 0) {
    // All reviews lack a decision — treat as pending
    return 'pending';
  }

  // Basis-priority resolution:
  // "uncertain" at a lower basis means "need more info" (escalate).
  // A definitive decision at a higher basis resolves that uncertainty.
  //
  // Algorithm:
  // 1. Find the highest basis rank among all definitive (include/exclude) reviews
  // 2. For each reviewer, compute their effective decision:
  //    - Take their highest-basis definitive decision if they have one
  //    - Otherwise, keep uncertain only if their uncertain rank >= highest definitive rank
  //      (i.e., no higher-basis definitive exists globally to resolve it)
  // 3. Reviewers whose only reviews are uncertain at a lower basis than the
  //    highest global definitive are excluded from consensus (their uncertainty was resolved)

  // Find highest definitive basis rank across ALL reviews
  let highestDefinitiveRank = 0;
  for (const r of reviewsWithDecisions) {
    if (r.decision !== 'uncertain') {
      highestDefinitiveRank = Math.max(highestDefinitiveRank, basisRank(r.basis));
    }
  }

  // For each reviewer, compute effective decision
  const reviewerMap = new Map<string, { decision: ReviewDecision; rank: number }>();
  for (const r of reviewsWithDecisions) {
    const rank = basisRank(r.basis);
    const existing = reviewerMap.get(r.reviewer);
    if (!existing) {
      reviewerMap.set(r.reviewer, { decision: r.decision!, rank });
    } else {
      // Prefer definitive over uncertain
      if (r.decision !== 'uncertain' && existing.decision === 'uncertain') {
        reviewerMap.set(r.reviewer, { decision: r.decision!, rank });
      } else if (r.decision !== 'uncertain' && existing.decision !== 'uncertain' && rank > existing.rank) {
        // Higher-basis definitive overrides lower-basis definitive
        reviewerMap.set(r.reviewer, { decision: r.decision!, rank });
      } else if (r.decision === 'uncertain' && existing.decision === 'uncertain' && rank > existing.rank) {
        reviewerMap.set(r.reviewer, { decision: r.decision!, rank });
      }
    }
  }

  // Collect effective decisions, excluding reviewers whose effective decision
  // is at a lower basis than the highest global definitive
  const effectiveDecisions: ReviewDecision[] = [];
  for (const { decision, rank } of reviewerMap.values()) {
    if (rank < highestDefinitiveRank) {
      // This reviewer's decision is at a lower basis than the highest definitive — skip
      continue;
    }
    effectiveDecisions.push(decision);
  }

  if (effectiveDecisions.length === 0) {
    return 'pending';
  }

  // 4. Check for conflicts: both include and exclude present among effective decisions
  const hasInclude = effectiveDecisions.includes('include');
  const hasExclude = effectiveDecisions.includes('exclude');
  if (hasInclude && hasExclude) {
    return 'conflicting';
  }

  // 5. Any effective uncertain?
  const hasUncertain = effectiveDecisions.includes('uncertain');
  if (hasUncertain) {
    return 'uncertain';
  }

  // 6. All include?
  if (effectiveDecisions.every((d) => d === 'include')) {
    return 'agreed-include';
  }

  // 7. All exclude (only remaining possibility after ruling out conflicts and uncertain)
  return 'agreed-exclude';
}
