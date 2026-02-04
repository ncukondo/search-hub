import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Article, ProviderName } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';
import type { QueryAST } from '../../query/types.js';
import { loadResults } from '../../session/results-io.js';
import { parseQueryString } from '../../query/parser.js';

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

/**
 * Load the QueryAST from a session's query file.
 *
 * Sessions store a copy of the query file as `query_common.yaml` in the session directory.
 *
 * @param sessionId - The session ID
 * @param sessionsDir - Path to the sessions directory
 * @returns The parsed QueryAST, or undefined if the query file doesn't exist or can't be parsed
 */
export async function loadSessionQuery(
  sessionId: string,
  sessionsDir: string,
): Promise<QueryAST | undefined> {
  const sessionDir = join(sessionsDir, sessionId);
  const queryFilePath = join(sessionDir, 'query_common.yaml');

  try {
    const content = await readFile(queryFilePath, 'utf-8');
    return parseQueryString(content);
  } catch {
    // Query file doesn't exist or can't be parsed
    return undefined;
  }
}
