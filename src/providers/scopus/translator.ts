/**
 * Scopus Query Translator
 *
 * Translates QueryAST to Scopus search syntax.
 */

import type { QueryAST, FieldType, QueryBlock, Filters, OverrideBlock } from '../../query/types';
import type { TranslatedQuery } from '../base/types';
import { collectUnsupportedVocabWarnings } from '../base/warnings';

/**
 * Field function mappings for Scopus.
 */
const FIELD_MAP: Record<FieldType, string> = {
  title: 'TITLE',
  abstract: 'ABS',
  title_abstract: 'TITLE-ABS-KEY',
  author: 'AUTH',
  keyword: 'KEY',
  all: 'ALL',
};

/**
 * Source type code mappings for Scopus.
 */
const SOURCE_TYPE_MAP: Record<string, string> = {
  journal: 'j',
  conference: 'p',
  book: 'b',
  'book series': 'k',
  'trade journal': 'd',
};

/**
 * Language code mappings for Scopus.
 */
const LANGUAGE_MAP: Record<string, string> = {
  en: 'english',
  de: 'german',
  fr: 'french',
  es: 'spanish',
  it: 'italian',
  ja: 'japanese',
  zh: 'chinese',
  ko: 'korean',
  pt: 'portuguese',
  ru: 'russian',
};

/**
 * Check if a term needs to be quoted (contains spaces and isn't already quoted).
 */
function needsQuotes(term: string): boolean {
  if (term.startsWith('"') && term.endsWith('"')) {
    return false;
  }
  if (term.startsWith('{') && term.endsWith('}')) {
    return false;
  }
  return term.includes(' ');
}

/**
 * Quote a term if it contains spaces.
 */
function quoteTerm(term: string): string {
  if (needsQuotes(term)) {
    return `"${term}"`;
  }
  return term;
}

/**
 * Translate a single query block to Scopus syntax.
 * Returns an object with the main query part and optional NOT clause.
 */
function translateBlock(block: QueryBlock): { query: string; notClause: string | null } {
  const field = FIELD_MAP[block.field];
  const operator = block.operator;
  const parts: string[] = [];

  // Translate keywords
  const keywords = (block.terms.keywords ?? []).map(quoteTerm);
  if (keywords.length > 0) {
    parts.push(`${field}(${keywords.join(` ${operator} `)})`);
  }

  // Translate Emtree terms (always use INDEXTERMS)
  const emtree = (block.terms.emtree ?? []).map(quoteTerm);
  if (emtree.length > 0) {
    parts.push(`INDEXTERMS(${emtree.join(` ${operator} `)})`);
  }

  // Combine parts (empty string when no supported terms)
  let query: string;
  if (parts.length === 0) {
    query = '';
  } else if (parts.length === 1) {
    query = parts[0]!;
  } else {
    query = parts.join(` ${operator} `);
  }

  // Translate exclude terms (without AND prefix - will be added during join)
  let notClause: string | null = null;
  if (block.terms.exclude && block.terms.exclude.length > 0) {
    const excludeTerms = block.terms.exclude.map(quoteTerm);
    const excludeStr = excludeTerms.join(' OR ');
    notClause = `NOT ${field}(${excludeStr})`;
  }

  return { query, notClause };
}

/**
 * Translate filters to Scopus syntax.
 */
function translateFilters(filters: Filters, scopusOverrides?: OverrideBlock): string[] {
  const parts: string[] = [];

  // Year filters
  if (filters.yearFrom !== undefined) {
    parts.push(`PUBYEAR > ${filters.yearFrom - 1}`);
  }
  if (filters.yearTo !== undefined) {
    parts.push(`PUBYEAR < ${filters.yearTo + 1}`);
  }

  // Language filter
  if (filters.languages && filters.languages.length > 0) {
    const languages = filters.languages
      .map(code => LANGUAGE_MAP[code] || code)
      .join(' OR ');
    parts.push(`LANGUAGE(${languages})`);
  }

  // Source type filter from overrides
  if (scopusOverrides?.sourceTypes && scopusOverrides.sourceTypes.length > 0) {
    const sourceTypes = scopusOverrides.sourceTypes
      .map(type => SOURCE_TYPE_MAP[type] || type)
      .join(' OR ');
    parts.push(`SRCTYPE(${sourceTypes})`);
  }

  return parts;
}

/**
 * Translate a QueryAST to Scopus search syntax.
 */
export function translateQuery(ast: QueryAST): TranslatedQuery {
  // Translate query blocks
  const blockResults = ast.blocks.map(translateBlock);

  // Collect query parts (filter empty blocks) and NOT clauses
  const blockParts = blockResults
    .map((r) => r.query)
    .filter((s) => s.length > 0);
  const notClauses = blockResults
    .map((r) => r.notClause)
    .filter((s): s is string => s !== null);

  // Translate filters
  const scopusOverrides = ast.overrides.scopus;
  const filterParts = translateFilters(ast.filters, scopusOverrides);

  // Build native query: blocks AND NOT(excludes) AND filters
  const allParts: string[] = [...blockParts, ...notClauses, ...filterParts];
  const native = allParts.join(' AND ');

  // Collect warnings for unsupported controlled vocabulary
  // Scopus supports emtree but not mesh or eric
  const warnings = collectUnsupportedVocabWarnings(ast.blocks, 'Scopus', new Set(['emtree']));

  return {
    native,
    originalAst: ast,
    provider: 'scopus',
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
