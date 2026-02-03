/**
 * review list command - List articles with optional filtering
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { classifyStatus, type ReviewFile, type ReviewStatus } from './types.js';

export type ListFilter = 'pending' | 'conflicting' | 'needs-final' | 'finalized' | 'all';

export interface ReviewListOptions {
  sessionId: string;
  filter?: ListFilter;
}

export interface ArticleListItem {
  title: string;
  pmid?: string;
  doi?: string;
  scopusId?: string;
  arxivId?: string;
  ericId?: string;
  year?: string;
  status: ReviewStatus;
  reviewCount: number;
  finalDecision?: 'include' | 'exclude';
}

export interface ReviewListResult {
  sessionId: string;
  filter: ListFilter;
  articles: ArticleListItem[];
}

/**
 * Load review file from session directory
 */
async function loadReviewFile(sessionDir: string): Promise<ReviewFile> {
  const reviewsPath = join(sessionDir, 'reviews.yaml');
  const content = await readFile(reviewsPath, 'utf-8');
  return parseYaml(content) as ReviewFile;
}

/**
 * Execute review list command
 */
export async function executeReviewList(
  options: ReviewListOptions,
  sessionsDir: string
): Promise<ReviewListResult> {
  const sessionDir = join(sessionsDir, options.sessionId);
  const reviewFile = await loadReviewFile(sessionDir);
  const filter = options.filter ?? 'all';

  const articles: ArticleListItem[] = [];

  for (const article of reviewFile.articles) {
    const status = classifyStatus(article);

    // Apply filter
    if (filter !== 'all' && status !== filter) {
      continue;
    }

    const item: ArticleListItem = {
      title: article.title,
      status,
      reviewCount: (article.reviews ?? []).length,
    };

    // Add optional identifiers
    if (article.pmid) item.pmid = article.pmid;
    if (article.doi) item.doi = article.doi;
    if (article.scopusId) item.scopusId = article.scopusId;
    if (article.arxivId) item.arxivId = article.arxivId;
    if (article.ericId) item.ericId = article.ericId;
    if (article.year) item.year = article.year;
    if (article.finalDecision) item.finalDecision = article.finalDecision;

    articles.push(item);
  }

  return {
    sessionId: options.sessionId,
    filter,
    articles,
  };
}

/**
 * Format list result as human-readable string
 */
export function formatListOutput(result: ReviewListResult): string {
  if (result.articles.length === 0) {
    return `No articles found matching filter: ${result.filter}`;
  }

  const lines: string[] = [];
  lines.push(`${result.articles.length} articles (filter: ${result.filter})`);
  lines.push('');

  for (const article of result.articles) {
    const id = article.pmid ?? article.doi ?? article.scopusId ?? article.arxivId ?? article.ericId ?? '-';
    const year = article.year ?? '-';
    const decision = article.finalDecision ? ` [${article.finalDecision}]` : '';
    lines.push(`[${article.status}] ${article.title}`);
    lines.push(`  ID: ${id} | Year: ${year} | Reviews: ${article.reviewCount}${decision}`);
  }

  return lines.join('\n');
}
