/**
 * ERIC query translator.
 * Converts QueryAST to ERIC-native query syntax.
 */

import type { QueryAST, QueryBlock, Filters } from '../../query/types';
import type { TranslatedQuery } from '../base/types';

/**
 * Field prefix mappings for ERIC.
 * Maps DSL field types to ERIC query syntax prefixes.
 */
const FIELD_PREFIXES: Record<string, string> = {
  title: 'title:',
  abstract: 'abstract:',
  author: 'author:',
  keyword: 'subject:', // ERIC uses subject for descriptors
  all: '', // No prefix for all-field search
};

/**
 * Check if a term needs quoting (contains spaces or special characters).
 */
function needsQuotes(term: string): boolean {
  return /\s|[()[\]{}:"]/.test(term);
}

/**
 * Format a term with optional field prefix.
 * Quotes multi-word phrases automatically.
 */
function formatTerm(term: string, prefix: string): string {
  const quoted = needsQuotes(term) ? `"${term}"` : term;
  return `${prefix}${quoted}`;
}

/**
 * Translate a single term for title_abstract field.
 * Expands to (title:term OR abstract:term).
 */
function translateTitleAbstractTerm(term: string): string {
  const quoted = needsQuotes(term) ? `"${term}"` : term;
  return `(title:${quoted} OR abstract:${quoted})`;
}

/**
 * Translate a single query block to ERIC syntax.
 */
function translateBlock(block: QueryBlock): string {
  const { field, terms, operator } = block;
  const keywords = terms.keywords;

  if (keywords.length === 0) {
    return '';
  }

  // Handle title_abstract special case
  if (field === 'title_abstract') {
    const expandedTerms = keywords.map(translateTitleAbstractTerm);
    if (expandedTerms.length === 1) {
      return expandedTerms[0]!;
    }
    return `(${expandedTerms.join(` ${operator} `)})`;
  }

  // Standard field translation
  const prefix = FIELD_PREFIXES[field] ?? '';
  const translatedTerms = keywords.map((term) => formatTerm(term, prefix));

  if (translatedTerms.length === 1) {
    return translatedTerms[0]!;
  }

  return `(${translatedTerms.join(` ${operator} `)})`;
}

/**
 * Translate date filters to ERIC syntax.
 * ERIC uses publicationdateyear:[YYYY TO YYYY] format.
 */
function translateDateFilters(filters: Filters): string | null {
  const { yearFrom, yearTo } = filters;

  if (yearFrom === undefined && yearTo === undefined) {
    return null;
  }

  const from = yearFrom !== undefined ? yearFrom.toString() : '*';
  const to = yearTo !== undefined ? yearTo.toString() : '*';

  return `publicationdateyear:[${from} TO ${to}]`;
}

/**
 * Translate a QueryAST to ERIC-native query syntax.
 */
export function translateQueryAST(ast: QueryAST): TranslatedQuery {
  const blockQueries: string[] = [];

  // Translate each block
  for (const block of ast.blocks) {
    const blockQuery = translateBlock(block);
    if (blockQuery) {
      blockQueries.push(blockQuery);
    }
  }

  // Combine blocks with AND
  let native = blockQueries.join(' AND ');

  // Apply date filters
  const dateFilter = translateDateFilters(ast.filters);
  if (dateFilter) {
    if (native) {
      native = `${native} AND ${dateFilter}`;
    } else {
      native = dateFilter;
    }
  }

  return {
    native,
    originalAst: ast,
    provider: 'eric',
  };
}

/**
 * Translate a QueryAST to ERIC query.
 * This is the Provider interface method signature.
 */
export function translateQuery(ast: QueryAST): TranslatedQuery {
  return translateQueryAST(ast);
}
