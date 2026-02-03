import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Article, ProviderName } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';

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
 * Load articles from a session's JSONL result files.
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

  for (const provider of targetProviders) {
    const dbStatus = session.databases[provider];
    if (!dbStatus || !dbStatus.files?.results) continue;

    const resultsPath = join(sessionsDir, sessionId, dbStatus.files.results);
    try {
      const content = await readFile(resultsPath, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line);
      for (const line of lines) {
        try {
          articles.push(JSON.parse(line));
        } catch {
          // Skip invalid JSON lines
        }
      }
    } catch {
      // Results file may not exist yet
    }
  }

  return articles;
}
