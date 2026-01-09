/**
 * Register command for reference-manager integration.
 * Registers search results with reference-manager CLI.
 */

import type { ProviderName } from '../../providers/base/types.js';
import type { Article } from '../../providers/base/types.js';
import { parseProviderNames } from '../utils/validation.js';

export interface RegisterCommandOptions {
  sessionId: string;
  providers?: ProviderName[];
  dryRun: boolean;
  withAbstracts: boolean;
}

export interface CommandLineOptions {
  db?: string | undefined;
  dryRun?: boolean | undefined;
  withAbstracts?: boolean | undefined;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Parse command line options into RegisterCommandOptions.
 */
export function parseRegisterOptions(
  sessionId: string,
  options: CommandLineOptions
): RegisterCommandOptions {
  const result: RegisterCommandOptions = {
    sessionId,
    dryRun: options.dryRun ?? false,
    withAbstracts: options.withAbstracts ?? false,
  };

  if (options.db) {
    result.providers = parseProviderNames(options.db);
  }

  return result;
}

/**
 * Validate register command input.
 */
export function validateRegisterInput(options: RegisterCommandOptions): ValidationResult {
  if (!options.sessionId || options.sessionId.trim() === '') {
    return {
      valid: false,
      error: 'A session ID is required',
    };
  }

  return { valid: true };
}

/**
 * Format registration summary for CLI output.
 */
export function formatRegistrationSummary(summary: {
  total: number;
  added: number;
  skipped: number;
  failed: number;
  noId: number;
}): string {
  const lines: string[] = ['Registration complete:'];

  // Added
  lines.push(`  ✓ ${summary.added} added`);

  // Duplicates (skipped)
  if (summary.skipped > 0) {
    lines.push(`  ⚠ ${summary.skipped} duplicates (already in library)`);
  }

  // Failed
  if (summary.failed > 0) {
    lines.push(`  ✗ ${summary.failed} failed`);
  }

  // No ID (skipped)
  if (summary.noId > 0) {
    lines.push(`  - ${summary.noId} skipped (no identifier)`);
  }

  return lines.join('\n');
}

/**
 * Get registration identifier for an article.
 * PMID is preferred over DOI for better metadata quality.
 */
function getRegistrationId(article: Article): string | null {
  if (article.pmid) {
    return `pmid:${article.pmid}`;
  }
  if (article.doi) {
    return article.doi;
  }
  return null;
}

/**
 * Format dry run output showing what would be registered.
 */
export function formatDryRunOutput(articles: Article[]): string {
  const withId: Array<{ article: Article; id: string }> = [];
  const withoutId: Article[] = [];

  for (const article of articles) {
    const id = getRegistrationId(article);
    if (id) {
      withId.push({ article, id });
    } else {
      withoutId.push(article);
    }
  }

  const lines: string[] = [];

  // Summary
  lines.push(
    `Would register ${withId.length} reference${withId.length !== 1 ? 's' : ''}:`
  );

  // List articles with IDs
  for (const { id, article } of withId) {
    const title = article.title.length > 60
      ? article.title.substring(0, 57) + '...'
      : article.title;
    lines.push(`  - ${id}: ${title}`);
  }

  // Note about articles without IDs
  if (withoutId.length > 0) {
    lines.push('');
    lines.push(
      `${withoutId.length} article${withoutId.length !== 1 ? 's' : ''} will be skipped (no identifier)`
    );
  }

  return lines.join('\n');
}
