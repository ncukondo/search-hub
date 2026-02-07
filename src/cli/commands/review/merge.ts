/**
 * review merge command - Merge edited file back into main reviews.yaml
 */

import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile, ArticleEntry, Review, WorkFile, ReviewBasis } from './types.js';
import { validateName } from './extract.js';


/**
 * Check if a file is a work file (has basis field)
 */
function isWorkFile(file: unknown): file is WorkFile {
  return (
    typeof file === 'object' &&
    file !== null &&
    'basis' in file &&
    'reviewer' in file &&
    'articles' in file &&
    Array.isArray((file as WorkFile).articles)
  );
}

export interface ReviewMergeOptions {
  sessionId: string;
  /** Name of the review subset (reads from for-review/<name>/review.yaml) */
  name: string;
  dryRun?: boolean;
}

export interface ReviewMergeResult {
  reviewsAdded: number;
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
 * Auto-detect review basis from article data: fulltext > abstract > title
 */
function detectBasis(article: ArticleEntry): ReviewBasis {
  if (article.fulltext) return 'fulltext';
  if (article.abstract) return 'abstract';
  return 'title';
}

/**
 * Register a reviewer in the review file's reviewers registry.
 * Deduplicates by name+basis pair.
 */
export function registerReviewer(reviewFile: ReviewFile, name: string, basis: ReviewBasis): void {
  if (!reviewFile.reviewers) {
    reviewFile.reviewers = [];
  }
  const exists = reviewFile.reviewers.some((r) => r.name === name && r.basis === basis);
  if (!exists) {
    reviewFile.reviewers.push({ name, basis });
  }
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
 * Match work file article by id to main file
 * The id can be a DOI, PMID, ScopusId, ArxivId, EricId, or title
 */
function findMatchingArticleById(
  id: string,
  mainArticles: ArticleEntry[]
): ArticleEntry | undefined {
  for (const main of mainArticles) {
    // Match by DOI (case-insensitive)
    if (main.doi && main.doi.toLowerCase() === id.toLowerCase()) {
      return main;
    }
    // Match by PMID
    if (main.pmid && main.pmid === id) {
      return main;
    }
    // Match by ScopusId
    if (main.scopusId && main.scopusId === id) {
      return main;
    }
    // Match by ArxivId
    if (main.arxivId && main.arxivId === id) {
      return main;
    }
    // Match by EricId
    if (main.ericId && main.ericId === id) {
      return main;
    }
    // Match by title (fallback, case-insensitive)
    if (main.title.toLowerCase() === id.toLowerCase()) {
      return main;
    }
  }
  return undefined;
}

/**
 * Process work file format (with basis/reviewer)
 */
function processWorkFile(
  workFile: WorkFile,
  mainFile: ReviewFile,
  options: ReviewMergeOptions
): ReviewMergeResult {
  const result: ReviewMergeResult = {
    reviewsAdded: 0,
    decisionsSet: 0,
    warnings: [],
  };

  const timestamp = new Date().toISOString();

  // Register the reviewer for this work file's basis
  if (!options.dryRun) {
    registerReviewer(mainFile, workFile.reviewer, workFile.basis);
  }

  for (const workArticle of workFile.articles) {
    // Skip articles with null decision (not yet reviewed)
    if (workArticle.decision === null) {
      continue;
    }

    const mainArticle = findMatchingArticleById(workArticle.id, mainFile.articles);

    if (!mainArticle) {
      result.warnings.push(`Article not found in main file: id="${workArticle.id}"`);
      continue;
    }

    // Ensure mainArticle.reviews is an array
    if (!mainArticle.reviews) {
      mainArticle.reviews = [];
    }

    // Create review from work file article
    const review: Review = {
      reviewer: workFile.reviewer,
      decision: workArticle.decision,
      basis: workFile.basis,
      timestamp,
    };

    // Add comment if provided
    if (workArticle.comment) {
      review.comment = workArticle.comment;
    }

    if (!options.dryRun) {
      mainArticle.reviews.push(review);
    }
    result.reviewsAdded++;
  }

  return result;
}

/**
 * Process review file format (with reviewHistory separation)
 */
function processReviewFile(
  extractedFile: ReviewFile,
  mainFile: ReviewFile,
  options: ReviewMergeOptions
): ReviewMergeResult {
  const result: ReviewMergeResult = {
    reviewsAdded: 0,
    decisionsSet: 0,
    warnings: [],
  };

  const timestamp = new Date().toISOString();
  const topLevelReviewer = extractedFile.reviewer;

  for (const extracted of extractedFile.articles) {
    const mainArticle = findMatchingArticle(extracted, mainFile.articles);

    if (!mainArticle) {
      result.warnings.push(`Article not found in main file: "${extracted.title}"`);
      continue;
    }

    // Merge only reviews[] (reviewHistory is ignored)
    const extractedReviews = extracted.reviews ?? [];

    // Ensure mainArticle.reviews is an array
    if (!mainArticle.reviews) {
      mainArticle.reviews = [];
    }

    for (const review of extractedReviews) {
      // Fill in reviewer from top-level field if not on individual review
      const reviewer = review.reviewer ?? topLevelReviewer;
      if (!reviewer) {
        throw new Error('reviewer is required: set reviewer on individual review or top-level ReviewFile');
      }
      // Fill in basis from review or auto-detect from article data
      const basis = review.basis ?? detectBasis(extracted);

      if (!options.dryRun) {
        const mergedReview: Review = {
          ...review,
          reviewer,
          basis,
          timestamp: review.timestamp ?? timestamp,
        };
        mainArticle.reviews.push(mergedReview);

        // Register reviewer
        registerReviewer(mainFile, reviewer, basis);
      }
      result.reviewsAdded++;
    }

    // Overwrite finalDecision if set in extracted (null means unset)
    if (extracted.finalDecision !== undefined && extracted.finalDecision !== null) {
      if (!options.dryRun) {
        mainArticle.finalDecision = extracted.finalDecision;
      }
      result.decisionsSet++;
    }
  }

  return result;
}

/**
 * Execute review merge command
 */
export async function executeReviewMerge(
  options: ReviewMergeOptions,
  sessionsDir: string
): Promise<ReviewMergeResult> {
  validateName(options.name);
  const sessionDir = join(sessionsDir, options.sessionId);
  const mainReviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const filePath = join(sessionDir, 'for-review', options.name, 'review.yaml');

  // Load both files
  const mainFile = await loadReviewFile(mainReviewsPath);
  const content = await readFile(filePath, 'utf-8');
  const inputFile = parseYaml(content);

  let result: ReviewMergeResult;

  // Detect file format and process accordingly
  if (isWorkFile(inputFile)) {
    result = processWorkFile(inputFile, mainFile, options);
  } else {
    result = processReviewFile(inputFile as ReviewFile, mainFile, options);
  }

  // Write back if not dry-run
  if (!options.dryRun) {
    const yamlContent = stringifyYaml(mainFile, {
      lineWidth: 0,
    });

    // Preserve schema reference comment
    // Path from sessions/{id}/.internal/ to .search-hub/schemas/
    const schemaPath = '../../../../.search-hub/schemas/review.schema.json';
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
