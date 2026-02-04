/**
 * Results command - display articles from a session in the terminal.
 */
import type { ProviderName, Article } from '../../providers/base/types.js';
import { parseProviderNames } from '../utils/validation.js';
import type { ExportFilter } from './export.js';

export interface ResultsCommandOptions {
  sessionId: string;
  limit?: number;
  offset?: number;
  json: boolean;
  fields?: string[];
  providers?: ProviderName[];
  filter?: ExportFilter;
  showAbstract: boolean;
  abstractLength?: number;
}

export interface CommandLineOptions {
  limit?: string | undefined;
  offset?: string | undefined;
  json?: boolean | undefined;
  fields?: string | undefined;
  db?: string | undefined;
  filterYear?: string | undefined;
  filterTitle?: string | undefined;
  filterAbstract?: string | undefined;
  abstract?: boolean | undefined;
  abstractLength?: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface FormatOptions {
  sessionId: string;
  sessionName: string;
  total: number;
  offset?: number | undefined;
  filteredFrom?: number | undefined;
  showAbstract?: boolean | undefined;
  abstractLength?: number | undefined;
}

export function parseResultsOptions(
  sessionId: string,
  options: CommandLineOptions
): ResultsCommandOptions {
  const result: ResultsCommandOptions = {
    sessionId,
    json: options.json ?? false,
    showAbstract: options.abstract ?? false,
  };

  if (options.abstractLength) {
    result.abstractLength = parseInt(options.abstractLength, 10);
  }

  if (options.limit) {
    result.limit = parseInt(options.limit, 10);
  }

  if (options.offset) {
    result.offset = parseInt(options.offset, 10);
  }

  if (options.fields) {
    result.fields = options.fields.split(',').map((f) => f.trim());
  }

  if (options.db) {
    result.providers = parseProviderNames(options.db);
  }

  // Parse filters
  const filter: ExportFilter = {};
  let hasFilter = false;

  if (options.filterYear) {
    const parts = options.filterYear.split('-');
    if (parts.length === 2) {
      const from = parseInt(parts[0]!, 10);
      const to = parseInt(parts[1]!, 10);
      if (!Number.isNaN(from)) filter.yearFrom = from;
      if (!Number.isNaN(to)) filter.yearTo = to;
      hasFilter = true;
    } else if (parts.length === 1) {
      const year = parseInt(parts[0]!, 10);
      if (!Number.isNaN(year)) {
        filter.yearFrom = year;
        filter.yearTo = year;
        hasFilter = true;
      }
    }
  }

  if (options.filterTitle) {
    filter.titleKeywords = options.filterTitle.split(',').map((s) => s.trim()).filter(Boolean);
    hasFilter = true;
  }

  if (options.filterAbstract) {
    filter.abstractKeywords = options.filterAbstract.split(',').map((s) => s.trim()).filter(Boolean);
    hasFilter = true;
  }

  if (hasFilter) {
    result.filter = filter;
  }

  return result;
}

export function validateResultsInput(options: ResultsCommandOptions): ValidationResult {
  if (!options.sessionId || options.sessionId.trim() === '') {
    return {
      valid: false,
      error: 'A session ID is required',
    };
  }

  if (options.limit !== undefined && options.limit < 0) {
    return {
      valid: false,
      error: 'limit must be a non-negative number',
    };
  }

  if (options.offset !== undefined && options.offset < 0) {
    return {
      valid: false,
      error: 'offset must be a non-negative number',
    };
  }

  return { valid: true };
}

const DEFAULT_TITLE_MAX_LENGTH = 70;

function extractYear(publicationDate: string | undefined): number | null {
  if (!publicationDate) return null;
  const year = parseInt(publicationDate.substring(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function truncateTitle(title: string, maxLength: number = DEFAULT_TITLE_MAX_LENGTH): string {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + '...';
}

export function formatResultsList(
  articles: Article[],
  options: FormatOptions
): string {
  const lines: string[] = [];

  // Header
  lines.push(`Results: ${options.sessionName} (${options.sessionId})`);

  if (articles.length === 0) {
    lines.push('No articles found.');
    return lines.join('\n');
  }

  // Pagination info
  const offset = options.offset ?? 0;
  const startNum = offset + 1;
  const endNum = offset + articles.length;
  const articleWord = options.total === 1 ? 'article' : 'articles';

  let countInfo = `Showing ${startNum}-${endNum} of ${options.total} ${articleWord}`;
  if (options.filteredFrom !== undefined && options.filteredFrom !== options.total) {
    countInfo += ` (filtered from ${options.filteredFrom})`;
  }
  lines.push(countInfo);
  lines.push('');

  // Articles
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]!;
    const num = offset + i + 1;
    const year = extractYear(article.publicationDate);
    const yearStr = year !== null ? String(year) : '----';
    const title = truncateTitle(article.title);

    lines.push(`${num.toString().padStart(2)}. [${yearStr}] ${title}`);

    if (article.journal) {
      lines.push(`    ${article.journal}`);
    }

    if (article.doi) {
      lines.push(`    DOI: ${article.doi}`);
    }

    if (options.showAbstract && article.abstract) {
      lines.push('');
      lines.push(`    Abstract: ${article.abstract}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function addYearField(articles: Article[]): (Article & { year: number | null })[] {
  return articles.map((article) => ({
    ...article,
    year: extractYear(article.publicationDate),
  }));
}

export function formatResultsJson(articles: Article[]): string {
  const articlesWithYear = addYearField(articles);
  return JSON.stringify(articlesWithYear, null, 2);
}
