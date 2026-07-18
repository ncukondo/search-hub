/**
 * ERIC query translator.
 * Converts ResolvedAST to ERIC-native query syntax.
 */

import type { QueryBlock, Filters, ResolvedAST } from '../../query/types';
import type { TranslatedQuery } from '../base/types';
import { collectUnsupportedVocabWarnings } from '../base/warnings';

/**
 * Field prefix mappings for ERIC.
 * Maps DSL field types to ERIC query syntax prefixes.
 */
const FIELD_PREFIXES: Record<string, string> = {
  title: 'title:',
  abstract: 'description:', // ERIC uses 'description' field for abstracts
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
 * Expands to (title:term OR description:term).
 * Note: ERIC uses 'description' field for abstracts.
 */
function translateTitleAbstractTerm(term: string): string {
  const quoted = needsQuotes(term) ? `"${term}"` : term;
  return `(title:${quoted} OR description:${quoted})`;
}

/**
 * Translate exclude terms to NOT clause.
 */
function translateExcludeTerms(exclude: string[], field: QueryBlock['field']): string | null {
  if (exclude.length === 0) {
    return null;
  }

  // Handle title_abstract expansion
  if (field === 'title_abstract') {
    const expandedTerms = exclude.map(translateTitleAbstractTerm);
    if (expandedTerms.length === 1) {
      return `NOT ${expandedTerms[0]}`;
    }
    return `NOT (${expandedTerms.join(' OR ')})`;
  }

  // Standard field translation
  const prefix = FIELD_PREFIXES[field] ?? '';
  const translatedTerms = exclude.map((term) => formatTerm(term, prefix));

  if (translatedTerms.length === 1) {
    return `NOT ${translatedTerms[0]}`;
  }
  return `NOT (${translatedTerms.join(' OR ')})`;
}

/**
 * Translate ERIC Descriptors to subject: field syntax.
 */
function translateEricDescriptors(descriptors: string[]): string[] {
  return descriptors.map((term) => formatTerm(term, 'subject:'));
}

/**
 * Translate a single query block to ERIC syntax.
 * Returns an object with the main query part and optional NOT clause.
 */
function translateBlock(block: QueryBlock): { query: string; notClause: string | null } {
  const { field, terms, operator } = block;
  const keywords = terms.keywords ?? [];
  const eric = terms.eric ?? [];

  const allTerms: string[] = [];

  // Translate keywords
  if (keywords.length > 0) {
    // Handle title_abstract special case
    if (field === 'title_abstract') {
      const expandedTerms = keywords.map(translateTitleAbstractTerm);
      allTerms.push(...expandedTerms);
    } else {
      // Standard field translation
      const prefix = FIELD_PREFIXES[field] ?? '';
      const translatedTerms = keywords.map((term) => formatTerm(term, prefix));
      allTerms.push(...translatedTerms);
    }
  }

  // Translate ERIC Descriptors (always use subject: field)
  if (eric.length > 0) {
    const ericTerms = translateEricDescriptors(eric);
    allTerms.push(...ericTerms);
  }

  // Combine all terms
  let query = '';
  if (allTerms.length === 1) {
    query = allTerms[0]!;
  } else if (allTerms.length > 1) {
    query = `(${allTerms.join(` ${operator} `)})`;
  }

  // Translate exclude terms
  const notClause = terms.exclude ? translateExcludeTerms(terms.exclude, field) : null;

  return { query, notClause };
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
 * Translate a ResolvedAST to ERIC-native query syntax.
 */
export function translateQueryAST(resolved: ResolvedAST): TranslatedQuery {
  const blockQueries: string[] = [];
  const notClauses: string[] = [];

  // Translate each block
  for (const block of resolved.blocks) {
    const { query, notClause } = translateBlock(block);
    if (query) {
      blockQueries.push(query);
    }
    if (notClause) {
      notClauses.push(notClause);
    }
  }

  // Combine blocks with AND
  let native = blockQueries.join(' AND ');

  // Append NOT clauses
  for (const notClause of notClauses) {
    if (native) {
      native = `${native} ${notClause}`;
    } else {
      native = notClause;
    }
  }

  // Apply date filters
  const dateFilter = translateDateFilters(resolved.filters);
  if (dateFilter) {
    if (native) {
      native = `${native} AND ${dateFilter}`;
    } else {
      native = dateFilter;
    }
  }

  // Collect warnings for unsupported controlled vocabulary
  // ERIC supports eric descriptors but not mesh or emtree
  const warnings = collectUnsupportedVocabWarnings(resolved.blocks, 'ERIC', new Set(['eric']));

  return {
    native,
    provider: 'eric',
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Translate a ResolvedAST to ERIC query.
 * This is the Provider interface method signature.
 */
export function translateQuery(resolved: ResolvedAST): TranslatedQuery {
  return translateQueryAST(resolved);
}
