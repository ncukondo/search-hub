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
 * Review status classification
 */
export type ReviewStatus = 'pending' | 'conflicting' | 'needs-final' | 'finalized';

/**
 * Classify the review status of an article entry
 *
 * Status precedence:
 * 1. finalized - has finalDecision
 * 2. pending - no reviews
 * 3. conflicting - reviewers disagree
 * 4. needs-final - has reviews but no finalDecision
 */
export function classifyStatus(entry: ArticleEntry): ReviewStatus {
  // Finalized takes precedence
  if (entry.finalDecision !== undefined) {
    return 'finalized';
  }

  // No reviews = pending (reviews can be null from YAML parsing with only comments)
  const reviews = entry.reviews ?? [];
  if (reviews.length === 0) {
    return 'pending';
  }

  // Check for conflicts among reviews that have decisions
  const decisions = reviews
    .filter((r) => r.decision !== undefined)
    .map((r) => r.decision);

  if (decisions.length > 0) {
    const uniqueDecisions = new Set(decisions);
    if (uniqueDecisions.size > 1) {
      return 'conflicting';
    }
  }

  // Has reviews but no finalDecision
  return 'needs-final';
}
