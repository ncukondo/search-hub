import type { ProviderName } from '../../session/types.js';
import type { ConnectionTestResult } from '../../providers/base/types.js';
import type { Config } from '../../config/index.js';
import { parseProviderNames } from '../utils/validation.js';
import { createProviderInstance } from './search-executor.js';

export interface SearchCommandOptions {
  queryFile?: string;
  directQuery?: string;
  providers?: ProviderName[];
  sessionName?: string;
  maxResults?: number;
  dryRun?: boolean;
  countOnly?: boolean;
  noResume?: boolean;
}

export interface CommandLineOptions {
  db?: string | undefined;
  query?: string | undefined;
  name?: string | undefined;
  maxResults?: string | undefined;
  dryRun?: boolean | undefined;
  countOnly?: boolean | undefined;
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
  skipConnectionTest?: boolean | undefined;
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

  if (options.countOnly) {
    result.countOnly = true;
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
 * Test provider connections and return results.
 */
export async function testProviderConnections(
  providers: ProviderName[],
  config: Config
): Promise<Record<string, ConnectionTestResult>> {
  const results: Record<string, ConnectionTestResult> = {};
  await Promise.all(
    providers.map(async (name) => {
      const provider = createProviderInstance(name, config);
      if (!provider) {
        results[name] = { ok: false, error: 'Provider configuration incomplete' };
        return;
      }
      results[name] = await provider.testConnection();
    })
  );
  return results;
}

/**
 * Format provider readiness summary for dry-run output.
 */
export function formatProviderReadiness(
  providers: ProviderName[],
  config: Config,
  connectionResults?: Record<string, ConnectionTestResult>
): string {
  const lines: string[] = [];
  lines.push('Provider readiness:');
  for (const provider of providers) {
    const providerConfig = config.providers[provider];
    const connResult = connectionResults?.[provider];
    const status = getProviderStatus(provider, providerConfig, connResult);
    const mark = status.ready ? '✓' : '✗';
    lines.push(`  ${mark} ${provider.padEnd(10)}${status.message}`);
  }
  return lines.join('\n');
}

function getProviderStatus(
  provider: ProviderName,
  providerConfig: { email?: string; api_key?: string },
  connectionResult?: ConnectionTestResult
): { ready: boolean; message: string } {
  switch (provider) {
    case 'pubmed': {
      if (connectionResult && !connectionResult.ok) {
        return { ready: false, message: `not ready (${connectionResult.error})` };
      }
      if (!providerConfig.email) {
        return { ready: true, message: connectionResult ? 'ready (verified, email: not configured (recommended))' : 'ready (email: not configured (recommended))' };
      }
      return { ready: true, message: connectionResult ? 'ready (verified, email: configured)' : 'ready (email: configured)' };
    }
    case 'scopus': {
      if (!providerConfig.api_key) {
        return { ready: false, message: 'missing api_key (required)' };
      }
      if (connectionResult && !connectionResult.ok) {
        return { ready: false, message: `not ready (${connectionResult.error})` };
      }
      return { ready: true, message: connectionResult ? 'ready (verified)' : 'ready' };
    }
    case 'eric':
    case 'arxiv': {
      if (connectionResult && !connectionResult.ok) {
        return { ready: false, message: `not ready (${connectionResult.error})` };
      }
      return { ready: true, message: connectionResult ? 'ready (verified)' : 'ready' };
    }
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

/**
 * Result of a count-only query for a single provider.
 */
export interface CountResult {
  provider: string;
  count: number;
  error?: string;
}

/**
 * Format count-only output for display.
 */
export function formatCountOnlyOutput(
  counts: CountResult[],
  queryLabel?: string
): string {
  const label = queryLabel ?? 'direct-query';
  const lines: string[] = [];

  lines.push(`Query: ${label} (count only)`);
  lines.push('');

  // Find the max provider name length for alignment (including colon)
  const maxNameLen = Math.max(...counts.map((c) => c.provider.length + 1), 6);

  // Calculate total (excluding errors)
  let total = 0;

  for (const c of counts) {
    if (c.error) {
      lines.push(`  ${(c.provider + ':').padEnd(maxNameLen)}  error: ${c.error}`);
    } else {
      const countStr = String(c.count).padStart(6);
      lines.push(`  ${(c.provider + ':').padEnd(maxNameLen)} ${countStr} hits`);
      total += c.count;
    }
  }

  // Separator and total
  const separatorLen = maxNameLen + 14;
  lines.push(`  ${'─'.repeat(separatorLen)}`);
  const totalStr = String(total).padStart(6);
  lines.push(`  ${('total:').padEnd(maxNameLen)} ${totalStr} hits (before deduplication)`);

  return lines.join('\n');
}

export async function formatDryRunOutput(
  translations: TranslationResult[],
  options?: DryRunOutputOptions
): Promise<string> {
  if (translations.length === 0) {
    return 'No translations available.';
  }
  const sections: string[] = [];
  if (options?.config && options?.providers) {
    let connectionResults: Record<string, ConnectionTestResult> | undefined;
    if (!options.skipConnectionTest) {
      connectionResults = await testProviderConnections(options.providers, options.config);
    }
    sections.push(formatProviderReadiness(options.providers, options.config, connectionResults));
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

/**
 * Format tip shown after successful search completion.
 * Guides users toward the diff command for query refinement workflow.
 */
export function formatSearchCompletionTip(sessionId: string): string {
  return `
Tip: To compare with another query version, use:
     search-hub diff <other-session> ${sessionId}`;
}

/**
 * Format tip shown after count-only results.
 * Guides users toward the full workflow with diff for query refinement.
 */
export function formatCountOnlyTip(): string {
  return `
Tip: Run without --count-only to retrieve articles, then use 'diff' to compare query versions.`;
}


/**
 * Format tip shown when using --query direct option.
 * Guides users toward YAML query files for reproducible searches.
 */
export function formatDirectQueryTip(): string {
  return `
Tip: For reproducible searches, consider using a YAML query file:
     search-hub query init -o my-search.yaml`;
}
