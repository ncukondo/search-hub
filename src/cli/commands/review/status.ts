/**
 * review status command - Show review progress summary
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { classifyStatus, type ReviewFile } from './types.js';

export interface ReviewStatusOptions {
  sessionId: string;
}

export interface ReviewStatusResult {
  sessionId: string;
  total: number;
  pending: number;
  conflicting: number;
  needsFinal: number;
  finalized: number;
  included: number;
  excluded: number;
  /** Number of articles with at least one title-basis review */
  titleReviewed: number;
  /** Number of articles with at least one abstract-basis review */
  abstractReviewed: number;
}

/**
 * Load review file from session directory
 */
async function loadReviewFile(sessionDir: string): Promise<ReviewFile> {
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  return parseYaml(content) as ReviewFile;
}

/**
 * Execute review status command
 */
export async function executeReviewStatus(
  options: ReviewStatusOptions,
  sessionsDir: string
): Promise<ReviewStatusResult> {
  const sessionDir = join(sessionsDir, options.sessionId);
  const reviewFile = await loadReviewFile(sessionDir);

  const counts = {
    pending: 0,
    conflicting: 0,
    needsFinal: 0,
    finalized: 0,
    included: 0,
    excluded: 0,
    titleReviewed: 0,
    abstractReviewed: 0,
  };

  for (const article of reviewFile.articles) {
    const status = classifyStatus(article);

    switch (status) {
      case 'pending':
        counts.pending++;
        break;
      case 'conflicting':
        counts.conflicting++;
        break;
      case 'needs-final':
        counts.needsFinal++;
        break;
      case 'finalized':
        counts.finalized++;
        if (article.finalDecision === 'include') {
          counts.included++;
        } else {
          counts.excluded++;
        }
        break;
    }

    // Count basis-level reviews
    const reviews = article.reviews ?? [];
    if (reviews.some((r) => r.basis === 'title')) {
      counts.titleReviewed++;
    }
    if (reviews.some((r) => r.basis === 'abstract')) {
      counts.abstractReviewed++;
    }
  }

  return {
    sessionId: options.sessionId,
    total: reviewFile.articles.length,
    ...counts,
  };
}

/**
 * Format status result as human-readable string
 */
export function formatStatusOutput(result: ReviewStatusResult): string {
  const id = result.sessionId;
  const reviewed = result.total - result.pending;
  const lines = [
    `Review Progress: ${id}`,
    `  Total:        ${result.total}`,
    `  Pending:      ${result.pending}  (no reviews)`,
    `  Reviewed:     ${reviewed}  (title: ${result.titleReviewed}, abstract: ${result.abstractReviewed})`,
    `  Conflicting:  ${result.conflicting}  (reviewers disagree)`,
    `  Needs Final:  ${result.needsFinal}  (reviewed but no finalDecision)`,
    `  Finalized:    ${result.finalized}  (include: ${result.included}, exclude: ${result.excluded})`,
    '',
    '────────────────────────────────────────────────',
    'AI Agent Workflow:',
    '  Phase 1 (title screening):',
    `    extract:  search-hub review extract --session ${id} --name title-screening --basis title --reviewer "ai:name"`,
    `    mark:     search-hub review mark --file <session>/for-review/title-screening/review.yaml --input decisions.json`,
    `    merge:    search-hub review merge --session ${id} --name title-screening`,
    '',
    '  Phase 2 (abstract screening):',
    `    extract:  search-hub review extract --session ${id} --name abstract-screening --basis abstract --filter uncertain --reviewer "ai:name"`,
    `    mark:     search-hub review mark --file <session>/for-review/abstract-screening/review.yaml --input decisions.json`,
    `    merge:    search-hub review merge --session ${id} --name abstract-screening`,
    '────────────────────────────────────────────────',
  ];
  return lines.join('\n');
}
