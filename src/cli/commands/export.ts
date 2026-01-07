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
    } else if (idType === 'all') {
      if (article.doi) ids.push(`doi:${article.doi}`);
      if (article.pmid) ids.push(`pmid:${article.pmid}`);
      if (article.arxivId) ids.push(`arxiv:${article.arxivId}`);
      if (article.scopusId) ids.push(`scopus:${article.scopusId}`);
      if (article.ericId) ids.push(`eric:${article.ericId}`);
    }
  }

  return ids.join('\n');
}

export function formatJson(articles: Article[]): string {
  return JSON.stringify(articles, null, 2);
}

export function formatJsonl(articles: Article[]): string {
  if (articles.length === 0) {
    return '';
  }
  return articles.map((article) => JSON.stringify(article)).join('\n');
}
