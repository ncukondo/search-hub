/**
 * PubMed query translator.
 * Converts ResolvedAST to PubMed E-utilities search syntax.
 */

import type { FieldType, QueryBlock, Filters, ResolvedAST } from '../../query/types';
import type { TranslatedQuery } from '../base/types';
import { collectUnsupportedVocabWarnings } from '../base/warnings';

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
 * Translate exclude terms to NOT clause.
 */
function translateExcludeTerms(exclude: string[], qualifier: string): string | null {
  if (exclude.length === 0) {
    return null;
  }

  const excludeTerms = exclude.map((term) => translateTerm(term, qualifier));

  if (excludeTerms.length === 1) {
    return `NOT ${excludeTerms[0]}`;
  }
  return `NOT (${excludeTerms.join(' OR ')})`;
}

/**
 * Translate a query block to PubMed syntax.
 * Returns an object with the main query part and optional NOT clause.
 */
function translateBlock(block: QueryBlock): { query: string; notClause: string | null } {
  const qualifier = FIELD_QUALIFIERS[block.field];
  const terms: string[] = [];

  // Translate keywords
  for (const keyword of block.terms.keywords ?? []) {
    terms.push(translateTerm(keyword, qualifier));
  }

  // Translate MeSH terms (always use [mh] regardless of field)
  if (block.terms.mesh) {
    for (const meshTerm of block.terms.mesh) {
      terms.push(translateTerm(meshTerm, 'mh'));
    }
  }

  // Build query part
  let query = '';
  if (terms.length === 1) {
    query = `(${terms[0]})`;
  } else if (terms.length > 1) {
    query = `(${terms.join(` ${block.operator} `)})`;
  }

  // Translate exclude terms
  const notClause = block.terms.exclude
    ? translateExcludeTerms(block.terms.exclude, qualifier)
    : null;

  return { query, notClause };
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
function translatePublicationTypeFilters(pubTypes: Filters['publicationTypes']): string[] {
  const filters: string[] = [];

  if (!pubTypes) {
    return filters;
  }

  // Include filters
  if (pubTypes.include && pubTypes.include.length > 0) {
    const includeTerms = pubTypes.include.map((pt) => `"${pt.toLowerCase()}"[pt]`);
    if (includeTerms.length === 1) {
      filters.push(includeTerms[0]!);
    } else {
      filters.push(`(${includeTerms.join(' OR ')})`);
    }
  }

  // Exclude filters - single grouped NOT clause
  if (pubTypes.exclude && pubTypes.exclude.length > 0) {
    const excludeTerms = pubTypes.exclude.map((pt) => `${pt.toLowerCase()}[pt]`);
    if (excludeTerms.length === 1) {
      filters.push(`NOT ${excludeTerms[0]}`);
    } else {
      filters.push(`NOT (${excludeTerms.join(' OR ')})`);
    }
  }

  return filters;
}

/**
 * Translate a ResolvedAST to PubMed search syntax.
 */
export function translateQuery(resolved: ResolvedAST): TranslatedQuery {
  const { filters } = resolved;

  // Translate query blocks
  const blockResults = resolved.blocks.map((block) => translateBlock(block));

  // Collect query parts and NOT clauses
  const blockStrings = blockResults.map((r) => r.query).filter((s) => s.length > 0);
  const blockNotClauses = blockResults
    .map((r) => r.notClause)
    .filter((s): s is string => s !== null);

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

  // Add block-level NOT clauses (from exclude terms)
  parts.push(...blockNotClauses);

  // Separate NOT clauses from AND-joined parts
  // PubMed treats NOT as a standalone binary operator, not AND NOT
  const notParts = parts.filter((p) => p.startsWith('NOT '));
  const andParts = parts.filter((p) => !p.startsWith('NOT '));

  const andSection = andParts.join(' AND ');
  const notSection = notParts.join(' ');
  let native: string;
  if (andSection && notSection) {
    native = andSection + ' ' + notSection;
  } else if (notSection) {
    native = notSection;
  } else {
    native = andSection;
  }

  // Collect warnings for unsupported controlled vocabulary
  // PubMed supports mesh but not emtree or eric
  const warnings = collectUnsupportedVocabWarnings(resolved.blocks, 'PubMed', new Set(['mesh']));

  return {
    native,
    provider: 'pubmed',
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
