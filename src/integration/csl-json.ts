/**
 * CSL-JSON conversion module.
 * Converts Article objects to CSL-JSON format for bulk import via ref add -i json.
 */

import type { Article } from '../providers/base/types.js';

/** CSL-JSON item type used for bulk import. */
export interface CslJsonItem {
  id: string;
  type: string;
  title: string;
  author: Array<{ family: string; given?: string }>;
  DOI?: string;
  PMID?: string;
  URL?: string;
  abstract?: string;
  issued?: { 'date-parts': number[][] };
  'container-title'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  /**
   * Alternative identifiers. Key names match what reference-manager reads:
   * its duplicate detector and fulltext discovery use `custom.arxiv_id`.
   */
  custom?: {
    arxiv_id?: string;
    eric_id?: string;
    scopus_id?: string;
  };
}

/**
 * Generate a human-readable CSL ID from an article (author-year format).
 *
 * Format: `{first-author-family}-{year}`
 * - No author: `anon-{year}`
 * - No year: `{author}-nd`
 * - Duplicate resolution is handled by `articlesToCslJson()` at the batch level.
 */
export function generateCslId(article: Article): string {
  const authorPart = article.authors.length > 0 ? article.authors[0]!.family.toLowerCase() : 'anon';

  const yearPart = extractYear(article.publicationDate);

  return `${authorPart}-${yearPart}`;
}

/**
 * Extract year from a publication date string.
 * Handles formats: "2024-01-15", "2024-01", "2024"
 */
function extractYear(date: string | undefined): string {
  if (!date) return 'nd';
  const match = date.match(/^(\d{4})/);
  return match ? match[1]! : 'nd';
}

/**
 * Parse a publication date string into CSL date-parts format.
 *
 * - `"2024-01-15"` → `[[2024, 1, 15]]`
 * - `"2024-01"` → `[[2024, 1]]`
 * - `"2024"` → `[[2024]]`
 * - `undefined` or `""` → `undefined`
 */
export function parseDateParts(date: string | undefined): number[][] | undefined {
  if (!date) return undefined;

  const parts = date.split('-').map(Number);
  if (parts.length === 0 || Number.isNaN(parts[0])) return undefined;

  return [parts];
}

/**
 * Convert a single Article to a CSL-JSON item.
 * The `id` parameter must be pre-generated (with duplicate resolution already applied).
 */
export function articleToCslJson(article: Article, id: string): CslJsonItem {
  const item: CslJsonItem = {
    id,
    type: 'article-journal',
    title: article.title,
    author: article.authors.map((a) => {
      const entry: { family: string; given?: string } = { family: a.family };
      if (a.given) entry.given = a.given;
      return entry;
    }),
  };

  if (article.doi) item.DOI = article.doi;
  if (article.pmid) item.PMID = article.pmid;

  const custom: NonNullable<CslJsonItem['custom']> = {};
  if (article.arxivId) custom.arxiv_id = article.arxivId;
  if (article.ericId) custom.eric_id = article.ericId;
  if (article.scopusId) custom.scopus_id = article.scopusId;
  if (Object.keys(custom).length > 0) item.custom = custom;

  // Without a DOI, give resolvers a landing page for the alternative identifier
  if (!article.doi) {
    if (article.arxivId) {
      item.URL = `https://arxiv.org/abs/${article.arxivId}`;
    } else if (article.ericId) {
      item.URL = `https://eric.ed.gov/?id=${article.ericId}`;
    }
  }

  if (article.abstract) item.abstract = article.abstract;

  const dateParts = parseDateParts(article.publicationDate);
  if (dateParts) item.issued = { 'date-parts': dateParts };

  if (article.journal) item['container-title'] = article.journal;
  if (article.volume) item.volume = article.volume;
  if (article.issue) item.issue = article.issue;
  if (article.pages) item.page = article.pages;

  return item;
}

/**
 * Convert an array of Articles to CSL-JSON items with duplicate ID resolution.
 *
 * Duplicates within the batch are resolved by appending suffixes:
 * `smith-2024`, `smith-2024a`, `smith-2024b`, ...
 */
export function articlesToCslJson(articles: Article[]): CslJsonItem[] {
  const idCounts = new Map<string, number>();
  const result: CslJsonItem[] = [];

  for (const article of articles) {
    const baseId = generateCslId(article);
    const count = idCounts.get(baseId) ?? 0;
    idCounts.set(baseId, count + 1);

    let resolvedId: string;
    if (count === 0) {
      resolvedId = baseId;
    } else {
      // a=97 in ASCII, so suffix is 'a', 'b', 'c', ...
      resolvedId = `${baseId}${String.fromCharCode(96 + count)}`;
    }

    result.push(articleToCslJson(article, resolvedId));
  }

  return result;
}
