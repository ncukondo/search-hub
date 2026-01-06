/**
 * PubMed query translator.
 * Converts QueryAST to PubMed E-utilities search syntax.
 */

import type { QueryAST, FieldType, QueryBlock, Filters } from '../../query/types';
import type { TranslatedQuery } from '../base/types';

/**
 * Field type to PubMed qualifier mapping.
 */
const FIELD_QUALIFIERS: Record<FieldType, string> = {
  title: 'ti',
  abstract: 'ab',
  title_abstract: 'tiab',
  author: 'au',
  keyword: 'mh',
  all: 'all',
};

/**
 * Language code to PubMed language name mapping.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'english',
  ja: 'japanese',
  de: 'german',
  fr: 'french',
  es: 'spanish',
  it: 'italian',
  pt: 'portuguese',
  zh: 'chinese',
  ko: 'korean',
  ru: 'russian',
};

/**
 * Quote a term if it contains spaces and is not already quoted.
 */
function quoteTerm(term: string): string {
  // Already quoted
  if (term.startsWith('"') && term.endsWith('"')) {
    return term;
  }
  // Contains spaces - needs quoting
  if (term.includes(' ')) {
    return `"${term}"`;
  }
  return term;
}

/**
 * Translate a single term with field qualifier.
 */
function translateTerm(term: string, qualifier: string): string {
  const quoted = quoteTerm(term);
  return `${quoted}[${qualifier}]`;
}

/**
 * Translate a query block to PubMed syntax.
 */
function translateBlock(block: QueryBlock): string {
  const qualifier = FIELD_QUALIFIERS[block.field];
  const terms: string[] = [];

  // Translate keywords
  for (const keyword of block.terms.keywords) {
    terms.push(translateTerm(keyword, qualifier));
  }

  // Translate MeSH terms (always use [mh] regardless of field)
  if (block.terms.mesh) {
    for (const meshTerm of block.terms.mesh) {
      terms.push(translateTerm(meshTerm, 'mh'));
    }
  }

  // Combine terms with operator
  if (terms.length === 0) {
    return '';
  }
  if (terms.length === 1) {
    return `(${terms[0]})`;
  }
  return `(${terms.join(` ${block.operator} `)})`;
}

/**
 * Translate date filters to PubMed syntax.
 */
function translateDateFilters(filters: Filters): string | null {
  const yearFrom = filters.yearFrom ?? 1900;
  const yearTo = filters.yearTo ?? 3000;

  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
    return `${yearFrom}:${yearTo}[dp]`;
  }
  return null;
}

/**
 * Translate language filters to PubMed syntax.
 */
function translateLanguageFilters(languages: string[]): string | null {
  if (languages.length === 0) {
    return null;
  }

  const langTerms = languages.map((code) => {
    const langName = LANGUAGE_NAMES[code] ?? code;
    return `${langName}[la]`;
  });

  if (langTerms.length === 1) {
    return langTerms[0]!;
  }
  return `(${langTerms.join(' OR ')})`;
}

/**
 * Translate publication type filters to PubMed syntax.
 */
function translatePublicationTypeFilters(
  pubTypes: Filters['publicationTypes']
): string[] {
  const filters: string[] = [];

  if (!pubTypes) {
    return filters;
  }

  // Include filters
  if (pubTypes.include && pubTypes.include.length > 0) {
    const includeTerms = pubTypes.include.map(
      (pt) => `"${pt.toLowerCase()}"[pt]`
    );
    if (includeTerms.length === 1) {
      filters.push(includeTerms[0]!);
    } else {
      filters.push(`(${includeTerms.join(' OR ')})`);
    }
  }

  // Exclude filters
  if (pubTypes.exclude && pubTypes.exclude.length > 0) {
    for (const pt of pubTypes.exclude) {
      filters.push(`NOT ${pt.toLowerCase()}[pt]`);
    }
  }

  return filters;
}

/**
 * Merge global filters with provider-specific overrides.
 */
function mergeFilters(global: Filters, overrides?: Filters): Filters {
  if (!overrides) {
    return global;
  }

  return {
    yearFrom: overrides.yearFrom ?? global.yearFrom,
    yearTo: overrides.yearTo ?? global.yearTo,
    languages: overrides.languages ?? global.languages,
    publicationTypes: overrides.publicationTypes
      ? {
          include:
            overrides.publicationTypes.include ??
            global.publicationTypes?.include,
          exclude: [
            ...(global.publicationTypes?.exclude ?? []),
            ...(overrides.publicationTypes.exclude ?? []),
          ],
        }
      : global.publicationTypes,
  };
}

/**
 * Translate a QueryAST to PubMed search syntax.
 */
export function translateQuery(ast: QueryAST): TranslatedQuery {
  // Merge filters with PubMed-specific overrides
  const pubmedOverride = ast.overrides.pubmed;
  const filters = mergeFilters(ast.filters, pubmedOverride?.filters);

  // Translate query blocks
  const blockStrings = ast.blocks
    .map((block) => translateBlock(block))
    .filter((s) => s.length > 0);

  // Build the main query
  const parts: string[] = [];

  // Add query blocks (AND'd together)
  if (blockStrings.length > 0) {
    parts.push(blockStrings.join(' AND '));
  }

  // Add date filter
  const dateFilter = translateDateFilters(filters);
  if (dateFilter) {
    parts.push(dateFilter);
  }

  // Add language filter
  if (filters.languages && filters.languages.length > 0) {
    const langFilter = translateLanguageFilters(filters.languages);
    if (langFilter) {
      parts.push(langFilter);
    }
  }

  // Add publication type filters
  const pubTypeFilters = translatePublicationTypeFilters(filters.publicationTypes);
  parts.push(...pubTypeFilters);

  // Combine all parts with AND
  const native = parts.join(' AND ');

  return {
    native,
    originalAst: ast,
    provider: 'pubmed',
  };
}
