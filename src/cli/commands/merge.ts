import type { Article, ProviderName } from '../../providers/base/types.js';
import { getArticleKeys } from './session-utils.js';

/**
 * Result of merging articles from multiple sessions.
 */
export interface MergeResult {
  /** All unique articles after deduplication */
  articles: Article[];
  /** Articles grouped by provider */
  byProvider: Map<ProviderName, Article[]>;
  /** Total article count before deduplication */
  totalBefore: number;
  /** Total unique article count after deduplication */
  totalAfter: number;
  /** Number of duplicates removed */
  duplicatesRemoved: number;
  /** Per-session article counts (before dedup) */
  perSession: Map<string, number>;
}

/**
 * Count metadata fields for comparing article richness.
 */
function countMetadataFields(article: Article): number {
  let count = 0;
  if (article.doi) count++;
  if (article.pmid) count++;
  if (article.arxivId) count++;
  if (article.scopusId) count++;
  if (article.ericId) count++;
  if (article.abstract) count++;
  if (article.publicationDate) count++;
  if (article.journal) count++;
  if (article.volume) count++;
  if (article.issue) count++;
  if (article.pages) count++;
  if (article.authors.length > 0) count++;
  return count;
}

/**
 * Merge articles from multiple sessions with identifier-based deduplication.
 *
 * When duplicates are found (same DOI, PMID, etc.), the article with
 * richer metadata is kept.
 */
export function mergeArticles(
  sessionArticles: Map<string, Article[]>,
): MergeResult {
  const keyToIndex = new Map<string, number>();
  const unique: Article[] = [];
  let totalBefore = 0;
  let duplicatesRemoved = 0;
  const perSession = new Map<string, number>();

  for (const [sessionId, articles] of sessionArticles) {
    perSession.set(sessionId, articles.length);
    totalBefore += articles.length;

    for (const article of articles) {
      const keys = getArticleKeys(article);

      if (keys.length === 0) {
        unique.push(article);
        continue;
      }

      let existingIndex: number | undefined;
      for (const key of keys) {
        const idx = keyToIndex.get(key);
        if (idx !== undefined) {
          existingIndex = idx;
          break;
        }
      }

      if (existingIndex !== undefined) {
        const existing = unique[existingIndex]!;
        if (countMetadataFields(article) > countMetadataFields(existing)) {
          unique[existingIndex] = article;
          const newKeys = getArticleKeys(article);
          for (const key of newKeys) {
            keyToIndex.set(key, existingIndex);
          }
        }
        duplicatesRemoved++;
      } else {
        const index = unique.length;
        unique.push(article);
        for (const key of keys) {
          keyToIndex.set(key, index);
        }
      }
    }
  }

  // Group by provider
  const byProvider = new Map<ProviderName, Article[]>();
  for (const article of unique) {
    const existing = byProvider.get(article.source) ?? [];
    existing.push(article);
    byProvider.set(article.source, existing);
  }

  return {
    articles: unique,
    byProvider,
    totalBefore,
    totalAfter: unique.length,
    duplicatesRemoved,
    perSession,
  };
}
