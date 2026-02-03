/**
 * review merge command - Merge edited file back into main reviews.yaml
 */

import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile, ArticleEntry, Review } from './types.js';

export interface ReviewMergeOptions {
  sessionId: string;
  file: string;
  dryRun?: boolean;
}

export interface ReviewMergeResult {
  reviewsAdded: number;
  reviewsSkipped: number;
  decisionsSet: number;
  warnings: string[];
}

/**
 * Load review file from path
 */
async function loadReviewFile(path: string): Promise<ReviewFile> {
  const content = await readFile(path, 'utf-8');
  return parseYaml(content) as ReviewFile;
}

/**
 * Get article key for matching
 */
function getArticleKey(article: ArticleEntry): string {
  // Use first available identifier
  if (article.pmid) return `pmid:${article.pmid}`;
  if (article.doi) return `doi:${article.doi.toLowerCase()}`;
  if (article.scopusId) return `scopus:${article.scopusId}`;
  if (article.arxivId) return `arxiv:${article.arxivId}`;
  if (article.ericId) return `eric:${article.ericId}`;
  // Fallback to title
  return `title:${article.title.toLowerCase()}`;
}

/**
 * Check if two reviews are duplicates (same reviewer + timestamp)
 */
function isDuplicateReview(existing: Review, incoming: Review): boolean {
  return existing.reviewer === incoming.reviewer && existing.timestamp === incoming.timestamp;
}

/**
 * Match article from extracted file to main file
 */
function findMatchingArticle(
  extracted: ArticleEntry,
  mainArticles: ArticleEntry[]
): ArticleEntry | undefined {
  // Try matching by various identifiers
  for (const main of mainArticles) {
    if (extracted.pmid && main.pmid && extracted.pmid === main.pmid) {
      return main;
    }
    if (extracted.doi && main.doi && extracted.doi.toLowerCase() === main.doi.toLowerCase()) {
      return main;
    }
    if (extracted.scopusId && main.scopusId && extracted.scopusId === main.scopusId) {
      return main;
    }
    if (extracted.arxivId && main.arxivId && extracted.arxivId === main.arxivId) {
      return main;
    }
    if (extracted.ericId && main.ericId && extracted.ericId === main.ericId) {
      return main;
    }
  }
  return undefined;
}

/**
 * Execute review merge command
 */
export async function executeReviewMerge(
  options: ReviewMergeOptions,
  sessionsDir: string
): Promise<ReviewMergeResult> {
  const sessionDir = join(sessionsDir, options.sessionId);
  const mainReviewsPath = join(sessionDir, 'reviews.yaml');

  // Load both files
  const mainFile = await loadReviewFile(mainReviewsPath);
  const extractedFile = await loadReviewFile(options.file);

  const result: ReviewMergeResult = {
    reviewsAdded: 0,
    reviewsSkipped: 0,
    decisionsSet: 0,
    warnings: [],
  };

  // Build index of main articles by key
  const mainByKey = new Map<string, ArticleEntry>();
  for (const article of mainFile.articles) {
    mainByKey.set(getArticleKey(article), article);
  }

  // Process each extracted article
  for (const extracted of extractedFile.articles) {
    const mainArticle = findMatchingArticle(extracted, mainFile.articles);

    if (!mainArticle) {
      result.warnings.push(`Article not found in main file: "${extracted.title}"`);
      continue;
    }

    // Merge reviews
    for (const review of extracted.reviews) {
      const isDuplicate = mainArticle.reviews.some((existing) =>
        isDuplicateReview(existing, review)
      );

      if (isDuplicate) {
        result.reviewsSkipped++;
      } else {
        if (!options.dryRun) {
          mainArticle.reviews.push(review);
        }
        result.reviewsAdded++;
      }
    }

    // Overwrite finalDecision if set in extracted
    if (extracted.finalDecision !== undefined) {
      if (!options.dryRun) {
        mainArticle.finalDecision = extracted.finalDecision;
      }
      result.decisionsSet++;
    }
  }

  // Write back if not dry-run
  if (!options.dryRun) {
    const yamlContent = stringifyYaml(mainFile, {
      lineWidth: 0,
    });

    // Preserve schema reference comment
    const schemaPath = '../../../.search-hub/schemas/review.schema.json';
    const schemaComment = `# yaml-language-server: $schema=${schemaPath}\n`;
    const finalContent = schemaComment + yamlContent;

    await writeFile(mainReviewsPath, finalContent, 'utf-8');
  }

  return result;
}

/**
 * Format merge result as human-readable string
 */
export function formatMergeOutput(result: ReviewMergeResult, dryRun: boolean): string {
  const lines: string[] = [];

  if (dryRun) {
    lines.push('Dry run - no changes made');
    lines.push('');
  }

  lines.push('Merge Summary:');
  lines.push(`  Reviews added:    ${result.reviewsAdded}`);
  lines.push(`  Reviews skipped:  ${result.reviewsSkipped} (duplicates)`);
  lines.push(`  Decisions set:    ${result.decisionsSet}`);

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}
