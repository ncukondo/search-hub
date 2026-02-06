/**
 * Fulltext pending command.
 * Lists articles needing manual download with URLs.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadMeta } from '../../../fulltext/meta.js';
import { getMetaPath } from '../../../fulltext/paths.js';
import type { OALocation } from '../../../fulltext/types.js';
import type { ReviewFile, ArticleEntry } from '../review/types.js';

export interface FulltextPendingOptions {
  sessionDir: string;
  format?: 'table' | 'json';
  exportPath?: string;
}

export interface PendingArticle {
  dirName?: string;
  citationKey?: string;
  title: string;
  doi?: string;
  pmid?: string;
  publisherUrl?: string;
  oaLocations?: OALocation[];
}

export interface FulltextPendingResult {
  totalPending: number;
  articles: PendingArticle[];
}

/**
 * Check if an article has any fulltext files by reading its meta.json.
 */
async function hasFulltextFiles(
  sessionDir: string,
  dirName: string,
): Promise<boolean> {
  try {
    const metaPath = getMetaPath(sessionDir, dirName);
    const meta = await loadMeta(metaPath);
    return (
      meta.files.pdf !== undefined ||
      meta.files.xml !== undefined ||
      meta.files.markdown !== undefined
    );
  } catch {
    return false;
  }
}

/**
 * Build a PendingArticle from an ArticleEntry, enriched with meta.json data.
 */
async function buildPendingArticle(
  article: ArticleEntry,
  sessionDir: string,
): Promise<PendingArticle> {
  const pending: PendingArticle = {
    title: article.title,
  };

  if (article.doi) {
    pending.doi = article.doi;
    pending.publisherUrl = `https://doi.org/${article.doi}`;
  }
  if (article.pmid) pending.pmid = article.pmid;

  if (article.fulltext?.dirName) {
    pending.dirName = article.fulltext.dirName;

    // Try to load meta.json for OA locations and citation key
    try {
      const metaPath = getMetaPath(sessionDir, article.fulltext.dirName);
      const meta = await loadMeta(metaPath);
      pending.citationKey = meta.citationKey;
      if (meta.oaLocations && meta.oaLocations.length > 0) {
        pending.oaLocations = meta.oaLocations;
      }
    } catch {
      // meta.json not readable — skip enrichment
    }
  }

  return pending;
}

/**
 * Format the export file content for batch download.
 * Format: comment line with article identifier, followed by URL lines.
 */
export function formatExportFile(articles: PendingArticle[]): string {
  const blocks: string[] = [];

  for (const article of articles) {
    const identifier = article.dirName ?? article.title;
    const lines: string[] = [`# ${identifier} - ${article.title}`];

    // Publisher URL (DOI link) first
    if (article.publisherUrl) {
      lines.push(article.publisherUrl);
    }

    // OA location URLs
    if (article.oaLocations) {
      for (const loc of article.oaLocations) {
        lines.push(loc.url);
      }
    }

    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n') + '\n';
}

/**
 * Execute the fulltext pending command.
 * Lists included articles that don't yet have fulltext files.
 */
export async function executeFulltextPending(
  options: FulltextPendingOptions,
): Promise<FulltextPendingResult> {
  const { sessionDir, exportPath } = options;

  // Load reviews.yaml
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  const reviewFile = parseYaml(content) as ReviewFile;

  // Filter to included articles
  const included = (reviewFile.articles ?? []).filter(
    (a) => a.finalDecision === 'include',
  );

  const articles: PendingArticle[] = [];

  for (const article of included) {
    // Articles with no fulltext ref are not initialized — always pending
    if (!article.fulltext?.dirName) {
      articles.push(await buildPendingArticle(article, sessionDir));
      continue;
    }

    // Articles with a directory but no files are pending
    const hasFiles = await hasFulltextFiles(sessionDir, article.fulltext.dirName);
    if (!hasFiles) {
      articles.push(await buildPendingArticle(article, sessionDir));
    }
  }

  // Write export file if requested
  if (exportPath && articles.length > 0) {
    const exportContent = formatExportFile(articles);
    await writeFile(exportPath, exportContent, 'utf-8');
  }

  return {
    totalPending: articles.length,
    articles,
  };
}
