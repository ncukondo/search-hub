/**
 * Review workflow types for article assessment tracking
 */

import type { ArticleFulltextRef } from '../../../fulltext/types.js';

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
  finalDecision?: 'include' | 'exclude';

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
  articles: ArticleEntry[];
  /** Registry of reviewers who participated at each basis level */
  reviewers?: ReviewerRecord[];
}

/**
 * Work file article entry for AI agent workflow
 */
export interface WorkFileArticle {
  id: string;
  title: string;
  abstract?: string;
  decision: ReviewDecision | null;
  comment: string;
}

/**
 * Work file structure for AI agent workflow
 */
export interface WorkFile {
  sessionId: string;
  basis: ReviewBasis;
  reviewer: string;
  articles: WorkFileArticle[];
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
  if (entry.finalDecision !== undefined) {
    return 'finalized';
  }

  // No reviews = pending (reviews can be null from YAML parsing with only comments)
  const reviews = entry.reviews ?? [];
  if (reviews.length === 0) {
    return 'pending';
  }

  // 3. Check for incomplete (registered reviewer missing)
  if (registeredReviewers && registeredReviewers.length > 0) {
    const reviewerNames = new Set(reviews.map((r) => r.reviewer));
    const hasAllReviewers = registeredReviewers.every((reg) =>
      reviewerNames.has(reg.name)
    );
    if (!hasAllReviewers) {
      return 'incomplete';
    }
  }

  // Get decisions from reviews that have them
  const decisions = reviews
    .filter((r) => r.decision !== undefined)
    .map((r) => r.decision!);

  if (decisions.length === 0) {
    // All reviews lack a decision — treat as pending-like, but has reviews
    return 'agreed-include'; // fallback: shouldn't normally happen
  }

  // 4. Check for conflicts: both include and exclude present
  const hasInclude = decisions.includes('include');
  const hasExclude = decisions.includes('exclude');
  if (hasInclude && hasExclude) {
    return 'conflicting';
  }

  // 5. Any uncertain?
  const hasUncertain = decisions.includes('uncertain');
  if (hasUncertain) {
    return 'uncertain';
  }

  // 6. All include?
  if (decisions.every((d) => d === 'include')) {
    return 'agreed-include';
  }

  // 7. All exclude?
  if (decisions.every((d) => d === 'exclude')) {
    return 'agreed-exclude';
  }

  // Shouldn't reach here, but fallback
  return 'uncertain';
}
