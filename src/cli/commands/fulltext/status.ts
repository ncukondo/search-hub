/**
 * Fulltext status command.
 * Shows overall fulltext retrieval status for a session.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadMeta, getMetaPath } from '@ncukondo/academic-fulltext';
import type { ReviewFile, ArticleEntry } from '../review/types.js';

export interface FulltextStatusOptions {
  sessionDir: string;
  format?: 'table' | 'json';
}

export interface FulltextStatusResult {
  totalIncluded: number;
  withFulltext: number;
  pdfOnly: number;
  markdownOnly: number;
  both: number;
  pending: number;
  notInitialized: number;
}

/**
 * Classify an article's fulltext state by reading its meta.json.
 * Returns: 'pdf-only' | 'markdown-only' | 'both' | 'pending' | 'not-initialized'
 */
async function classifyArticle(
  article: ArticleEntry,
  sessionDir: string,
): Promise<'pdf-only' | 'markdown-only' | 'both' | 'pending' | 'not-initialized'> {
  if (!article.fulltext?.dirName) {
    return 'not-initialized';
  }

  try {
    const metaPath = getMetaPath(sessionDir, article.fulltext.dirName);
    const meta = await loadMeta(metaPath);

    const hasPdf = meta.files.pdf !== undefined;
    const hasMd = meta.files.markdown !== undefined;

    if (hasPdf && hasMd) return 'both';
    if (hasPdf) return 'pdf-only';
    if (hasMd) return 'markdown-only';
    return 'pending';
  } catch {
    // Can't read meta.json — treat as pending since directory was assigned
    return 'pending';
  }
}

/**
 * Execute the fulltext status command.
 * Scans included articles and reports fulltext retrieval status.
 */
export async function executeFulltextStatus(
  options: FulltextStatusOptions,
): Promise<FulltextStatusResult> {
  const { sessionDir } = options;

  // Load reviews.yaml
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  const reviewFile = parseYaml(content) as ReviewFile;

  // Filter to included articles
  const included = (reviewFile.articles ?? []).filter((a) => a.finalDecision === 'include');

  const result: FulltextStatusResult = {
    totalIncluded: included.length,
    withFulltext: 0,
    pdfOnly: 0,
    markdownOnly: 0,
    both: 0,
    pending: 0,
    notInitialized: 0,
  };

  for (const article of included) {
    const state = await classifyArticle(article, sessionDir);
    switch (state) {
      case 'pdf-only':
        result.pdfOnly++;
        result.withFulltext++;
        break;
      case 'markdown-only':
        result.markdownOnly++;
        result.withFulltext++;
        break;
      case 'both':
        result.both++;
        result.withFulltext++;
        break;
      case 'pending':
        result.pending++;
        break;
      case 'not-initialized':
        result.notInitialized++;
        break;
    }
  }

  return result;
}
