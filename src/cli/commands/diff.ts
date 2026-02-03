import type { Article } from '../../providers/base/types.js';
import { getArticleKeys } from './session-utils.js';

export interface DiffResult {
  session1Count: number;
  session2Count: number;
  added: Article[];
  removed: Article[];
  common: Article[];
}

/**
 * Compute the diff between two sets of articles.
 *
 * Articles are matched by identifiers (DOI, PMID, arXiv ID, Scopus ID, ERIC ID).
 * Two articles are considered the same if they share any identifier.
 * Articles without identifiers cannot be matched.
 */
export function computeDiff(session1: Article[], session2: Article[]): DiffResult {
  // Build a set of all identifier keys from session1
  const session1Keys = new Set<string>();
  for (const article of session1) {
    for (const key of getArticleKeys(article)) {
      session1Keys.add(key);
    }
  }

  // Build a set of all identifier keys from session2
  const session2Keys = new Set<string>();
  for (const article of session2) {
    for (const key of getArticleKeys(article)) {
      session2Keys.add(key);
    }
  }

  // Classify session1 articles as common or removed
  const common: Article[] = [];
  const removed: Article[] = [];
  for (const article of session1) {
    const keys = getArticleKeys(article);
    if (keys.length === 0) {
      // No identifiers - cannot match, treat as removed
      removed.push(article);
      continue;
    }
    const isInSession2 = keys.some((key) => session2Keys.has(key));
    if (isInSession2) {
      common.push(article);
    } else {
      removed.push(article);
    }
  }

  // Classify session2 articles as added (those not in session1)
  const added: Article[] = [];
  for (const article of session2) {
    const keys = getArticleKeys(article);
    if (keys.length === 0) {
      // No identifiers - cannot match, treat as added
      added.push(article);
      continue;
    }
    const isInSession1 = keys.some((key) => session1Keys.has(key));
    if (!isInSession1) {
      added.push(article);
    }
  }

  return {
    session1Count: session1.length,
    session2Count: session2.length,
    added,
    removed,
    common,
  };
}

export type ShowFilter = 'added' | 'removed' | 'common';

/**
 * Extract a year string from publicationDate, or return empty string.
 */
function extractYear(publicationDate: string | undefined): string {
  if (!publicationDate) return '';
  const year = publicationDate.substring(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

/**
 * Format an article line for display.
 */
function formatArticleLine(prefix: string, article: Article): string {
  const year = extractYear(article.publicationDate);
  const yearPart = year ? `[${year}] ` : '';
  return `  ${prefix} ${yearPart}${article.title}`;
}

/**
 * Format diff result as human-readable text.
 */
export function formatDiff(
  diff: DiffResult,
  session1Id: string,
  session2Id: string,
  show?: ShowFilter,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`Diff: ${session1Id} → ${session2Id}`);
  lines.push(`  Session 1: ${diff.session1Count} articles (${session1Id})`);
  lines.push(`  Session 2: ${diff.session2Count} articles (${session2Id})`);
  lines.push('');

  // Summary counts
  lines.push(`  Common:  ${diff.common.length} articles`);
  lines.push(`  Added:   ${diff.added.length} articles (in ${session2Id} but not ${session1Id})`);
  lines.push(`  Removed: ${diff.removed.length} articles (in ${session1Id} but not ${session2Id})`);

  // Article lists based on show filter
  const showAdded = !show || show === 'added';
  const showRemoved = !show || show === 'removed';
  const showCommon = show === 'common';

  if (showAdded && diff.added.length > 0) {
    lines.push('');
    lines.push(`Added (+${diff.added.length}):`);
    for (const article of diff.added) {
      lines.push(formatArticleLine('+', article));
    }
  }

  if (showRemoved && diff.removed.length > 0) {
    lines.push('');
    lines.push(`Removed (-${diff.removed.length}):`);
    for (const article of diff.removed) {
      lines.push(formatArticleLine('-', article));
    }
  }

  if (showCommon && diff.common.length > 0) {
    lines.push('');
    lines.push(`Common (${diff.common.length}):`);
    for (const article of diff.common) {
      lines.push(formatArticleLine('=', article));
    }
  }

  return lines.join('\n');
}

/**
 * Format diff result as JSON.
 */
interface DiffJsonOutput {
  session1: string;
  session2: string;
  summary: {
    session1Count: number;
    session2Count: number;
    commonCount: number;
    addedCount: number;
    removedCount: number;
  };
  added?: Article[];
  removed?: Article[];
  common?: Article[];
}

export function formatDiffJson(
  diff: DiffResult,
  session1Id: string,
  session2Id: string,
  show?: ShowFilter,
): string {
  const result: DiffJsonOutput = {
    session1: session1Id,
    session2: session2Id,
    summary: {
      session1Count: diff.session1Count,
      session2Count: diff.session2Count,
      commonCount: diff.common.length,
      addedCount: diff.added.length,
      removedCount: diff.removed.length,
    },
  };

  if (!show || show === 'added') {
    result.added = diff.added;
  }
  if (!show || show === 'removed') {
    result.removed = diff.removed;
  }
  if (!show || show === 'common') {
    result.common = diff.common;
  }

  return JSON.stringify(result, null, 2);
}
