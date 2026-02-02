/**
 * CSL-JSON conversion module.
 * Converts Article objects to CSL-JSON format for bulk import via ref add -i json.
 */

import type { Article } from '../providers/base/types.js';

/**
 * Generate a human-readable CSL ID from an article (author-year format).
 *
 * Format: `{first-author-family}-{year}`
 * - No author: `anon-{year}`
 * - No year: `{author}-nd`
 * - Duplicate resolution is handled by `articlesToCslJson()` at the batch level.
 */
export function generateCslId(article: Article): string {
  const authorPart =
    article.authors.length > 0
      ? article.authors[0]!.family.toLowerCase()
      : 'anon';

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
export function parseDateParts(
  date: string | undefined
): number[][] | undefined {
  if (!date) return undefined;

  const parts = date.split('-').map(Number);
  if (parts.length === 0 || Number.isNaN(parts[0])) return undefined;

  return [parts];
}
