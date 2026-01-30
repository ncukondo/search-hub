import type { ProviderName } from '../../session/types.js';
import type { Config } from '../../config/index.js';
import { parseProviderNames } from '../utils/validation.js';

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
  db?: string | undefined;
  query?: string | undefined;
  name?: string | undefined;
  maxResults?: string | undefined;
  dryRun?: boolean | undefined;
  noResume?: boolean | undefined;
}

export interface TranslationResult {
  provider: string;
  query: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Options for enhanced dry-run output.
 */
export interface DryRunOutputOptions {
  config?: Config;
  providers?: ProviderName[];
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
    result.providers = parseProviderNames(options.db);
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
  if (!options.queryFile && !options.directQuery) {
    return {
      valid: false,
      error: 'Either a query file or --query option is required',
    };
  }

  if (options.directQuery && (!options.providers || options.providers.length === 0)) {
    return {
      valid: false,
      error: 'Direct query (--query) requires --db option to specify the provider',
    };
  }

  if (options.directQuery && options.providers && options.providers.length > 1) {
    return {
      valid: false,
      error: 'Direct query (--query) can only be used with a single provider (--db)',
    };
  }

  return { valid: true };
}
/**
 * Format provider readiness summary for dry-run output.
 */
export function formatProviderReadiness(providers: ProviderName[], config: Config): string {
  const lines: string[] = [];
  lines.push('Provider readiness:');
  for (const provider of providers) {
    const providerConfig = config.providers[provider];
    const status = getProviderStatus(provider, providerConfig);
    const mark = status.ready ? '✓' : '✗';
    lines.push(`  ${mark} ${provider.padEnd(10)}${status.message}`);
  }
  return lines.join('\n');
}

function getProviderStatus(
  provider: ProviderName,
  providerConfig: { email?: string; api_key?: string }
): { ready: boolean; message: string } {
  switch (provider) {
    case 'pubmed': {
      if (!providerConfig.email) {
        return { ready: true, message: 'ready (email: not configured (recommended))' };
      }
      return { ready: true, message: 'ready (email: configured)' };
    }
    case 'scopus': {
      if (!providerConfig.api_key) {
        return { ready: false, message: 'missing api_key (required)' };
      }
      return { ready: true, message: 'ready' };
    }
    case 'eric':
    case 'arxiv':
      return { ready: true, message: 'ready' };
    default:
      return { ready: true, message: 'ready' };
  }
}
/**
 * Format query diagnostics warnings for dry-run output.
 */
export function formatQueryDiagnostics(translations: TranslationResult[]): string {
  const warnings: string[] = [];
  for (const t of translations) {
    if (t.provider === 'pubmed') {
      if (/\bNOT\b/.test(t.query)) {
        warnings.push('  ⚠ pubmed: query uses NOT operator (ensure correct syntax for exclusions)');
      }
      if (/\*\[(?:mh|mesh)\]/i.test(t.query)) {
        warnings.push('  ⚠ pubmed: wildcard in MeSH term — PubMed does not support wildcards in MeSH fields');
      }
    }
  }
  if (warnings.length === 0) {
    return '';
  }
  const lines: string[] = [];
  lines.push('Diagnostics:');
  lines.push(...warnings);
  return lines.join('\n');
}

export function formatDryRunOutput(
  translations: TranslationResult[],
  options?: DryRunOutputOptions
): string {
  if (translations.length === 0) {
    return 'No translations available.';
  }
  const sections: string[] = [];
  if (options?.config && options?.providers) {
    sections.push(formatProviderReadiness(options.providers, options.config));
    sections.push('');
  }
  const queryLines: string[] = [];
  queryLines.push('Translated queries:');
  queryLines.push('');
  for (const t of translations) {
    queryLines.push(`[${t.provider}]`);
    queryLines.push(t.query);
    queryLines.push('');
  }
  sections.push(queryLines.join('\n'));
  const diagnostics = formatQueryDiagnostics(translations);
  if (diagnostics) {
    sections.push(diagnostics);
    sections.push('');
  }
  return sections.join('\n');
}
