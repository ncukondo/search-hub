import type { ProviderName } from '../../session/types.js';

export interface SearchCommandOptions {
  queryFile?: string;
  directQuery?: string;
  providers?: ProviderName[];
  sessionName?: string;
  maxResults?: number;
  dryRun?: boolean;
  noResume?: boolean;
}

export interface CommandLineOptions {
  db?: string;
  query?: string;
  name?: string;
  maxResults?: string;
  dryRun?: boolean;
  noResume?: boolean;
}

export interface TranslationResult {
  provider: string;
  query: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function parseSearchOptions(
  queryFile: string | undefined,
  options: CommandLineOptions
): SearchCommandOptions {
  const result: SearchCommandOptions = {};

  if (queryFile) {
    result.queryFile = queryFile;
  }

  if (options.query) {
    result.directQuery = options.query;
  }

  if (options.db) {
    result.providers = options.db.split(',').map((p) => p.trim()) as ProviderName[];
  }

  if (options.name) {
    result.sessionName = options.name;
  }

  if (options.maxResults) {
    result.maxResults = parseInt(options.maxResults, 10);
  }

  if (options.dryRun) {
    result.dryRun = true;
  }

  if (options.noResume) {
    result.noResume = true;
  }

  return result;
}

export function validateSearchInput(options: SearchCommandOptions): ValidationResult {
  // Case 1: Neither query file nor direct query
  if (!options.queryFile && !options.directQuery) {
    return {
      valid: false,
      error: 'Either a query file or --query option is required',
    };
  }

  // Case 2: Direct query without provider
  if (options.directQuery && (!options.providers || options.providers.length === 0)) {
    return {
      valid: false,
      error: 'Direct query (--query) requires --db option to specify the provider',
    };
  }

  // Case 3: Direct query with multiple providers
  if (options.directQuery && options.providers && options.providers.length > 1) {
    return {
      valid: false,
      error: 'Direct query (--query) can only be used with a single provider (--db)',
    };
  }

  return { valid: true };
}

export function formatDryRunOutput(translations: TranslationResult[]): string {
  if (translations.length === 0) {
    return 'No translations available.';
  }

  const lines: string[] = [];
  lines.push('Translated queries:');
  lines.push('');

  for (const t of translations) {
    lines.push(`[${t.provider}]`);
    lines.push(t.query);
    lines.push('');
  }

  return lines.join('\n');
}
