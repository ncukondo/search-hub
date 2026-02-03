import type { Article } from '../../providers/base/types.js';

export interface DiffResult {
  session1Count: number;
  session2Count: number;
  added: Article[];
  removed: Article[];
  common: Article[];
}

/**
 * Extract identifier keys from an article for matching.
 * Uses the same identifier types as deduplication in export.ts.
 */
function getArticleKeys(article: Article): string[] {
  const keys: string[] = [];
  if (article.doi) keys.push(`doi:${article.doi.toLowerCase()}`);
  if (article.pmid) keys.push(`pmid:${article.pmid}`);
  if (article.arxivId) keys.push(`arxiv:${article.arxivId}`);
  if (article.scopusId) keys.push(`scopus:${article.scopusId}`);
  if (article.ericId) keys.push(`eric:${article.ericId}`);
  return keys;
}

/**
 * Compute the diff between two sets of articles.
 *
 * Articles are matched by identifiers (DOI, PMID, arXiv ID, Scopus ID, ERIC ID).
 * Two articles are considered the same if they share any identifier.
 * Articles without identifiers cannot be matched.
 */
export function computeDiff(session1: Article[], session2: Article[]): DiffResult {
  // Build a set of all identifier keys from session1
  const session1Keys = new Set<string>();
  for (const article of session1) {
    for (const key of getArticleKeys(article)) {
      session1Keys.add(key);
    }
  }

  // Build a set of all identifier keys from session2
  const session2Keys = new Set<string>();
  for (const article of session2) {
    for (const key of getArticleKeys(article)) {
      session2Keys.add(key);
    }
  }

  // Classify session1 articles as common or removed
  const common: Article[] = [];
  const removed: Article[] = [];
  for (const article of session1) {
    const keys = getArticleKeys(article);
    if (keys.length === 0) {
      // No identifiers - cannot match, treat as removed
      removed.push(article);
      continue;
    }
    const isInSession2 = keys.some((key) => session2Keys.has(key));
    if (isInSession2) {
      common.push(article);
    } else {
      removed.push(article);
    }
  }

  // Classify session2 articles as added (those not in session1)
  const added: Article[] = [];
  for (const article of session2) {
    const keys = getArticleKeys(article);
    if (keys.length === 0) {
      // No identifiers - cannot match, treat as added
      added.push(article);
      continue;
    }
    const isInSession1 = keys.some((key) => session1Keys.has(key));
    if (!isInSession1) {
      added.push(article);
    }
  }

  return {
    session1Count: session1.length,
    session2Count: session2.length,
    added,
    removed,
    common,
  };
}
