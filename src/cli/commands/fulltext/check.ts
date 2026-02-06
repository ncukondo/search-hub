/**
 * Fulltext check command.
 * Checks OA availability for included articles in a session.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { discoverOA, type DiscoveryConfig, type DiscoveryArticle } from '../../../fulltext/discovery/index';
import { loadMeta, saveMeta } from '../../../fulltext/meta';
import type { OAStatus } from '../../../fulltext/types';
import type { ReviewFile, ArticleEntry } from '../review/types';

export interface FulltextCheckOptions {
  sessionDir: string;
  config: DiscoveryConfig;
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
 * Execute the fulltext check command.
 * Checks OA availability for all included articles in a session.
 */
export async function executeFulltextCheck(
  options: FulltextCheckOptions
): Promise<FulltextCheckResult> {
  const { sessionDir, config } = options;

  // Load included articles
  const articles = await loadIncludedArticles(sessionDir);

  const results: FulltextCheckArticleResult[] = [];
  const summary = { total: articles.length, open: 0, closed: 0, unknown: 0 };

  for (const article of articles) {
    // Run OA discovery
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
    results.push(articleResult);

    // Update summary
    switch (discoveryResult.oaStatus) {
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
  }

  return { summary, articles: results };
}
