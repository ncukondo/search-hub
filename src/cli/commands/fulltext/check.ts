/**
 * Fulltext check command.
 * Checks OA availability for included articles in a session.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { discoverOA, loadMeta, saveMeta, type DiscoveryConfig, type DiscoveryArticle, type OAStatus } from '@ncukondo/academic-fulltext';
import type { ReviewFile, ArticleEntry } from '../review/types';

/** Default concurrency for parallel article processing */
const DEFAULT_CONCURRENCY = 3;

export interface FulltextCheckOptions {
  sessionDir: string;
  config: DiscoveryConfig;
  concurrency?: number;
}

export interface FulltextCheckArticleResult {
  doi?: string;
  pmid?: string;
  title: string;
  oaStatus: OAStatus;
  locationCount: number;
}

export interface FulltextCheckResult {
  summary: {
    total: number;
    open: number;
    closed: number;
    unknown: number;
  };
  articles: FulltextCheckArticleResult[];
}

/**
 * Load included articles from reviews.yaml
 */
async function loadIncludedArticles(sessionDir: string): Promise<ArticleEntry[]> {
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  const reviewFile = parseYaml(content) as ReviewFile;
  return reviewFile.articles.filter((a) => a.finalDecision === 'include');
}

/**
 * Try to find a meta.json matching an article in the fulltext directory.
 * Returns the dirName if found, null otherwise.
 */
async function findArticleDir(
  sessionDir: string,
  article: ArticleEntry
): Promise<string | null> {
  const fulltextDir = join(sessionDir, 'fulltext');
  try {
    await access(fulltextDir);
  } catch {
    return null;
  }

  let entries: string[];
  try {
    const dirEntries = await readdir(fulltextDir);
    entries = dirEntries.map(String);
  } catch {
    return null;
  }

  for (const entry of entries) {
    try {
      const metaPath = join(fulltextDir, entry, 'meta.json');
      const meta = await loadMeta(metaPath);
      // Match by DOI or PMID
      if (article.doi && meta.doi === article.doi) return entry;
      if (article.pmid && meta.pmid === article.pmid) return entry;
    } catch {
      // Skip entries without valid meta.json
    }
  }
  return null;
}

/**
 * Process a single article: run OA discovery and optionally update meta.json.
 */
async function processArticle(
  article: ArticleEntry,
  sessionDir: string,
  config: DiscoveryConfig
): Promise<FulltextCheckArticleResult> {
  const discoveryArticle: DiscoveryArticle = {};
  if (article.doi) discoveryArticle.doi = article.doi;
  if (article.pmid) discoveryArticle.pmid = article.pmid;
  if (article.arxivId) discoveryArticle.arxivId = article.arxivId;
  const discoveryResult = await discoverOA(discoveryArticle, config);

  const articleResult: FulltextCheckArticleResult = {
    title: article.title,
    oaStatus: discoveryResult.oaStatus,
    locationCount: discoveryResult.locations.length,
  };
  if (article.doi) articleResult.doi = article.doi;
  if (article.pmid) articleResult.pmid = article.pmid;

  // Try to update meta.json if a fulltext directory exists for this article
  const dirName = await findArticleDir(sessionDir, article);
  if (dirName) {
    try {
      const metaPath = join(sessionDir, 'fulltext', dirName, 'meta.json');
      const meta = await loadMeta(metaPath);
      meta.oaStatus = discoveryResult.oaStatus;
      meta.oaLocations = discoveryResult.locations;
      meta.checkedAt = new Date().toISOString();
      await saveMeta(metaPath, meta);
    } catch {
      // Meta update is best-effort
    }
  }

  return articleResult;
}

/**
 * Run async tasks with a concurrency limit.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      try {
        const value = await tasks[index]!();
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Execute the fulltext check command.
 * Checks OA availability for all included articles in a session,
 * processing articles in parallel with a concurrency limit.
 */
export async function executeFulltextCheck(
  options: FulltextCheckOptions
): Promise<FulltextCheckResult> {
  const { sessionDir, config, concurrency = DEFAULT_CONCURRENCY } = options;

  // Load included articles
  const articles = await loadIncludedArticles(sessionDir);

  const summary = { total: articles.length, open: 0, closed: 0, unknown: 0 };

  const tasks = articles.map(
    (article) => () => processArticle(article, sessionDir, config)
  );

  const settled = await runWithConcurrency(tasks, concurrency);

  const results: FulltextCheckArticleResult[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
      switch (result.value.oaStatus) {
        case 'open':
          summary.open++;
          break;
        case 'closed':
          summary.closed++;
          break;
        case 'unknown':
          summary.unknown++;
          break;
      }
    }
  }

  return { summary, articles: results };
}
