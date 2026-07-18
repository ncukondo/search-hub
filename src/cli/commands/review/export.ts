/**
 * review export command - Export articles based on final decision
 */

import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile, ArticleEntry } from './types.js';

export type ExportFormat = 'yaml' | 'json' | 'jsonl';
export type ExportFilter = 'included' | 'excluded';

export interface ReviewExportOptions {
  sessionId: string;
  only: ExportFilter;
  output: string;
  format: ExportFormat;
}

export interface ReviewExportResult {
  outputPath: string;
  exportedCount: number;
  format: ExportFormat;
}

/**
 * Exported article structure (without review details)
 */
interface ExportedArticle {
  title: string;
  doi?: string;
  pmid?: string;
  scopusId?: string;
  arxivId?: string;
  ericId?: string;
  year?: string;
  authors?: string;
  abstract?: string;
  finalDecision: 'include' | 'exclude';
}

/**
 * Load review file from session directory
 */
async function loadReviewFile(sessionDir: string): Promise<ReviewFile> {
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  return parseYaml(content) as ReviewFile;
}

/**
 * Convert ArticleEntry to exported format (without reviews)
 */
function articleToExport(article: ArticleEntry): ExportedArticle {
  const exported: ExportedArticle = {
    title: article.title,
    finalDecision: article.finalDecision!,
  };

  if (article.doi) exported.doi = article.doi;
  if (article.pmid) exported.pmid = article.pmid;
  if (article.scopusId) exported.scopusId = article.scopusId;
  if (article.arxivId) exported.arxivId = article.arxivId;
  if (article.ericId) exported.ericId = article.ericId;
  if (article.year) exported.year = article.year;
  if (article.authors) exported.authors = article.authors;
  if (article.abstract) exported.abstract = article.abstract;

  return exported;
}

/**
 * Execute review export command
 */
export async function executeReviewExport(
  options: ReviewExportOptions,
  sessionsDir: string,
): Promise<ReviewExportResult> {
  const sessionDir = join(sessionsDir, options.sessionId);
  const reviewFile = await loadReviewFile(sessionDir);

  // Filter articles by final decision
  const targetDecision = options.only === 'included' ? 'include' : 'exclude';
  const filtered = reviewFile.articles.filter(
    (article) => article.finalDecision === targetDecision,
  );

  // Convert to export format
  const exported = filtered.map(articleToExport);

  // Ensure output directory exists
  const outputDir = dirname(options.output);
  await mkdir(outputDir, { recursive: true });

  // Write output in requested format
  let content: string;
  switch (options.format) {
    case 'yaml':
      content = stringifyYaml({ articles: exported }, { lineWidth: 0 });
      break;
    case 'json':
      content = JSON.stringify({ articles: exported }, null, 2);
      break;
    case 'jsonl':
      content = exported.map((a) => JSON.stringify(a)).join('\n');
      if (content) content += '\n';
      break;
  }

  await writeFile(options.output, content, 'utf-8');

  return {
    outputPath: options.output,
    exportedCount: exported.length,
    format: options.format,
  };
}

/**
 * Format export result as human-readable string
 */
export function formatExportOutput(result: ReviewExportResult): string {
  if (result.exportedCount === 0) {
    return 'No articles matched the filter.';
  }

  return `Exported ${result.exportedCount} article(s) to ${result.outputPath} (${result.format})`;
}
