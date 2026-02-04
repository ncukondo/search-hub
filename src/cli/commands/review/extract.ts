/**
 * review extract command - Extract subset of articles for distributed review
 */

import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { classifyStatus, type ReviewFile, type ArticleEntry, type ReviewStatus } from './types.js';

export type SortOption = 'year' | 'title' | 'random' | 'none';

export interface ReviewExtractOptions {
  sessionId: string;
  filter?: ReviewStatus[];
  sort?: SortOption;
  seed?: number;
  limit?: number;
  offset?: number;
  output: string;
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
 * Execute review extract command
 */
export async function executeReviewExtract(
  options: ReviewExtractOptions,
  sessionsDir: string
): Promise<ReviewExtractResult> {
  const sessionDir = join(sessionsDir, options.sessionId);
  const reviewFile = await loadReviewFile(sessionDir);

  // Filter articles by status
  let filtered: ArticleEntry[];
  if (options.filter && options.filter.length > 0) {
    filtered = reviewFile.articles.filter((article) => {
      const status = classifyStatus(article);
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

  // Build output review file
  const outputFile: ReviewFile = {
    sessionId: options.sessionId,
    articles: paginated,
  };

  // Generate YAML with schema reference
  const yamlContent = stringifyYaml(outputFile, {
    lineWidth: 0,
  });

  // Schema reference pointing to adjacent file
  const schemaComment = `# yaml-language-server: $schema=./review.schema.json\n`;
  const finalContent = schemaComment + yamlContent;

  // Ensure output directory exists
  const outputDir = dirname(options.output);
  await mkdir(outputDir, { recursive: true });

  // Write output YAML
  await writeFile(options.output, finalContent, 'utf-8');

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
    outputPath: options.output,
    extractedCount: paginated.length,
    totalMatching,
  };
}
