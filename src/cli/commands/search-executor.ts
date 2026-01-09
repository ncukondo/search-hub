/**
 * Search executor for CLI search command.
 *
 * Handles the actual execution of searches across multiple providers,
 * including session creation, progress display, and result storage.
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SearchCommandOptions } from './search.js';
import type { Config } from '../../config/index.js';
import type {
  Article,
  Provider,
  ProviderName,
  TranslatedQuery,
} from '../../providers/base/types.js';
import type { QueryAST } from '../../query/types.js';
import { parseQueryString } from '../../query/index.js';
import {
  createSession,
  updateDatabaseStatus,
  updateSessionStatus,
} from '../../session/manager.js';
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
import type { RegistrationRecord } from '../../integration/types.js';
import { checkRefAvailable } from '../../integration/ref-cli.js';

/**
 * Result of a search execution.
 */
export interface SearchExecutionResult {
  success: boolean;
  sessionId?: string;
  results?: Record<string, { hits: number; retrieved: number }>;
  error?: string;
  autoRegisterResult?: RegistrationRecord;
}

/**
 * Available providers that are implemented.
 */
const IMPLEMENTED_PROVIDERS: ProviderName[] = ['pubmed', 'eric', 'arxiv', 'scopus'];

/**
 * Create a provider instance for the given provider name.
 */
export function createProviderInstance(
  name: ProviderName,
  config: Config
): Provider {
  const providerConfig = config.providers[name];

  switch (name) {
    case 'pubmed': {
      if (!providerConfig.email) {
        console.warn(
          'Warning: No email configured for PubMed. Set providers.pubmed.email in config.'
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
      const scopusOpts: ScopusConfig = {
        apiKey: providerConfig.api_key ?? '',
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
 */
function translateQueryForProvider(
  ast: QueryAST,
  provider: ProviderName
): TranslatedQuery {
  switch (provider) {
    case 'pubmed':
      return translatePubmed(ast);
    case 'eric':
      return translateEric(ast);
    case 'arxiv':
      return translateArxiv(ast);
    case 'scopus':
      return translateScopus(ast);
    default:
      throw new Error(`No translator for provider '${provider}'`);
  }
}

/**
 * Get enabled providers from config, optionally filtered by user selection.
 */
function getEnabledProviders(
  config: Config,
  requestedProviders?: ProviderName[]
): ProviderName[] {
  const enabledInConfig = IMPLEMENTED_PROVIDERS.filter(
    (name) => config.providers[name].enabled
  );

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
  showProgress = true
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
          field: 'all',
          terms: { keywords: [options.directQuery] },
          operator: 'AND',
        },
      ],
      filters: {},
      overrides: {},
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
        error: `Failed to parse query file: ${error instanceof Error ? error.message : error}`,
      };
    }
  } else {
    return {
      success: false,
      error: 'Either queryFile or directQuery with provider is required',
    };
  }

  // Determine which providers to use
  const providers = getEnabledProviders(config, options.providers);

  if (providers.length === 0) {
    return {
      success: false,
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
      error: `Failed to create session: ${error instanceof Error ? error.message : error}`,
    };
  }

  const sessionId = session.id;
  const results: Record<string, { hits: number; retrieved: number }> = {};

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
        sessionsDir
      );

      // Prepare results file path
      const resultsPath = join(sessionsDir, sessionId, `${providerName}_results.jsonl`);

      // Execute search
      let retrievedCount = 0;
      let totalHits = 0;

      progress?.update(providerName, 0, 0, 'in_progress');

      const searchOptions = {
        maxResults: options.maxResults ?? config.providers[providerName].max_results,
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
          },
        },
        sessionsDir
      );

      results[providerName] = { hits: totalHits, retrieved: retrievedCount };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

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
        sessionsDir
      );

      results[providerName] = { hits: 0, retrieved: 0 };
    }
  }

  // Stop progress display
  progress?.stop();

  // Determine overall session status
  const anyFailed = providers.some((p) => {
    const r = results[p];
    return r && r.retrieved === 0 && r.hits === 0;
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
      results,
      error: 'All providers failed',
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
  };

  if (autoRegisterResult) {
    result.autoRegisterResult = autoRegisterResult;
  }

  return result;
}

/**
 * Load all articles from a session's results files.
 */
async function loadArticlesFromSession(
  sessionsDir: string,
  sessionId: string,
  providers: ProviderName[]
): Promise<Article[]> {
  const articles: Article[] = [];

  for (const provider of providers) {
    const resultsPath = join(sessionsDir, sessionId, `${provider}_results.jsonl`);
    try {
      const content = await readFile(resultsPath, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line.length > 0);
      for (const line of lines) {
        try {
          const article = JSON.parse(line) as Article;
          articles.push(article);
        } catch {
          // Skip invalid JSON lines
        }
      }
    } catch {
      // Skip if file doesn't exist
    }
  }

  return articles;
}
