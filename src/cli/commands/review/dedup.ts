/**
 * Deduplication with mergedFrom tracking for review workflow
 */

import type { Article } from '../../../providers/base/types.js';
import { getArticleKeys } from '../session-utils.js';
import type { MergedSource } from './types.js';

/**
 * Article with optional mergedFrom tracking
 */
export interface ArticleWithMergedFrom extends Article {
  mergedFrom?: MergedSource[];
}

/**
 * Result of deduplication with mergedFrom tracking
 */
export interface DeduplicationWithTrackingResult {
  articles: ArticleWithMergedFrom[];
  duplicatesRemoved: number;
}

/**
 * Extract source information from an article
 */
function extractMergedSource(article: Article): MergedSource {
  const source: MergedSource = {
    source: article.source,
  };

  if (article.pmid) source.pmid = article.pmid;
  if (article.doi) source.doi = article.doi;
  if (article.scopusId) source.scopusId = article.scopusId;
  if (article.arxivId) source.arxivId = article.arxivId;
  if (article.ericId) source.ericId = article.ericId;

  return source;
}

const METADATA_FIELDS: (keyof Article)[] = [
  'doi',
  'pmid',
  'arxivId',
  'scopusId',
  'ericId',
  'abstract',
  'publicationDate',
  'journal',
  'volume',
  'issue',
  'pages',
];

function countMetadataFields(article: Article): number {
  let count = 0;
  for (const field of METADATA_FIELDS) {
    if (article[field] !== undefined && article[field] !== '') {
      count++;
    }
  }
  return count;
}

/**
 * Deduplicate articles and track which sources were merged.
 *
 * Unlike the standard deduplicateArticles, this function:
 * - Tracks all source records that were merged into each unique article
 * - Only adds mergedFrom when there are actual duplicates
 */
export function deduplicateForReview(articles: Article[]): DeduplicationWithTrackingResult {
  // Map from identifier key to index in the unique array
  const keyToIndex = new Map<string, number>();
  // Track all sources for each unique article
  const sourcesForIndex = new Map<number, MergedSource[]>();
  const unique: ArticleWithMergedFrom[] = [];
  let duplicatesRemoved = 0;

  for (const article of articles) {
    const keys = getArticleKeys(article);

    if (keys.length === 0) {
      // No identifiers - cannot deduplicate, keep the article
      unique.push({ ...article });
      continue;
    }

    // Check if any identifier has been seen before
    let existingIndex: number | undefined;
    for (const key of keys) {
      const idx = keyToIndex.get(key);
      if (idx !== undefined) {
        existingIndex = idx;
        break;
      }
    }

    if (existingIndex !== undefined) {
      // Duplicate found
      const existing = unique[existingIndex]!;
      const currentSource = extractMergedSource(article);

      // Add this source to the tracking array
      const sources = sourcesForIndex.get(existingIndex)!;
      sources.push(currentSource);

      // Compare metadata richness and replace if this one is richer
      if (countMetadataFields(article) > countMetadataFields(existing)) {
        unique[existingIndex] = { ...article };
        // Update all keys to point to the same index
        const newKeys = getArticleKeys(article);
        for (const key of newKeys) {
          keyToIndex.set(key, existingIndex);
        }
      }

      duplicatesRemoved++;
    } else {
      const index = unique.length;
      unique.push({ ...article });

      // Initialize source tracking with this article's source
      sourcesForIndex.set(index, [extractMergedSource(article)]);

      // Map all identifiers to this index
      for (const key of keys) {
        keyToIndex.set(key, index);
      }
    }
  }

  // Add mergedFrom only when there were actual merges
  for (const [index, sources] of sourcesForIndex) {
    if (sources.length > 1) {
      unique[index]!.mergedFrom = sources;
    }
  }

  return { articles: unique, duplicatesRemoved };
}
