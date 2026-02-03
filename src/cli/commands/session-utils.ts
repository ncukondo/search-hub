import { join } from 'node:path';
import type { Article, ProviderName } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';
import { loadResults } from '../../session/results-io.js';

/**
 * Extract identifier keys from an article for matching/deduplication.
 * DOI is normalized to lowercase for case-insensitive matching.
 */
export function getArticleKeys(article: Article): string[] {
  const keys: string[] = [];
  if (article.doi) keys.push(`doi:${article.doi.toLowerCase()}`);
  if (article.pmid) keys.push(`pmid:${article.pmid}`);
  if (article.arxivId) keys.push(`arxiv:${article.arxivId}`);
  if (article.scopusId) keys.push(`scopus:${article.scopusId}`);
  if (article.ericId) keys.push(`eric:${article.ericId}`);
  return keys;
}

/**
 * Load articles from a session's result files (YAML preferred, JSONL fallback).
 *
 * @param session - The loaded session file
 * @param sessionId - The session ID
 * @param sessionsDir - Path to the sessions directory
 * @param providers - Optional list of providers to load from; defaults to all providers in session
 * @returns Array of articles loaded from result files
 */
export async function loadSessionArticles(
  session: SessionFile,
  sessionId: string,
  sessionsDir: string,
  providers?: ProviderName[],
): Promise<Article[]> {
  const articles: Article[] = [];
  const targetProviders = providers ?? (Object.keys(session.databases) as ProviderName[]);
  const sessionDir = join(sessionsDir, sessionId);

  for (const provider of targetProviders) {
    const dbStatus = session.databases[provider];
    if (!dbStatus) continue;

    const providerArticles = await loadResults(sessionDir, provider);
    articles.push(...providerArticles);
  }

  return articles;
}
