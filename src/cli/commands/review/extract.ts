/**
 * review extract command - Extract subset of articles for distributed review
 */

import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { classifyStatus, type ReviewFile, type ArticleEntry, type ReviewStatus, type ReviewBasis, type WorkFile, type WorkFileArticle } from './types.js';

export type SortOption = 'year' | 'title' | 'random' | 'none';

export interface ReviewExtractOptions {
  sessionId: string;
  filter?: ReviewStatus[];
  sort?: SortOption;
  seed?: number;
  limit?: number;
  offset?: number;
  /** Basis for the review (title, abstract). When specified, outputs work file format. */
  basis?: ReviewBasis;
  /** Reviewer identifier (e.g., "ai:claude"). Required for all extract modes. */
  reviewer?: string;
  /** Name for the review subset (output goes to for-review/<name>/review.yaml) */
  name: string;
}


export interface ReviewExtractResult {
  outputPath: string;
  extractedCount: number;
  totalMatching: number;
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
 * Seeded random number generator (Fisher-Yates shuffle with LCG)
 */
function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let currentSeed = seed;

  // Linear congruential generator
  function random(): number {
    currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
    return currentSeed / 4294967296;
  }

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }

  return result;
}

/**
 * Get the best identifier for an article (doi > pmid > scopusId > arxivId > ericId > title)
 */
function getArticleId(article: ArticleEntry): string {
  if (article.doi) return article.doi;
  if (article.pmid) return article.pmid;
  if (article.scopusId) return article.scopusId;
  if (article.arxivId) return article.arxivId;
  if (article.ericId) return article.ericId;
  return article.title;
}

/**
 * Sort articles based on sort option
 */
function sortArticles(articles: ArticleEntry[], sort: SortOption, seed?: number): ArticleEntry[] {
  switch (sort) {
    case 'year':
      return [...articles].sort((a, b) => {
        const yearA = a.year ?? '';
        const yearB = b.year ?? '';
        return yearA.localeCompare(yearB);
      });
    case 'title':
      return [...articles].sort((a, b) => a.title.localeCompare(b.title));
    case 'random':
      return seededShuffle(articles, seed ?? Date.now());
    case 'none':
    default:
      return articles;
  }
}

/**
 * Validate the name parameter for extract
 */
export function validateName(name: string): void {
  if (!name || name.trim() === '') {
    throw new Error('--name must not be empty');
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(`--name must not contain path separators: "${name}"`);
  }
  if (name.includes('..')) {
    throw new Error(`--name must not contain "..": "${name}"`);
  }
}

/**
 * Execute review extract command
 */
export async function executeReviewExtract(
  options: ReviewExtractOptions,
  sessionsDir: string
): Promise<ReviewExtractResult> {
  validateName(options.name);

  const sessionDir = join(sessionsDir, options.sessionId);
  const outputPath = join(sessionDir, 'for-review', options.name, 'review.yaml');
  const reviewFile = await loadReviewFile(sessionDir);

  // Filter articles by status
  const reviewers = reviewFile.reviewers;
  let filtered: ArticleEntry[];
  if (options.filter && options.filter.length > 0) {
    filtered = reviewFile.articles.filter((article) => {
      const status = classifyStatus(article, reviewers);
      return options.filter!.includes(status);
    });
  } else {
    filtered = [...reviewFile.articles];
  }

  const totalMatching = filtered.length;

  // Sort articles
  const sorted = sortArticles(filtered, options.sort ?? 'none', options.seed);

  // Apply pagination
  let paginated = sorted;
  if (options.offset !== undefined && options.offset > 0) {
    paginated = paginated.slice(options.offset);
  }
  if (options.limit !== undefined && options.limit > 0) {
    paginated = paginated.slice(0, options.limit);
  }

  let finalContent: string;

  // If basis is specified, output work file format
  if (options.basis && options.reviewer) {
    const workFile: WorkFile = {
      sessionId: options.sessionId,
      basis: options.basis,
      reviewer: options.reviewer,
      articles: paginated.map((article) => {
        const workArticle: WorkFileArticle = {
          id: getArticleId(article),
          title: article.title,
          decision: 'uncertain',
          comment: '',
        };
        // Include abstract for abstract and fulltext basis
        if ((options.basis === 'abstract' || options.basis === 'fulltext') && article.abstract) {
          workArticle.abstract = article.abstract;
        }
        // Include fulltext dirName for fulltext basis
        if (options.basis === 'fulltext' && article.fulltext) {
          workArticle.fulltext = article.fulltext.dirName;
        }
        return workArticle;
      }),
    };

    const yamlContent = stringifyYaml(workFile, {
      lineWidth: 0,
    });
    finalContent = yamlContent;
  } else {
    // Build output review file with reviewHistory separation
    const outputFile: ReviewFile = {
      sessionId: options.sessionId,
      ...(options.reviewer && { reviewer: options.reviewer }),
      articles: paginated.map((article) => ({
        ...article,
        reviewHistory: article.reviews ?? [],
        reviews: [],
        finalDecision: null,
      })),
    };

    // Generate YAML with schema reference
    const yamlContent = stringifyYaml(outputFile, {
      lineWidth: 0,
    });

    // Replace finalDecision: null with a commented placeholder for user guidance
    const yamlWithComments = yamlContent.replace(
      /finalDecision: null/g,
      'finalDecision: # include / exclude'
    );

    // Schema reference pointing to adjacent file
    const schemaComment = `# yaml-language-server: $schema=./review.schema.json\n`;
    finalContent = schemaComment + yamlWithComments;
  }

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  await mkdir(outputDir, { recursive: true });

  // Write output YAML
  await writeFile(outputPath, finalContent, 'utf-8');

  // Copy schema file to output directory if it exists
  const schemasDir = join(dirname(sessionsDir), '.search-hub', 'schemas');
  const schemaSourcePath = join(schemasDir, 'review.schema.json');
  const schemaDestPath = join(outputDir, 'review.schema.json');

  try {
    await access(schemaSourcePath);
    await copyFile(schemaSourcePath, schemaDestPath);
  } catch {
    // Schema file doesn't exist, skip copying
  }

  return {
    outputPath,
    extractedCount: paginated.length,
    totalMatching,
  };
}
