import type { ProviderName } from '../../providers/base/types.js';
import type { Article } from '../../providers/base/types.js';
import { parseProviderNames } from '../utils/validation.js';

export type ExportFormat = 'ids' | 'json' | 'jsonl';
export type IdType = 'doi' | 'pmid' | 'all';

export interface ExportCommandOptions {
  sessionId: string;
  format: ExportFormat;
  outputPath?: string;
  providers?: ProviderName[];
  idType?: IdType;
}

export interface CommandLineOptions {
  format?: string | undefined;
  output?: string | undefined;
  db?: string | undefined;
  idType?: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID_FORMATS: ExportFormat[] = ['ids', 'json', 'jsonl'];
const VALID_ID_TYPES: IdType[] = ['doi', 'pmid', 'all'];

export function parseExportOptions(
  sessionId: string,
  options: CommandLineOptions
): ExportCommandOptions {
  const result: ExportCommandOptions = {
    sessionId,
    format: (options.format as ExportFormat) || 'jsonl',
  };

  if (options.output) {
    result.outputPath = options.output;
  }

  if (options.db) {
    result.providers = parseProviderNames(options.db);
  }

  if (options.idType) {
    result.idType = options.idType as IdType;
  }

  return result;
}

export function validateExportInput(options: ExportCommandOptions): ValidationResult {
  if (!options.sessionId || options.sessionId.trim() === '') {
    return {
      valid: false,
      error: 'A session ID is required',
    };
  }

  if (!VALID_FORMATS.includes(options.format)) {
    return {
      valid: false,
      error: `Invalid format: ${options.format}. Valid formats are: ${VALID_FORMATS.join(', ')}`,
    };
  }

  if (options.idType) {
    if (!VALID_ID_TYPES.includes(options.idType)) {
      return {
        valid: false,
        error: `Invalid id-type: ${options.idType}. Valid types are: ${VALID_ID_TYPES.join(', ')}`,
      };
    }

    if (options.format !== 'ids') {
      return {
        valid: false,
        error: '--id-type can only be used with --format ids',
      };
    }
  }

  return { valid: true };
}

export function formatIds(articles: Article[], idType: IdType): string {
  if (idType === 'all') {
    const groups: string[] = [];
    for (const article of articles) {
      const ids: string[] = [];
      if (article.pmid) ids.push(`pmid:${article.pmid}`);
      if (article.doi) ids.push(`doi:${article.doi}`);
      if (article.arxivId) ids.push(`arxiv:${article.arxivId}`);
      if (article.scopusId) ids.push(`scopus:${article.scopusId}`);
      if (article.ericId) ids.push(`eric:${article.ericId}`);
      if (ids.length > 0) {
        groups.push(ids.join('\n'));
      }
    }
    return groups.join('\n\n');
  }

  const ids: string[] = [];
  for (const article of articles) {
    if (idType === 'doi') {
      if (article.doi) {
        ids.push(article.doi);
      }
    } else if (idType === 'pmid') {
      if (article.pmid) {
        ids.push(article.pmid);
      }
    }
  }

  return ids.join('\n');
}

function extractYear(publicationDate: string | undefined): number | null {
  if (!publicationDate) return null;
  const year = parseInt(publicationDate.substring(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function addYearField(articles: Article[]): (Article & { year: number | null })[] {
  return articles.map((article) => ({
    ...article,
    year: extractYear(article.publicationDate),
  }));
}

export interface JsonExportMetadata {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  databases: Record<string, number>;
}

export function formatJson(articles: Article[], metadata?: JsonExportMetadata): string {
  const articlesWithYear = addYearField(articles);

  if (!metadata) {
    return JSON.stringify(articlesWithYear, null, 2);
  }

  return JSON.stringify(
    {
      session: {
        id: metadata.sessionId,
        name: metadata.sessionName,
        createdAt: metadata.createdAt,
      },
      summary: {
        totalResults: articles.length,
        databases: metadata.databases,
      },
      results: articlesWithYear,
    },
    null,
    2
  );
}

export function formatJsonl(articles: Article[]): string {
  if (articles.length === 0) {
    return '';
  }
  return addYearField(articles).map((article) => JSON.stringify(article)).join('\n');
}


function getArticleKeys(article: Article): string[] {
  const keys: string[] = [];
  if (article.pmid) keys.push(`pmid:${article.pmid}`);
  if (article.doi) keys.push(`doi:${article.doi.toLowerCase()}`);
  if (article.arxivId) keys.push(`arxiv:${article.arxivId}`);
  if (article.scopusId) keys.push(`scopus:${article.scopusId}`);
  if (article.ericId) keys.push(`eric:${article.ericId}`);
  return keys;
}

const METADATA_FIELDS: (keyof Article)[] = [
  'doi', 'pmid', 'arxivId', 'scopusId', 'ericId',
  'abstract', 'publicationDate', 'journal', 'volume', 'issue', 'pages',
];

function countMetadataFields(article: Article): number {
  let count = 0;
  for (const field of METADATA_FIELDS) {
    if (article[field] !== undefined && article[field] !== '') {
      count++;
    }
  }
  return count;
}

export interface DeduplicationResult {
  articles: Article[];
  duplicatesRemoved: number;
}

export function deduplicateArticles(articles: Article[]): DeduplicationResult {
  // Map from identifier key to index in the unique array
  const keyToIndex = new Map<string, number>();
  const unique: Article[] = [];
  let duplicatesRemoved = 0;

  for (const article of articles) {
    const keys = getArticleKeys(article);

    if (keys.length === 0) {
      // No identifiers - cannot deduplicate, keep the article
      unique.push(article);
      continue;
    }

    // Check if any identifier has been seen before
    let existingIndex: number | undefined;
    for (const key of keys) {
      const idx = keyToIndex.get(key);
      if (idx !== undefined) {
        existingIndex = idx;
        break;
      }
    }

    if (existingIndex !== undefined) {
      // Duplicate found - compare metadata richness
      const existing = unique[existingIndex]!;
      if (countMetadataFields(article) > countMetadataFields(existing)) {
        // Replace with the richer record
        unique[existingIndex] = article;
        // Update all keys to point to the same index
        const newKeys = getArticleKeys(article);
        for (const key of newKeys) {
          keyToIndex.set(key, existingIndex);
        }
      }
      duplicatesRemoved++;
    } else {
      const index = unique.length;
      unique.push(article);
      // Map all identifiers to this index
      for (const key of keys) {
        keyToIndex.set(key, index);
      }
    }
  }

  return { articles: unique, duplicatesRemoved };
}
