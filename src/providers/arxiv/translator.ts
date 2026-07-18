/**
 * arXiv Query Translator
 *
 * Translates ResolvedAST to arXiv-native query syntax.
 *
 * Field mappings:
 * - title → ti:
 * - abstract → abs:
 * - title_abstract → (ti: OR abs:) expansion
 * - author → au:
 * - all → all:
 * - keyword → not supported
 *
 * Boolean operators: AND, OR, ANDNOT (not standard NOT)
 * Date filter: submittedDate:[YYYYMMDDHHmm TO YYYYMMDDHHmm]
 * Category filter: cat:cs.AI
 */

import type { QueryBlock, FieldType, Operator, ResolvedAST } from '../../query/types.js';
import type { TranslatedQuery } from '../base/types.js';
import { collectUnsupportedVocabWarnings } from '../base/warnings.js';

/**
 * Field prefix mappings for arXiv API.
 */
const FIELD_PREFIXES: Partial<Record<FieldType, string>> = {
  title: 'ti:',
  abstract: 'abs:',
  author: 'au:',
  all: 'all:',
  // title_abstract requires expansion, not a direct prefix
  // keyword is not supported by arXiv
};

/**
 * Get the arXiv field prefix for a DSL field type.
 * Returns null if the field requires special handling or is unsupported.
 */
export function translateFieldPrefix(field: FieldType): string | null {
  return FIELD_PREFIXES[field] ?? null;
}

/**
 * Wrap a term in quotes if it contains spaces (phrase search).
 */
function quoteIfNeeded(term: string): string {
  return term.includes(' ') ? `"${term}"` : term;
}

/**
 * Translate terms with a field prefix.
 * Handles quoting of multi-word phrases.
 */
export function translateTerms(prefix: string, keywords: string[], operator: Operator): string {
  if (keywords.length === 0) {
    return '';
  }

  const translatedTerms = keywords.map((keyword) => `${prefix}${quoteIfNeeded(keyword)}`);

  if (translatedTerms.length === 1) {
    return translatedTerms[0]!;
  }

  return `(${translatedTerms.join(` ${operator} `)})`;
}

/**
 * Translate a single query block to arXiv syntax.
 * Returns an object with the main query part and optional ANDNOT clause.
 */
function translateBlock(block: QueryBlock): { query: string; notClause: string | null } {
  const { field, terms, operator } = block;

  // arXiv only uses keywords; ignore mesh and emtree
  const keywords = terms.keywords ?? [];

  let query = '';

  if (keywords.length > 0) {
    // Handle title_abstract expansion
    if (field === 'title_abstract') {
      query = translateTitleAbstract(keywords, operator);
    } else {
      // Get field prefix
      const prefix = translateFieldPrefix(field);
      if (prefix !== null) {
        query = translateTerms(prefix, keywords, operator);
      }
    }
  }

  // Translate exclude terms
  const notClause = terms.exclude ? translateExcludeTerms(terms.exclude, field) : null;

  return { query, notClause };
}

/**
 * Expand title_abstract to (ti: OR abs:) for each keyword.
 */
function translateTitleAbstract(keywords: string[], operator: Operator): string {
  if (keywords.length === 0) {
    return '';
  }

  // Each keyword expands to (ti:keyword OR abs:keyword)
  const expandedTerms = keywords.map((keyword) => {
    const quoted = quoteIfNeeded(keyword);
    return `(ti:${quoted} OR abs:${quoted})`;
  });

  if (expandedTerms.length === 1) {
    return expandedTerms[0]!;
  }

  return `(${expandedTerms.join(` ${operator} `)})`;
}

/**
 * Translate exclude terms to ANDNOT clause.
 * arXiv uses ANDNOT instead of NOT.
 */
function translateExcludeTerms(exclude: string[], field: FieldType): string | null {
  if (exclude.length === 0) {
    return null;
  }

  // Handle title_abstract expansion
  if (field === 'title_abstract') {
    const expandedTerms = exclude.map((term) => {
      const quoted = quoteIfNeeded(term);
      return `(ti:${quoted} OR abs:${quoted})`;
    });
    if (expandedTerms.length === 1) {
      return `ANDNOT (${expandedTerms[0]})`;
    }
    return `ANDNOT (${expandedTerms.join(' OR ')})`;
  }

  // Get field prefix
  const prefix = translateFieldPrefix(field);
  if (prefix === null) {
    // Unsupported field
    return null;
  }

  const translatedTerms = exclude.map((term) => `${prefix}${quoteIfNeeded(term)}`);

  if (translatedTerms.length === 1) {
    return `ANDNOT ${translatedTerms[0]}`;
  }
  return `ANDNOT (${translatedTerms.join(' OR ')})`;
}

/**
 * Translate date filter to arXiv submittedDate range.
 * Format: submittedDate:[YYYYMMDDHHmm TO YYYYMMDDHHmm]
 * Note: arXiv API does not support wildcards (*), so we use concrete dates:
 * - Start: 1991 (arXiv's founding year)
 * - End: current year + 1 (to include all future submissions)
 */
function translateDateFilter(yearFrom?: number, yearTo?: number): string {
  if (yearFrom === undefined && yearTo === undefined) {
    return '';
  }

  // arXiv was founded in 1991, use as default start
  const fromDate = yearFrom !== undefined ? `${yearFrom}01010000` : '199101010000';
  // Use next year as default end to include all current submissions
  const defaultEndYear = new Date().getFullYear() + 1;
  const toDate = yearTo !== undefined ? `${yearTo}12312359` : `${defaultEndYear}12312359`;

  return `submittedDate:[${fromDate} TO ${toDate}]`;
}

/**
 * Translate arXiv category filter.
 */
function translateCategories(categories: string[]): string {
  if (categories.length === 0) {
    return '';
  }

  const catTerms = categories.map((cat) => `cat:${cat}`);

  if (catTerms.length === 1) {
    return catTerms[0]!;
  }

  return `(${catTerms.join(' OR ')})`;
}

/**
 * Translate a ResolvedAST to arXiv-native syntax.
 */
export function translateQuery(resolved: ResolvedAST): TranslatedQuery {
  const parts: string[] = [];
  const notClauses: string[] = [];

  // Translate all blocks (AND'd together)
  const blockResults = resolved.blocks.map(translateBlock);
  const blockParts = blockResults.map((r) => r.query).filter((part) => part !== '');
  const blockNotClauses = blockResults
    .map((r) => r.notClause)
    .filter((s): s is string => s !== null);

  notClauses.push(...blockNotClauses);

  if (blockParts.length > 0) {
    if (blockParts.length === 1) {
      parts.push(blockParts[0]!);
    } else {
      parts.push(blockParts.map((part) => `(${part})`).join(' AND '));
    }
  }

  // Add date filter if present
  const dateFilter = translateDateFilter(resolved.filters.yearFrom, resolved.filters.yearTo);
  if (dateFilter) {
    parts.push(`(${dateFilter})`);
  }

  // Add category filter from resolved filters (was in overrides)
  if (resolved.filters.categories && resolved.filters.categories.length > 0) {
    const categoryFilter = translateCategories(resolved.filters.categories);
    if (categoryFilter) {
      parts.push(`(${categoryFilter})`);
    }
  }

  // Combine all parts with AND
  let native: string;
  if (parts.length === 0) {
    native = '';
  } else if (parts.length === 1) {
    native = parts[0]!;
  } else {
    native = parts.join(' AND ');
  }

  // Append ANDNOT clauses
  for (const notClause of notClauses) {
    if (native) {
      native = `${native} ${notClause}`;
    } else {
      native = notClause;
    }
  }

  // Collect warnings for unsupported controlled vocabulary
  // arXiv does not support any controlled vocabulary
  const warnings = collectUnsupportedVocabWarnings(resolved.blocks, 'arXiv', new Set());

  return {
    native,
    provider: 'arxiv',
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
