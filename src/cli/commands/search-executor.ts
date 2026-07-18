/**
 * Search executor for CLI search command.
 *
 * Handles the actual execution of searches across multiple providers,
 * including session creation, progress display, and result storage.
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SearchCommandOptions, CountResult, PreviewResult } from './search.js';
import type { Config } from '../../config/index.js';
import type {
  Article,
  Provider,
  ProviderName,
  TranslatedQuery,
} from '../../providers/base/types.js';
import { isProviderError } from '../../providers/base/types.js';
import type { QueryAST } from '../../query/types.js';
import { parseQueryString } from '../../query/index.js';
import { resolveForProvider } from '../../query/resolver.js';
import { createSession, updateDatabaseStatus, updateSessionStatus } from '../../session/manager.js';
import { MultiProviderProgress } from '../utils/progress.js';
import { PubMedProvider } from '../../providers/pubmed/provider.js';
import type { PubMedConfig } from '../../providers/pubmed/types.js';
import { ERICProvider } from '../../providers/eric/provider.js';
import { ArxivProvider } from '../../providers/arxiv/provider.js';
import { ScopusProvider } from '../../providers/scopus/provider.js';
import type { ScopusConfig } from '../../providers/scopus/types.js';
import { translateQuery as translatePubmed } from '../../providers/pubmed/translator.js';
import { translateQuery as translateEric } from '../../providers/eric/translator.js';
import { translateQuery as translateArxiv } from '../../providers/arxiv/translator.js';
import { translateQuery as translateScopus } from '../../providers/scopus/translator.js';
import { stringify as stringifyYaml } from 'yaml';
import { registerArticles, saveRegistrationRecord } from '../../integration/register.js';
import { buildFailureErrorMessage, buildPartialErrorMessage } from './search-utils.js';
import { getConfigDir } from '../../config/paths.js';
import type { RegistrationRecord } from '../../integration/types.js';
import { checkRefAvailable } from '../../integration/ref-cli.js';
import { convertResultsToYaml, loadResults } from '../../session/results-io.js';

/**
 * Result of a search execution.
 */
export interface SearchExecutionResult {
  success: boolean;
  sessionId?: string;
  results?: Record<
    string,
    { hits: number; retrieved: number; error?: string; warnings?: string[] }
  >;
  error?: string;
  autoRegisterResult?: RegistrationRecord;
  sessionStatus: 'completed' | 'partial' | 'failed';
}

/**
 * Available providers that are implemented.
 */
const IMPLEMENTED_PROVIDERS: ProviderName[] = ['pubmed', 'eric', 'arxiv', 'scopus'];

/**
 * Check if a provider has the required configuration (e.g., API keys).
 * Providers that require no special configuration always return true.
 */
export function isProviderConfigured(name: ProviderName, config: Config): boolean {
  switch (name) {
    case 'scopus':
      return !!config.providers.scopus.api_key;
    default:
      return true; // pubmed, eric, arxiv require no API key
  }
}

/**
 * Create a provider instance for the given provider name.
 */
export function createProviderInstance(name: ProviderName, config: Config): Provider | null {
  const providerConfig = config.providers[name];

  switch (name) {
    case 'pubmed': {
      if (!providerConfig.email) {
        const configPath = getConfigDir();
        console.warn(
          `Warning: No email configured for PubMed.\n` +
            `  → Edit ${configPath}/config.toml and set providers.pubmed.email\n` +
            `  → Or run: search-hub config providers.pubmed.email "your@email.com"`,
        );
      }
      const pubmedOpts: PubMedConfig = {
        email: providerConfig.email ?? 'search-hub@example.com',
        rateLimit: providerConfig.rate_limit,
        timeout: providerConfig.timeout,
        retries: providerConfig.retries,
      };
      if (providerConfig.api_key) {
        pubmedOpts.apiKey = providerConfig.api_key;
      }
      return new PubMedProvider(pubmedOpts);
    }
    case 'eric':
      return new ERICProvider({
        rateLimit: providerConfig.rate_limit,
        timeout: providerConfig.timeout,
        retries: providerConfig.retries,
      });
    case 'arxiv':
      return new ArxivProvider({
        rateLimit: providerConfig.rate_limit,
        timeout: providerConfig.timeout,
        retries: providerConfig.retries,
      });
    case 'scopus': {
      if (!providerConfig.api_key) {
        console.warn(
          `Warning: Scopus requires an API key. Set providers.scopus.api_key in config.\n` +
            `  → Get an API key at https://dev.elsevier.com/\n` +
            `  → Run: search-hub config providers.scopus.api_key "your-key"`,
        );
        return null;
      }
      const scopusOpts: ScopusConfig = {
        apiKey: providerConfig.api_key,
        rateLimit: providerConfig.rate_limit,
        timeout: providerConfig.timeout,
        retries: providerConfig.retries,
      };
      if (providerConfig.inst_token) {
        scopusOpts.instToken = providerConfig.inst_token;
      }
      return new ScopusProvider(scopusOpts);
    }
    default:
      throw new Error(`Provider '${name}' is not implemented`);
  }
}

/**
 * Translate a query AST for a specific provider.
 * Resolves provider-specific blocks/filters before translation.
 */
function translateQueryForProvider(ast: QueryAST, provider: ProviderName): TranslatedQuery {
  const resolved = resolveForProvider(ast, provider);
  switch (provider) {
    case 'pubmed':
      return translatePubmed(resolved);
    case 'eric':
      return translateEric(resolved);
    case 'arxiv':
      return translateArxiv(resolved);
    case 'scopus':
      return translateScopus(resolved);
    default:
      throw new Error(`No translator for provider '${provider}'`);
  }
}

/**
 * Get enabled providers from config, optionally filtered by user selection.
 */
function getEnabledProviders(config: Config, requestedProviders?: ProviderName[]): ProviderName[] {
  const enabledInConfig = IMPLEMENTED_PROVIDERS.filter((name) => config.providers[name].enabled);

  if (requestedProviders && requestedProviders.length > 0) {
    return requestedProviders.filter((p) => enabledInConfig.includes(p));
  }

  return enabledInConfig;
}

/**
 * Execute a search across multiple providers.
 */
export async function executeSearch(
  options: SearchCommandOptions,
  sessionsDir: string,
  config: Config,
  showProgress = true,
): Promise<SearchExecutionResult> {
  let ast: QueryAST | undefined;
  let queryContent: string;
  let queryFile: string;

  // Handle direct query mode
  if (options.directQuery && options.providers && options.providers.length === 1) {
    queryFile = 'direct-query';

    // For direct query, we create a minimal AST structure
    ast = {
      name: options.sessionName ?? 'direct-query',
      blocks: [
        {
          id: 'direct',
          field: 'all',
          terms: { keywords: [options.directQuery] },
          operator: 'AND',
        },
      ],
      filters: {},
      providers: {},
    };

    // Generate YAML safely using yaml library to handle special characters
    queryContent = stringifyYaml({
      name: ast.name,
      blocks: ast.blocks,
      filters: ast.filters,
    });
  } else if (options.queryFile) {
    // Parse query file
    try {
      queryContent = await readFile(options.queryFile, 'utf-8');
      ast = parseQueryString(queryContent);
      queryFile = options.queryFile;
    } catch (error) {
      return {
        success: false,
        sessionStatus: 'failed',
        error: `Failed to parse query file: ${error instanceof Error ? error.message : error}`,
      };
    }
  } else {
    return {
      success: false,
      sessionStatus: 'failed',
      error: 'Either queryFile or directQuery with provider is required',
    };
  }

  // Determine which providers to use
  let providers = getEnabledProviders(config, options.providers);

  // In default mode (no --db), skip unconfigured providers with a warning
  const isExplicitSelection = options.providers && options.providers.length > 0;
  if (!isExplicitSelection) {
    const skipped: ProviderName[] = [];
    providers = providers.filter((name) => {
      if (!isProviderConfigured(name, config)) {
        skipped.push(name);
        return false;
      }
      return true;
    });
    for (const name of skipped) {
      console.warn(`Skipping ${name}: API key not configured (use --db ${name} to force)`);
    }
  }

  if (providers.length === 0) {
    return {
      success: false,
      sessionStatus: 'failed',
      error: 'No providers enabled or selected',
    };
  }

  // Create query hash
  const queryHash = createHash('sha256').update(queryContent).digest('hex').slice(0, 8);

  // Create session
  let session;
  try {
    const sessionOpts: Parameters<typeof createSession>[0] = {
      name: options.sessionName ?? ast.name,
      queryFile,
      queryContent,
      queryHash,
      targets: providers,
      sessionsDir,
    };
    if (ast.description) {
      sessionOpts.description = ast.description;
    }
    session = await createSession(sessionOpts);
  } catch (error) {
    return {
      success: false,
      sessionStatus: 'failed',
      error: `Failed to create session: ${error instanceof Error ? error.message : error}`,
    };
  }

  const sessionId = session.id;
  const results: Record<
    string,
    { hits: number; retrieved: number; error?: string; warnings?: string[] }
  > = {};

  // Create progress display if enabled
  let progress: MultiProviderProgress | undefined;
  if (showProgress && process.stdout.isTTY) {
    progress = new MultiProviderProgress(providers);
  }

  // Execute search for each provider
  for (const providerName of providers) {
    try {
      // Create provider instance
      const provider = createProviderInstance(providerName, config);

      // Skip provider if it could not be created (e.g. missing configuration)
      if (provider === null) {
        const configError = `${providerName}: provider configuration incomplete. See warning above for details.`;
        results[providerName] = { hits: 0, retrieved: 0, error: configError };
        await updateDatabaseStatus(
          sessionId,
          providerName,
          {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: {
              code: 'CONFIG_ERROR',
              message: configError,
              retryable: false,
            },
          },
          sessionsDir,
        );
        continue;
      }

      // Translate query
      let translatedQuery: TranslatedQuery;
      if (options.directQuery && options.providers?.length === 1) {
        // For direct query, use the native query string directly
        translatedQuery = {
          native: options.directQuery,
          provider: providerName,
        };
      } else {
        translatedQuery = translateQueryForProvider(ast, providerName);
      }

      // Write translated query to session
      const queryPath = join(sessionsDir, sessionId, `${providerName}_query.txt`);
      await writeFile(queryPath, translatedQuery.native, 'utf-8');

      // Update database status to in_progress
      await updateDatabaseStatus(
        sessionId,
        providerName,
        {
          status: 'in_progress',
          startedAt: new Date().toISOString(),
        },
        sessionsDir,
      );

      // Prepare results file path
      const resultsPath = join(sessionsDir, sessionId, `${providerName}_results.jsonl`);

      // Execute search
      let retrievedCount = 0;
      let totalHits = 0;

      progress?.update(providerName, 0, 0, 'in_progress');

      const searchOptions = {
        maxResults: options.maxResults ?? config.providers[providerName].max_results,
        ...(options.sort && { sort: options.sort }),
      };

      for await (const article of provider.search(translatedQuery, searchOptions)) {
        retrievedCount++;

        // Write article to JSONL file
        await appendFile(resultsPath, JSON.stringify(article) + '\n', 'utf-8');

        // Update progress (estimate total from first batch)
        if (totalHits === 0) {
          // Estimate total - this is provider-dependent, we'll use retrieved count as minimum
          totalHits = Math.max(retrievedCount * 10, 100);
        }
        progress?.update(providerName, retrievedCount, totalHits, 'in_progress');
      }

      // Update final totals
      totalHits = retrievedCount; // Use actual count as final total

      // Mark as completed
      progress?.complete(providerName);

      // Convert JSONL to YAML for human-readable view
      const yamlFilename = `${providerName}_results.yaml`;
      const yamlPath = join(sessionsDir, sessionId, yamlFilename);
      await convertResultsToYaml(resultsPath, yamlPath, {
        provider: providerName,
        queryName: ast.name,
      });

      // Update database status
      await updateDatabaseStatus(
        sessionId,
        providerName,
        {
          status: 'completed',
          completedAt: new Date().toISOString(),
          totalHits,
          retrievedCount,
          files: {
            query: `${providerName}_query.txt`,
            results: `${providerName}_results.jsonl`,
            resultsYaml: yamlFilename,
          },
        },
        sessionsDir,
      );

      // Collect warnings if provider supports them
      const providerWarnings = provider.getWarnings?.();
      results[providerName] = {
        hits: totalHits,
        retrieved: retrievedCount,
        ...(providerWarnings && providerWarnings.length > 0 && { warnings: providerWarnings }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : isProviderError(error)
            ? error.message
            : String(error);

      progress?.fail(providerName, errorMessage);

      // Update database status with error
      await updateDatabaseStatus(
        sessionId,
        providerName,
        {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: {
            code: 'SEARCH_ERROR',
            message: errorMessage,
            retryable: true,
          },
        },
        sessionsDir,
      );

      results[providerName] = { hits: 0, retrieved: 0, error: errorMessage };
    }
  }

  // Stop progress display
  progress?.stop();

  // Determine overall session status
  const anyFailed = providers.some((p) => {
    const r = results[p];
    return r && r.error !== undefined;
  });
  const anySucceeded = providers.some((p) => {
    const r = results[p];
    return r && r.retrieved > 0;
  });

  let sessionStatus: 'completed' | 'partial' | 'failed';
  if (!anyFailed) {
    sessionStatus = 'completed';
  } else if (anySucceeded) {
    sessionStatus = 'partial';
  } else {
    sessionStatus = 'failed';
  }

  // Update session status
  await updateSessionStatus(sessionId, sessionStatus, sessionsDir);

  if (sessionStatus === 'failed') {
    return {
      success: false,
      sessionId,
      sessionStatus,
      results,
      error: buildFailureErrorMessage(results),
    };
  }

  // In strict mode, partial success is treated as failure
  if (options.strict && sessionStatus === 'partial') {
    return {
      success: false,
      sessionId,
      sessionStatus,
      results,
      error: buildPartialErrorMessage(results),
    };
  }

  // Auto-register if enabled
  let autoRegisterResult: RegistrationRecord | undefined;
  if (
    config.integration.reference_manager.enabled &&
    config.integration.reference_manager.auto_register
  ) {
    const refAvailable = await checkRefAvailable();
    if (refAvailable) {
      // Load all articles from results files
      const allArticles = await loadArticlesFromSession(sessionsDir, sessionId, providers);

      if (allArticles.length > 0) {
        autoRegisterResult = await registerArticles(allArticles, {
          sessionId,
          sessionDir: join(sessionsDir, sessionId),
          withAbstracts: config.integration.reference_manager.with_abstracts,
        });

        // Save registration record
        await saveRegistrationRecord(join(sessionsDir, sessionId), autoRegisterResult);
      }
    }
  }

  const result: SearchExecutionResult = {
    success: true,
    sessionId,
    results,
    sessionStatus,
  };

  if (autoRegisterResult) {
    result.autoRegisterResult = autoRegisterResult;
  }

  return result;
}

/**
 * Execute count-only mode: get hit counts from each provider without downloading results.
 * No session is created.
 */
export async function executeCountOnly(
  options: SearchCommandOptions,
  config: Config,
): Promise<CountResult[]> {
  let ast: QueryAST | undefined;

  // Handle direct query mode
  if (options.directQuery && options.providers && options.providers.length === 1) {
    ast = {
      name: options.sessionName ?? 'direct-query',
      blocks: [
        {
          id: 'direct',
          field: 'all',
          terms: { keywords: [options.directQuery] },
          operator: 'AND',
        },
      ],
      filters: {},
      providers: {},
    };
  } else if (options.queryFile) {
    const queryContent = await readFile(options.queryFile, 'utf-8');
    ast = parseQueryString(queryContent);
  } else {
    return [];
  }

  // Determine which providers to use
  let providers = getEnabledProviders(config, options.providers);

  // In default mode (no --db), skip unconfigured providers
  const isExplicitSelection = options.providers && options.providers.length > 0;
  if (!isExplicitSelection) {
    providers = providers.filter((name) => isProviderConfigured(name, config));
  }

  if (providers.length === 0) {
    return [];
  }

  // Execute count for each provider concurrently
  const results: CountResult[] = await Promise.all(
    providers.map(async (providerName): Promise<CountResult> => {
      try {
        const provider = createProviderInstance(providerName, config);
        if (provider === null) {
          return { provider: providerName, count: 0, error: 'Provider configuration incomplete' };
        }

        // Translate query
        let translatedQuery: TranslatedQuery;
        if (options.directQuery && options.providers?.length === 1) {
          translatedQuery = {
            native: options.directQuery,
            provider: providerName,
          };
        } else {
          translatedQuery = translateQueryForProvider(ast!, providerName);
        }

        const count = await provider.count(translatedQuery);
        return { provider: providerName, count };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : isProviderError(error)
              ? error.message
              : String(error);
        return { provider: providerName, count: 0, error: errorMessage };
      }
    }),
  );

  return results;
}

/**
 * Execute preview mode: get counts and first few titles without creating a session.
 */
export async function executePreview(
  options: SearchCommandOptions,
  config: Config,
  maxTitles = 5,
): Promise<PreviewResult[]> {
  let ast: QueryAST | undefined;

  // Handle direct query mode
  if (options.directQuery && options.providers && options.providers.length === 1) {
    ast = {
      name: options.sessionName ?? 'direct-query',
      blocks: [
        {
          id: 'direct',
          field: 'all',
          terms: { keywords: [options.directQuery] },
          operator: 'AND',
        },
      ],
      filters: {},
      providers: {},
    };
  } else if (options.queryFile) {
    const queryContent = await readFile(options.queryFile, 'utf-8');
    ast = parseQueryString(queryContent);
  } else {
    return [];
  }

  // Determine which providers to use
  let providers = getEnabledProviders(config, options.providers);

  // In default mode (no --db), skip unconfigured providers
  const isExplicitSelection = options.providers && options.providers.length > 0;
  if (!isExplicitSelection) {
    providers = providers.filter((name) => isProviderConfigured(name, config));
  }

  if (providers.length === 0) {
    return [];
  }

  // Execute preview for each provider concurrently
  const results: PreviewResult[] = await Promise.all(
    providers.map(async (providerName): Promise<PreviewResult> => {
      try {
        const provider = createProviderInstance(providerName, config);
        if (provider === null) {
          return {
            provider: providerName,
            count: 0,
            titles: [],
            error: 'Provider configuration incomplete',
          };
        }

        // Translate query
        let translatedQuery: TranslatedQuery;
        if (options.directQuery && options.providers?.length === 1) {
          translatedQuery = {
            native: options.directQuery,
            provider: providerName,
          };
        } else {
          translatedQuery = translateQueryForProvider(ast!, providerName);
        }

        // Get count first
        const count = await provider.count(translatedQuery);

        // Collect first few articles for titles
        const titles: string[] = [];
        const searchOptions = { maxResults: maxTitles };

        for await (const article of provider.search(translatedQuery, searchOptions)) {
          titles.push(article.title);
          if (titles.length >= maxTitles) {
            break;
          }
        }

        return { provider: providerName, count, titles };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : isProviderError(error)
              ? error.message
              : String(error);
        return { provider: providerName, count: 0, titles: [], error: errorMessage };
      }
    }),
  );

  return results;
}

/**
 * Load all articles from a session's results files (YAML preferred, JSONL fallback).
 */
async function loadArticlesFromSession(
  sessionsDir: string,
  sessionId: string,
  providers: ProviderName[],
): Promise<Article[]> {
  const articles: Article[] = [];
  const sessionDir = join(sessionsDir, sessionId);

  for (const provider of providers) {
    const providerArticles = await loadResults(sessionDir, provider);
    articles.push(...providerArticles);
  }

  return articles;
}
