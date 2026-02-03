/**
 * Register command for reference-manager integration.
 * Registers search results with reference-manager CLI.
 */

import { join } from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { ProviderName, Article } from '../../providers/base/types.js';
import { parseProviderNames } from '../utils/validation.js';
import { classifyStatus, type ReviewFile, type ArticleEntry } from './review/types.js';

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

  // Details about articles without DOI/PMID
  if (withoutId.length > 0) {
    lines.push('');
    lines.push(
      `${withoutId.length} article${withoutId.length !== 1 ? 's' : ''} will be skipped (no DOI or PMID):`
    );

    const maxDisplay = 10;
    const displayed = withoutId.slice(0, maxDisplay);

    for (const article of displayed) {
      const truncatedTitle = article.title.length > 50
        ? article.title.substring(0, 50) + '...'
        : article.title;

      const altIds = getAlternativeIds(article);
      const hasAltIds = altIds.length > 0 ? `, has: ${altIds.join(', ')}` : '';

      lines.push(`  - "${truncatedTitle}" (source: ${article.source}${hasAltIds})`);
    }

    if (withoutId.length > maxDisplay) {
      lines.push(`  ... and ${withoutId.length - maxDisplay} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Get alternative (non-DOI/PMID) identifiers for an article.
 */
function getAlternativeIds(article: Article): string[] {
  const ids: string[] = [];
  if (article.arxivId) ids.push(`arxiv:${article.arxivId}`);
  if (article.ericId) ids.push(`eric:${article.ericId}`);
  if (article.scopusId) ids.push(`scopus:${article.scopusId}`);
  return ids;
}

/**
 * Summary of review decisions for a session.
 */
export interface ReviewSummary {
  /** Total articles in review file */
  total: number;
  /** Articles with finalDecision='include' */
  included: number;
  /** Articles with finalDecision='exclude' */
  excluded: number;
  /** Articles without finalDecision (pending, needs-final, conflicting) */
  pending: number;
}

/**
 * Check if a session has a reviews.yaml file.
 */
export async function hasReviewFile(sessionId: string, sessionsDir: string): Promise<boolean> {
  const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
  try {
    await access(reviewsPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and parse the review file for a session.
 */
async function loadReviewFile(sessionId: string, sessionsDir: string): Promise<ReviewFile> {
  const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  return parseYaml(content) as ReviewFile;
}

/**
 * Get review summary (counts) for a session.
 * Throws if reviews.yaml does not exist.
 */
export async function getReviewSummary(sessionId: string, sessionsDir: string): Promise<ReviewSummary> {
  const reviewFile = await loadReviewFile(sessionId, sessionsDir);
  const articles = reviewFile.articles ?? [];

  const summary: ReviewSummary = {
    total: articles.length,
    included: 0,
    excluded: 0,
    pending: 0,
  };

  for (const article of articles) {
    const status = classifyStatus(article);

    if (status === 'finalized') {
      if (article.finalDecision === 'include') {
        summary.included++;
      } else {
        summary.excluded++;
      }
    } else {
      // pending, needs-final, conflicting all count as pending for registration
      summary.pending++;
    }
  }

  return summary;
}
