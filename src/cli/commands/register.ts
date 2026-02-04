/**
 * Register command for reference-manager integration.
 * Registers search results with reference-manager CLI.
 */

import { join } from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline';
import { parse as parseYaml } from 'yaml';
import type { ProviderName, Article, Author } from '../../providers/base/types.js';
import { parseProviderNames } from '../utils/validation.js';
import { classifyStatus, type ReviewFile } from './review/types.js';

export interface RegisterCommandOptions {
  sessionId: string;
  providers?: ProviderName[];
  dryRun: boolean;
  withAbstracts: boolean;
  /** Register only reviewed articles with finalDecision='include' */
  reviewed?: boolean;
  /** Register all articles, ignoring reviews */
  all?: boolean;
  /** Skip confirmation prompts */
  force?: boolean;
  /** Suppress tips and suggestions */
  quiet?: boolean;
}

export interface CommandLineOptions {
  db?: string | undefined;
  dryRun?: boolean | undefined;
  withAbstracts?: boolean | undefined;
  reviewed?: boolean | undefined;
  all?: boolean | undefined;
  force?: boolean | undefined;
  quiet?: boolean | undefined;
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
    reviewed: options.reviewed ?? false,
    all: options.all ?? false,
    force: options.force ?? false,
    quiet: options.quiet ?? false,
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
  const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
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
  const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
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

/**
 * Parse author name string into Author object.
 * Simple heuristic: last word is family name, rest is given name.
 */
function parseAuthorName(name: string): Author {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { family: parts[0] ?? '' };
  }
  // Last part is family name (most common pattern in scientific citations)
  const family = parts.pop() ?? '';
  const given = parts.join(' ');
  return { family, given };
}

/**
 * Get articles with finalDecision='include' from review file.
 * Converts from ArticleEntry format to Article format.
 *
 * @throws Error if mergedFrom is missing or empty (indicates legacy review file)
 */
export async function getIncludedArticles(sessionId: string, sessionsDir: string): Promise<Article[]> {
  const reviewFile = await loadReviewFile(sessionId, sessionsDir);
  const articles = reviewFile.articles ?? [];

  return articles
    .filter((entry) => entry.finalDecision === 'include')
    .map((entry): Article => {
      // Validate mergedFrom exists
      if (!entry.mergedFrom) {
        throw new Error(
          `Article "${entry.title}" has mergedFrom missing. ` +
            `This may be a legacy review file created before source tracking was fixed. ` +
            `Please re-run 'review init' to regenerate the review file with source tracking.`
        );
      }
      if (entry.mergedFrom.length === 0) {
        throw new Error(
          `Article "${entry.title}" has empty mergedFrom array. ` +
            `This is an invalid state - please re-run 'review init' to regenerate.`
        );
      }

      const authors: Author[] = entry.authors
        ? entry.authors.split(/,\s*/).map(parseAuthorName)
        : [];

      // Get source from the first entry in mergedFrom
      const source = entry.mergedFrom[0]!.source as ProviderName;

      const article: Article = {
        title: entry.title,
        authors,
        source,
        retrievedAt: new Date().toISOString(),
      };
      // Only set optional fields if they have values
      if (entry.doi) article.doi = entry.doi;
      if (entry.pmid) article.pmid = entry.pmid;
      if (entry.scopusId) article.scopusId = entry.scopusId;
      if (entry.arxivId) article.arxivId = entry.arxivId;
      if (entry.ericId) article.ericId = entry.ericId;
      if (entry.abstract) article.abstract = entry.abstract;
      if (entry.year) article.publicationDate = entry.year;
      return article;
    });
}

/**
 * Format message when reviews exist but no flag specified.
 */
export function formatReviewRequiredMessage(summary: ReviewSummary, sessionId: string): string {
  return `This session has a review file.
  Status: ${summary.included} include / ${summary.excluded} exclude / ${summary.pending} pending

Please specify which articles to register:
  --reviewed   Register ${summary.included} included articles
  --all        Register all ${summary.total} articles (ignore reviews)

Example:
  search-hub register ${sessionId} --reviewed`;
}

/**
 * Format error when --reviewed used but no articles are included.
 */
export function formatNoIncludedArticlesError(summary: ReviewSummary, sessionId: string): string {
  return `Error: No articles marked as 'include' in reviews.
  Status: ${summary.included} include / ${summary.excluded} exclude / ${summary.pending} pending

Run 'search-hub review status ${sessionId}' for details.`;
}

/**
 * Format warning when pending articles exist with --reviewed.
 */
export function formatPendingWarning(summary: ReviewSummary): string {
  const articleWord = summary.pending === 1 ? 'article' : 'articles';
  return `Warning: ${summary.pending} ${articleWord} still pending review (will be skipped).
Registering ${summary.included} included articles...

Proceed? [Y/n]`;
}

/**
 * Format tip about review workflow for users who haven't used it.
 */
export function formatReviewWorkflowTip(sessionId: string): string {
  return `
Tip: For systematic reviews, consider using the review workflow:
  1. search-hub review init ${sessionId}
  2. (AI/human review in reviews.yaml)
  3. search-hub register ${sessionId} --reviewed`;
}


/**
 * Format note when --all is used with reviews.yaml present.
 */
export function formatIgnoringReviewsNote(total: number): string {
  return `Note: Ignoring review decisions. Registering all ${total} articles.`;
}

/**
 * Prompt user for Y/n confirmation.
 * Returns true if user confirms (Y/y/Enter), false otherwise.
 */
export async function confirmPrompt(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): Promise<boolean> {
  const rl = createInterface({
    input,
    output,
    terminal: false,
  });

  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      // Empty (Enter) or 'y' or 'yes' means confirm
      resolve(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
    });
  });
}
