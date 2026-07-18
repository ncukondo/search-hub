import type { Article } from '../../providers/base/types.js';
import type { QueryAST, FieldType, TermBlock } from '../../query/types.js';
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
 * Options for formatting diff with query information.
 */
export interface FormatDiffOptions {
  queryDiff?: QueryDiff | undefined;
  noQueryDiff?: boolean | undefined;
  showQueryDiffPlaceholder?: boolean | undefined;
}

/**
 * Format diff result as human-readable text.
 */
export function formatDiff(
  diff: DiffResult,
  session1Id: string,
  session2Id: string,
  show?: ShowFilter,
  options?: FormatDiffOptions,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`Diff: ${session1Id} → ${session2Id}`);
  lines.push(`  Session 1: ${diff.session1Count} articles (${session1Id})`);
  lines.push(`  Session 2: ${diff.session2Count} articles (${session2Id})`);
  lines.push('');

  // Query changes section (if available and not disabled)
  const shouldShowQueryDiff = options?.queryDiff && !options?.noQueryDiff;
  const shouldShowPlaceholder =
    options?.showQueryDiffPlaceholder && !options?.queryDiff && !options?.noQueryDiff;

  if (shouldShowPlaceholder) {
    lines.push('Query changes: (query data not available)');
    lines.push('');
  } else if (shouldShowQueryDiff) {
    lines.push(formatQueryDiff(options.queryDiff!));
    lines.push('');
    lines.push('Result changes:');
  }

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
  queryDiff?: QueryDiff;
  added?: Article[];
  removed?: Article[];
  common?: Article[];
}

export function formatDiffJson(
  diff: DiffResult,
  session1Id: string,
  session2Id: string,
  show?: ShowFilter,
  options?: FormatDiffOptions,
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

  // Add queryDiff if available and not disabled
  if (options?.queryDiff && !options?.noQueryDiff) {
    result.queryDiff = options.queryDiff;
  }

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

/**
 * Diff result for a single query block.
 */
export interface BlockDiff {
  index: number;
  field: FieldType;
  added: string[];
  removed: string[];
  meshAdded?: string[];
  meshRemoved?: string[];
  emtreeAdded?: string[];
  emtreeRemoved?: string[];
  excludeAdded?: string[];
  excludeRemoved?: string[];
  hasChanges: boolean;
  isNew?: boolean;
  isRemoved?: boolean;
}

/**
 * Diff result for query filters.
 */
export interface FilterDiff {
  yearFromChanged: boolean;
  oldYearFrom?: number | undefined;
  newYearFrom?: number | undefined;
  yearToChanged: boolean;
  oldYearTo?: number | undefined;
  newYearTo?: number | undefined;
  languagesAdded: string[];
  languagesRemoved: string[];
}

/**
 * Complete query diff result.
 */
export interface QueryDiff {
  blocks: BlockDiff[];
  filters: FilterDiff;
}

/**
 * Compute the set difference: elements in arr2 not in arr1.
 */
function setDiff(arr1: string[], arr2: string[]): string[] {
  const set1 = new Set(arr1);
  return arr2.filter((item) => !set1.has(item));
}

/**
 * Compare two query blocks and return the differences.
 */
function compareBlocks(
  block1: TermBlock | undefined,
  block2: TermBlock | undefined,
  index: number,
  field: FieldType,
): BlockDiff {
  const emptyTerms = {
    keywords: [] as string[],
    mesh: [] as string[],
    emtree: [] as string[],
    exclude: [] as string[],
  };
  const terms1 = block1 ?? emptyTerms;
  const terms2 = block2 ?? emptyTerms;

  const added = setDiff(terms1.keywords ?? [], terms2.keywords ?? []);
  const removed = setDiff(terms2.keywords ?? [], terms1.keywords ?? []);
  const meshAdded = setDiff(terms1.mesh ?? [], terms2.mesh ?? []);
  const meshRemoved = setDiff(terms2.mesh ?? [], terms1.mesh ?? []);
  const emtreeAdded = setDiff(terms1.emtree ?? [], terms2.emtree ?? []);
  const emtreeRemoved = setDiff(terms2.emtree ?? [], terms1.emtree ?? []);
  const excludeAdded = setDiff(terms1.exclude ?? [], terms2.exclude ?? []);
  const excludeRemoved = setDiff(terms2.exclude ?? [], terms1.exclude ?? []);

  const hasChanges =
    added.length > 0 ||
    removed.length > 0 ||
    meshAdded.length > 0 ||
    meshRemoved.length > 0 ||
    emtreeAdded.length > 0 ||
    emtreeRemoved.length > 0 ||
    excludeAdded.length > 0 ||
    excludeRemoved.length > 0;

  const result: BlockDiff = {
    index,
    field,
    added,
    removed,
    hasChanges,
  };

  if (meshAdded.length > 0 || meshRemoved.length > 0) {
    result.meshAdded = meshAdded;
    result.meshRemoved = meshRemoved;
  }
  if (emtreeAdded.length > 0 || emtreeRemoved.length > 0) {
    result.emtreeAdded = emtreeAdded;
    result.emtreeRemoved = emtreeRemoved;
  }
  if (excludeAdded.length > 0 || excludeRemoved.length > 0) {
    result.excludeAdded = excludeAdded;
    result.excludeRemoved = excludeRemoved;
  }

  if (!block1) {
    result.isNew = true;
    result.hasChanges = true;
  }
  if (!block2) {
    result.isRemoved = true;
    result.hasChanges = true;
  }

  return result;
}

/**
 * Compute the diff between two QueryAST objects.
 */
export function computeQueryDiff(query1: QueryAST, query2: QueryAST): QueryDiff {
  const blocks: BlockDiff[] = [];

  const maxBlocks = Math.max(query1.blocks.length, query2.blocks.length);

  for (let i = 0; i < maxBlocks; i++) {
    const block1 = query1.blocks[i];
    const block2 = query2.blocks[i];

    const field = block2?.field ?? block1?.field ?? 'all';
    const blockDiff = compareBlocks(block1?.terms, block2?.terms, i, field);
    blocks.push(blockDiff);
  }

  // Compare filters
  const filters: FilterDiff = {
    yearFromChanged: query1.filters.yearFrom !== query2.filters.yearFrom,
    yearToChanged: query1.filters.yearTo !== query2.filters.yearTo,
    languagesAdded: setDiff(query1.filters.languages ?? [], query2.filters.languages ?? []),
    languagesRemoved: setDiff(query2.filters.languages ?? [], query1.filters.languages ?? []),
  };

  if (filters.yearFromChanged) {
    filters.oldYearFrom = query1.filters.yearFrom;
    filters.newYearFrom = query2.filters.yearFrom;
  }
  if (filters.yearToChanged) {
    filters.oldYearTo = query1.filters.yearTo;
    filters.newYearTo = query2.filters.yearTo;
  }

  return { blocks, filters };
}

/**
 * Format query diff as human-readable text.
 */
export function formatQueryDiff(queryDiff: QueryDiff): string {
  const lines: string[] = [];

  lines.push('Query changes:');

  // Format block changes
  for (const block of queryDiff.blocks) {
    const blockNum = block.index + 1;
    let blockHeader = `  Block ${blockNum} (${block.field})`;
    if (block.isNew) {
      blockHeader += ' (new block)';
    } else if (block.isRemoved) {
      blockHeader += ' (removed block)';
    }

    if (!block.hasChanges) {
      lines.push(`${blockHeader}: no changes`);
    } else {
      lines.push(`${blockHeader}:`);

      // Added keywords
      for (const keyword of block.added) {
        lines.push(`    + ${keyword}`);
      }

      // Removed keywords
      for (const keyword of block.removed) {
        lines.push(`    - ${keyword}`);
      }

      // MeSH changes
      if (block.meshAdded) {
        for (const term of block.meshAdded) {
          lines.push(`    + [MeSH] ${term}`);
        }
      }
      if (block.meshRemoved) {
        for (const term of block.meshRemoved) {
          lines.push(`    - [MeSH] ${term}`);
        }
      }

      // Emtree changes
      if (block.emtreeAdded) {
        for (const term of block.emtreeAdded) {
          lines.push(`    + [Emtree] ${term}`);
        }
      }
      if (block.emtreeRemoved) {
        for (const term of block.emtreeRemoved) {
          lines.push(`    - [Emtree] ${term}`);
        }
      }

      // Exclude changes
      if (block.excludeAdded) {
        for (const term of block.excludeAdded) {
          lines.push(`    + [exclude] ${term}`);
        }
      }
      if (block.excludeRemoved) {
        for (const term of block.excludeRemoved) {
          lines.push(`    - [exclude] ${term}`);
        }
      }
    }
  }

  // Format filter changes
  const hasFilterChanges =
    queryDiff.filters.yearFromChanged ||
    queryDiff.filters.yearToChanged ||
    queryDiff.filters.languagesAdded.length > 0 ||
    queryDiff.filters.languagesRemoved.length > 0;

  if (hasFilterChanges) {
    lines.push('');
    lines.push('  Filters:');

    if (queryDiff.filters.yearFromChanged) {
      const oldVal = queryDiff.filters.oldYearFrom ?? '(none)';
      const newVal = queryDiff.filters.newYearFrom ?? '(none)';
      lines.push(`    yearFrom: ${oldVal} → ${newVal}`);
    }

    if (queryDiff.filters.yearToChanged) {
      const oldVal = queryDiff.filters.oldYearTo ?? '(none)';
      const newVal = queryDiff.filters.newYearTo ?? '(none)';
      lines.push(`    yearTo: ${oldVal} → ${newVal}`);
    }

    if (
      queryDiff.filters.languagesAdded.length > 0 ||
      queryDiff.filters.languagesRemoved.length > 0
    ) {
      lines.push('    languages:');
      for (const lang of queryDiff.filters.languagesAdded) {
        lines.push(`      + ${lang}`);
      }
      for (const lang of queryDiff.filters.languagesRemoved) {
        lines.push(`      - ${lang}`);
      }
    }
  }

  return lines.join('\n');
}
