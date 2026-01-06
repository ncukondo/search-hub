/**
 * Scopus Query Translator
 *
 * Translates QueryAST to Scopus search syntax.
 */

import type { QueryAST, FieldType, QueryBlock, Filters, OverrideBlock } from '../../query/types';
import type { TranslatedQuery } from '../base/types';

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
 */
function translateBlock(block: QueryBlock): string {
  const field = FIELD_MAP[block.field];
  const terms = block.terms.keywords.map(quoteTerm);
  const operator = block.operator;

  const termsStr = terms.join(` ${operator} `);
  return `${field}(${termsStr})`;
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
  const blockParts = ast.blocks.map(translateBlock);

  // Translate filters
  const scopusOverrides = ast.overrides.scopus;
  const filterParts = translateFilters(ast.filters, scopusOverrides);

  // Combine all parts with AND
  const allParts = [...blockParts, ...filterParts];
  const native = allParts.join(' AND ');

  return {
    native,
    originalAst: ast,
    provider: 'scopus',
  };
}
