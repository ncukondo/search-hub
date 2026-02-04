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
  const lines = [
    `Review Progress: ${id}`,
    `  Total:        ${result.total}`,
    `  Pending:      ${result.pending}  (no reviews)`,
    `  Conflicting:  ${result.conflicting}  (reviewers disagree)`,
    `  Needs Final:  ${result.needsFinal}  (reviewed but no finalDecision)`,
    `  Finalized:    ${result.finalized}  (include: ${result.included}, exclude: ${result.excluded})`,
    '',
    '────────────────────────────────────────────────',
    'AI Agent Workflow:',
    '  Phase 1 (title screening):',
    `    extract:  search-hub review extract --session ${id} --basis title --reviewer "ai:name" -o phase1.yaml`,
    `    mark:     search-hub review mark --file phase1.yaml --input decisions.json`,
    `    merge:    search-hub review merge --session ${id} phase1.yaml`,
    '',
    '  Phase 2 (abstract screening):',
    `    extract:  search-hub review extract --session ${id} --basis abstract --filter uncertain --reviewer "ai:name" -o phase2.yaml`,
    `    mark:     search-hub review mark --file phase2.yaml --input decisions.json`,
    `    merge:    search-hub review merge --session ${id} phase2.yaml`,
    '────────────────────────────────────────────────',
  ];
  return lines.join('\n');
}
