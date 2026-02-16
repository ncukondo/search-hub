/**
 * review status command - Show review progress summary
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { classifyStatus, type ReviewFile, type ReviewerRecord } from './types.js';

export interface ReviewStatusOptions {
  sessionId: string;
}

export interface ReviewStatusResult {
  sessionId: string;
  total: number;
  pending: number;
  incomplete: number;
  allUncertain: number;
  agreedInclude: number;
  agreedExclude: number;
  divided: number;
  finalized: number;
  included: number;
  excluded: number;
  /** Registered reviewers from the review file */
  reviewers: ReviewerRecord[];
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

  const reviewers = reviewFile.reviewers ?? [];
  const counts = {
    pending: 0,
    incomplete: 0,
    allUncertain: 0,
    agreedInclude: 0,
    agreedExclude: 0,
    divided: 0,
    finalized: 0,
    included: 0,
    excluded: 0,
  };

  for (const article of reviewFile.articles) {
    const status = classifyStatus(article, reviewers);

    switch (status) {
      case 'pending':
        counts.pending++;
        break;
      case 'incomplete':
        counts.incomplete++;
        break;
      case 'all-uncertain':
        counts.allUncertain++;
        break;
      case 'agreed-include':
        counts.agreedInclude++;
        break;
      case 'agreed-exclude':
        counts.agreedExclude++;
        break;
      case 'divided':
        counts.divided++;
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
  }

  return {
    sessionId: options.sessionId,
    total: reviewFile.articles.length,
    reviewers,
    ...counts,
  };
}

/**
 * Format status result as human-readable string
 */
export function formatStatusOutput(result: ReviewStatusResult): string {
  const id = result.sessionId;
  const agreed = result.agreedInclude + result.agreedExclude;
  const lines = [
    `Review Progress: ${id}`,
    `  Total:           ${result.total}`,
    `  Pending:         ${result.pending}`,
    `  Incomplete:      ${result.incomplete}`,
    `  All-uncertain:   ${result.allUncertain}`,
    `  Agreed:          ${agreed}  (include: ${result.agreedInclude}, exclude: ${result.agreedExclude})`,
    `  Divided:         ${result.divided}`,
    `  Finalized:       ${result.finalized}  (include: ${result.included}, exclude: ${result.excluded})`,
  ];

  if (result.reviewers.length > 0) {
    lines.push('');
    lines.push('Reviewers:');
    for (const r of result.reviewers) {
      lines.push(`  ${r.name}  (${r.basis})`);
    }
  }

  return lines.join('\n');
}
