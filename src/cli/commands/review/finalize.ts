/**
 * review finalize command - Auto-set finalDecision for articles with consensus
 */

import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { classifyStatus, type ReviewFile, type ReviewStatus } from './types.js';

export interface ReviewFinalizeOptions {
  sessionId: string;
  dryRun?: boolean;
  minReviewers?: number;
  decision?: 'include' | 'exclude';
}

export interface ReviewFinalizeResult {
  includedCount: number;
  excludedCount: number;
  skippedByStatus: Record<ReviewStatus, number>;
}

function createEmptySkippedByStatus(): Record<ReviewStatus, number> {
  return {
    pending: 0,
    incomplete: 0,
    'all-uncertain': 0,
    'agreed-include': 0,
    'agreed-exclude': 0,
    divided: 0,
    finalized: 0,
  };
}

/**
 * Execute review finalize command
 */
export async function executeReviewFinalize(
  options: ReviewFinalizeOptions,
  sessionsDir: string,
): Promise<ReviewFinalizeResult> {
  const sessionDir = join(sessionsDir, options.sessionId);
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  const reviewFile = parseYaml(content) as ReviewFile;

  const reviewers = reviewFile.reviewers ?? [];
  const minReviewers = options.minReviewers ?? 1;

  const result: ReviewFinalizeResult = {
    includedCount: 0,
    excludedCount: 0,
    skippedByStatus: createEmptySkippedByStatus(),
  };

  for (const article of reviewFile.articles) {
    const status = classifyStatus(article, reviewers);

    if (status === 'agreed-include' || status === 'agreed-exclude') {
      // Check decision filter
      const consensusDecision = status === 'agreed-include' ? 'include' : 'exclude';
      if (options.decision && options.decision !== consensusDecision) {
        result.skippedByStatus[status]++;
        continue;
      }

      // Check minimum reviewer count
      const reviews = article.reviews ?? [];
      const uniqueReviewers = new Set(reviews.map((r) => r.reviewer));
      if (uniqueReviewers.size < minReviewers) {
        result.skippedByStatus[status]++;
        continue;
      }

      if (!options.dryRun) {
        article.finalDecision = consensusDecision;
      }

      if (status === 'agreed-include') {
        result.includedCount++;
      } else {
        result.excludedCount++;
      }
    } else {
      result.skippedByStatus[status]++;
    }
  }

  // Write back if not dry-run
  if (!options.dryRun) {
    const yamlContent = stringifyYaml(reviewFile, { lineWidth: 0 });
    const schemaComment = `# yaml-language-server: $schema=./review.schema.json\n`;
    await writeFile(reviewsPath, schemaComment + yamlContent, 'utf-8');
  }

  return result;
}

/**
 * Format finalize result as human-readable string
 */
export function formatFinalizeOutput(
  result: ReviewFinalizeResult,
  options?: { dryRun?: boolean; decision?: 'include' | 'exclude' },
): string {
  const lines: string[] = [];

  if (options?.dryRun) {
    lines.push('Dry run - no changes made');
    lines.push('');
  }

  const total = result.includedCount + result.excludedCount;
  lines.push(
    `Finalized ${total} articles (${result.includedCount} include, ${result.excludedCount} exclude)`,
  );

  // Build skipped summary (only non-zero, non-agreed statuses)
  const skippedParts: string[] = [];
  if (result.skippedByStatus.pending > 0) {
    skippedParts.push(`${result.skippedByStatus.pending} pending`);
  }
  if (result.skippedByStatus.incomplete > 0) {
    skippedParts.push(`${result.skippedByStatus.incomplete} incomplete`);
  }
  if (result.skippedByStatus['all-uncertain'] > 0) {
    skippedParts.push(`${result.skippedByStatus['all-uncertain']} all-uncertain`);
  }
  if (result.skippedByStatus.divided > 0) {
    skippedParts.push(`${result.skippedByStatus.divided} divided`);
  }

  // Show filtered-out agreed counts when --decision is active
  if (options?.decision && result.skippedByStatus['agreed-include'] > 0) {
    skippedParts.push(`${result.skippedByStatus['agreed-include']} agreed-include (filtered)`);
  }
  if (options?.decision && result.skippedByStatus['agreed-exclude'] > 0) {
    skippedParts.push(`${result.skippedByStatus['agreed-exclude']} agreed-exclude (filtered)`);
  }

  if (skippedParts.length > 0) {
    lines.push(`Skipped: ${skippedParts.join(', ')}`);
  }

  return lines.join('\n');
}
