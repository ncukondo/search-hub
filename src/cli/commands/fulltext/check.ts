/**
 * Fulltext check command.
 * Checks OA availability for included articles in a session.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { discoverOA, loadMeta, saveMeta, type DiscoveryConfig, type DiscoveryArticle, type OAStatus, type OALocation } from '@ncukondo/academic-fulltext';
import type { ReviewFile, ArticleEntry } from '../review/types';
import { verifyPmcid } from './verify-pmcid';

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
  /** PMCID discovered during OA check and verified against the article */
  pmcid?: string;
  /** PMCID discovered during OA check but rejected because its metadata did not match */
  rejectedPmcid?: string;
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

/** Outcome of validating a discovered PMCID against the article. */
interface ValidatedDiscovery {
  oaStatus: OAStatus;
  locations: OALocation[];
  verifiedPmcid?: string;
  rejectedPmcid?: string;
}

/**
 * Validate a PMCID discovered during OA discovery against the article's
 * own metadata. On mismatch, drop all PMC locations so an unrelated
 * paper's fulltext is never fetched (issue #146).
 */
async function validateDiscoveredPmcid(
  article: ArticleEntry,
  config: DiscoveryConfig,
  discoveredPmcid: string | undefined,
  oaStatus: OAStatus,
  locations: OALocation[]
): Promise<ValidatedDiscovery> {
  const hasPmcLocations = locations.some((loc) => loc.source === 'pmc');
  if (!discoveredPmcid || !hasPmcLocations) {
    return { oaStatus, locations };
  }

  const verifyArticle: { doi?: string; pmid?: string; title?: string } = {
    title: article.title,
  };
  if (article.doi) verifyArticle.doi = article.doi;
  if (article.pmid) verifyArticle.pmid = article.pmid;
  const verifyOptions: { ncbiEmail?: string; ncbiTool?: string } = {};
  if (config.ncbiEmail) verifyOptions.ncbiEmail = config.ncbiEmail;
  if (config.ncbiTool) verifyOptions.ncbiTool = config.ncbiTool;

  const verification = await verifyPmcid(discoveredPmcid, verifyArticle, verifyOptions);

  if (verification === 'match') {
    return { oaStatus, locations, verifiedPmcid: discoveredPmcid };
  }
  if (verification === 'mismatch') {
    const filtered = locations.filter((loc) => loc.source !== 'pmc');
    const status = filtered.length === 0 && oaStatus === 'open' ? 'unknown' : oaStatus;
    return { oaStatus: status, locations: filtered, rejectedPmcid: discoveredPmcid };
  }
  // Unverified: keep locations but do not vouch for the PMCID
  return { oaStatus, locations };
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

  const validated = await validateDiscoveredPmcid(
    article,
    config,
    discoveryResult.discoveredIds.pmcid,
    discoveryResult.oaStatus,
    discoveryResult.locations
  );

  const articleResult: FulltextCheckArticleResult = {
    title: article.title,
    oaStatus: validated.oaStatus,
    locationCount: validated.locations.length,
  };
  if (article.doi) articleResult.doi = article.doi;
  if (article.pmid) articleResult.pmid = article.pmid;
  if (validated.verifiedPmcid) articleResult.pmcid = validated.verifiedPmcid;
  if (validated.rejectedPmcid) articleResult.rejectedPmcid = validated.rejectedPmcid;

  // Try to update meta.json if a fulltext directory exists for this article
  const dirName = await findArticleDir(sessionDir, article);
  if (dirName) {
    try {
      const metaPath = join(sessionDir, 'fulltext', dirName, 'meta.json');
      const meta = await loadMeta(metaPath);
      meta.oaStatus = validated.oaStatus;
      meta.oaLocations = validated.locations;
      if (validated.verifiedPmcid && !meta.pmcid) {
        meta.pmcid = validated.verifiedPmcid;
      }
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
