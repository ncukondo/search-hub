/**
 * review init command - Generate reviews.yaml from session results
 */

import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { stringify as stringifyYaml } from 'yaml';
import { parse as parseYaml } from 'yaml';
import type { SessionFile } from '../../../session/types.js';
import type { Article, Author, ProviderName } from '../../../providers/base/types.js';
import { loadResults } from '../../../session/results-io.js';
import { deduplicateForReview } from './dedup.js';
import type { ArticleEntry, ReviewFile, MergedSource } from './types.js';

export interface ReviewInitOptions {
  sessionId: string;
  force?: boolean;
}

export interface ReviewInitResult {
  reviewsPath: string;
  articleCount: number;
  duplicatesRemoved: number;
}

/**
 * Format authors array to string
 */
function formatAuthors(authors: Author[]): string {
  return authors
    .map((a) => {
      const parts: string[] = [];
      if (a.family) parts.push(a.family);
      if (a.given) parts.push(a.given.charAt(0));
      return parts.join(' ');
    })
    .join(', ');
}

/**
 * Extract year from publication date
 */
function extractYear(publicationDate?: string): string | undefined {
  if (!publicationDate) return undefined;
  const year = publicationDate.substring(0, 4);
  return /^\d{4}$/.test(year) ? year : undefined;
}

/**
 * Convert Article to ArticleEntry for review file
 */
function articleToEntry(article: Article & { mergedFrom?: MergedSource[] }): ArticleEntry {
  const entry: ArticleEntry = {
    title: article.title,
    reviews: [],
  };

  // Add identifiers
  if (article.doi) entry.doi = article.doi;
  if (article.pmid) entry.pmid = article.pmid;
  if (article.scopusId) entry.scopusId = article.scopusId;
  if (article.arxivId) entry.arxivId = article.arxivId;
  if (article.ericId) entry.ericId = article.ericId;

  // Add bibliographic info
  if (article.authors && article.authors.length > 0) {
    entry.authors = formatAuthors(article.authors);
  }
  const year = extractYear(article.publicationDate);
  if (year) entry.year = year;
  if (article.abstract) entry.abstract = article.abstract;

  // Add deduplication tracking
  if (article.mergedFrom && article.mergedFrom.length > 0) {
    entry.mergedFrom = article.mergedFrom;
  }

  return entry;
}

/**
 * Find the schema file location (in the package)
 */
async function findSchemaSource(): Promise<string> {
  // Try relative to this file (src/cli/commands/review -> schemas)
  const possiblePaths = [
    join(dirname(import.meta.url.replace('file://', '')), '../../../../schemas/review.schema.json'),
    join(process.cwd(), 'schemas/review.schema.json'),
  ];

  for (const path of possiblePaths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try next path
    }
  }

  throw new Error('Could not find review.schema.json');
}

/**
 * Execute review init command
 */
export async function executeReviewInit(
  options: ReviewInitOptions,
  sessionsDir: string
): Promise<ReviewInitResult> {
  const sessionDir = join(sessionsDir, options.sessionId);

  // Load session file
  const sessionPath = join(sessionDir, 'session.yaml');
  const sessionContent = await readFile(sessionPath, 'utf-8');
  const session = parseYaml(sessionContent) as SessionFile;

  // Check if .internal/reviews.yaml already exists
  const internalDir = join(sessionDir, '.internal');
  const reviewsPath = join(internalDir, 'reviews.yaml');
  try {
    await access(reviewsPath);
    if (!options.force) {
      throw new Error(`reviews.yaml already exists. Use --force to overwrite.`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  // Create .internal/ directory
  await mkdir(internalDir, { recursive: true });

  // Load all results from session
  const allArticles: Article[] = [];
  const providers = Object.keys(session.databases) as ProviderName[];

  for (const provider of providers) {
    const dbStatus = session.databases[provider];
    if (!dbStatus) continue;
    const articles = await loadResults(sessionDir, provider);
    allArticles.push(...articles);
  }

  // Deduplicate with mergedFrom tracking
  const { articles: dedupedArticles, duplicatesRemoved } = deduplicateForReview(allArticles);

  // Convert to ArticleEntry format
  const articleEntries = dedupedArticles.map(articleToEntry);

  // Build review file
  const reviewFile: ReviewFile = {
    sessionId: options.sessionId,
    articles: articleEntries,
  };

  // Generate YAML with schema reference comment
  const yamlContent = stringifyYaml(reviewFile, {
    lineWidth: 0, // Disable line wrapping
  });

  // Add schema reference comment at top
  // Path from sessions/{id}/.internal/ to .search-hub/schemas/
  const schemaPath = '../../../../.search-hub/schemas/review.schema.json';
  const schemaComment = `# yaml-language-server: $schema=${schemaPath}\n`;

  // Replace empty reviews arrays with commented example
  const reviewsExample = `reviews:
        # - reviewer: human:your-name
        #   decision: include  # include / exclude / uncertain
        #   comment: reason`;
  const finalContent = schemaComment + yamlContent.replace(
    /reviews: \[\]/g,
    reviewsExample
  );

  // Write reviews.yaml
  await writeFile(reviewsPath, finalContent, 'utf-8');

  // Copy schema file to .search-hub/schemas/
  const schemasDir = join(dirname(sessionsDir), '.search-hub', 'schemas');
  await mkdir(schemasDir, { recursive: true });
  const schemaDestPath = join(schemasDir, 'review.schema.json');

  try {
    const schemaSourcePath = await findSchemaSource();
    await copyFile(schemaSourcePath, schemaDestPath);
  } catch {
    // If we can't find the schema file, skip copying
    // This might happen in test environments
  }

  return {
    reviewsPath,
    articleCount: articleEntries.length,
    duplicatesRemoved,
  };
}
