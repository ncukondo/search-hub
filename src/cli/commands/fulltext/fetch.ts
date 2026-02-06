/**
 * Fulltext fetch command - downloads OA fulltexts for session articles.
 */

import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile } from '../review/types.js';
import type { FulltextMeta } from '../../../fulltext/types.js';
import { loadMeta } from '../../../fulltext/meta.js';
import { fetchAllFulltexts, type FetchArticle } from '../../../fulltext/download/orchestrator.js';
import { loadIndex, saveIndex, updateEntry } from '../../../fulltext/index-manager.js';

export interface FulltextFetchOptions {
  sessionId: string;
  sessionsDir: string;
  source?: string[];
  convertMarkdown?: boolean;
  dryRun?: boolean;
  concurrency?: number;
  retryDelay?: number;
}

export interface FulltextFetchArticle {
  dirName: string;
  title: string;
  oaStatus: string;
  locationCount: number;
}

export interface FulltextFetchResult {
  summary: {
    total: number;
    downloaded: number;
    failed: number;
    skipped: number;
  };
  articles: FulltextFetchArticle[];
  dryRun?: boolean;
}

/**
 * Execute the fulltext fetch command.
 * Loads articles from reviews.yaml, checks OA status via meta.json,
 * and downloads PDFs/XMLs from OA sources.
 */
export async function executeFulltextFetch(
  options: FulltextFetchOptions,
): Promise<FulltextFetchResult> {
  const { sessionId, sessionsDir, source, dryRun, concurrency = 3, retryDelay = 1000 } = options;
  const sessionDir = join(sessionsDir, sessionId);

  // Load reviews.yaml to find articles with fulltext dirs
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const reviewContent = await readFile(reviewsPath, 'utf-8');
  const reviewFile = parseYaml(reviewContent) as ReviewFile;

  const includedArticles = reviewFile.articles.filter(
    (a) => a.finalDecision === 'include' && a.fulltext?.dirName,
  );

  // Load meta.json for each article to check OA status
  const toFetch: FetchArticle[] = [];
  const allArticles: FulltextFetchArticle[] = [];
  let skippedCount = 0;

  const fulltextDir = join(sessionDir, 'fulltext');
  for (const article of includedArticles) {
    const dirName = article.fulltext?.dirName;
    if (!dirName) continue;

    let meta: FulltextMeta;
    try {
      const metaPath = join(fulltextDir, dirName, 'meta.json');
      meta = await loadMeta(metaPath);
    } catch {
      skippedCount++;
      continue;
    }

    const locations = meta.oaLocations ?? [];
    allArticles.push({
      dirName,
      title: meta.title,
      oaStatus: meta.oaStatus,
      locationCount: locations.length,
    });

    // Skip if already has PDF or no OA locations
    if (meta.files.pdf || locations.length === 0) {
      skippedCount++;
      continue;
    }

    toFetch.push({
      dirName,
      oaLocations: locations,
      ...(meta.pmcid ? { pmcid: meta.pmcid } : {}),
    });
  }

  // Dry run: return what would be downloaded
  if (dryRun) {
    return {
      summary: {
        total: includedArticles.length,
        downloaded: 0,
        failed: 0,
        skipped: skippedCount,
      },
      articles: allArticles,
      dryRun: true,
    };
  }

  // Execute downloads
  const fetchOpts: Parameters<typeof fetchAllFulltexts>[2] = {
    concurrency,
    retryDelay,
  };
  if (source) fetchOpts.sourceFilter = source;
  const results = await fetchAllFulltexts(toFetch, sessionDir, fetchOpts);

  let downloadedCount = 0;
  let failedCount = 0;
  for (const result of results) {
    if (result.status === 'downloaded') {
      downloadedCount++;
    } else if (result.status === 'failed') {
      failedCount++;
    } else if (result.status === 'skipped') {
      skippedCount++;
    }
  }

  // Update reviews.yaml and index with download results
  await updateReviewsAndIndex(sessionDir, results);

  return {
    summary: {
      total: includedArticles.length,
      downloaded: downloadedCount,
      failed: failedCount,
      skipped: skippedCount,
    },
    articles: allArticles,
  };
}

/**
 * Update reviews.yaml fulltext.hasFiles and fulltext-index.json after downloads.
 */
async function updateReviewsAndIndex(
  sessionDir: string,
  results: Array<{ dirName: string; status: string; filesDownloaded?: string[] }>,
): Promise<void> {
  const downloadedDirs = new Set(
    results
      .filter((r) => r.status === 'downloaded')
      .map((r) => r.dirName),
  );

  if (downloadedDirs.size === 0) return;

  // Update reviews.yaml
  try {
    const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');
    const reviewFile = parseYaml(content) as ReviewFile;
    let changed = false;

    for (const article of reviewFile.articles) {
      if (article.fulltext?.dirName && downloadedDirs.has(article.fulltext.dirName)) {
        const result = results.find((r) => r.dirName === article.fulltext?.dirName);
        if (result?.filesDownloaded) {
          article.fulltext.hasFiles = {
            pdf: article.fulltext.hasFiles.pdf || result.filesDownloaded.includes('fulltext.pdf'),
            xml: article.fulltext.hasFiles.xml || result.filesDownloaded.includes('fulltext.xml'),
            markdown: article.fulltext.hasFiles.markdown || result.filesDownloaded.includes('fulltext.md'),
          };
          changed = true;
        }
      }
    }

    if (changed) {
      await writeFile(reviewsPath, stringifyYaml(reviewFile), 'utf-8');
    }
  } catch {
    // reviews.yaml update is best-effort
  }

  // Update fulltext-index.json
  try {
    const indexPath = join(sessionDir, 'fulltext', 'fulltext-index.json');
    let index = await loadIndex(indexPath);

    for (const result of results) {
      if (result.status === 'downloaded' && result.filesDownloaded) {
        try {
          index = updateEntry(index, result.dirName, {
            hasFiles: {
              pdf: result.filesDownloaded.includes('fulltext.pdf'),
              xml: result.filesDownloaded.includes('fulltext.xml'),
              markdown: result.filesDownloaded.includes('fulltext.md'),
            },
          });
        } catch {
          // Entry not in index - skip
        }
      }
    }

    await saveIndex(indexPath, index);
  } catch {
    // index update is best-effort
  }
}
