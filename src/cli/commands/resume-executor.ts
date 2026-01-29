/**
 * Resume executor for CLI resume command.
 *
 * Handles resuming interrupted search sessions by continuing
 * from where providers left off or retrying failed providers.
 */
import { readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResumeCommandOptions } from './resume.js';
import type { Config } from '../../config/index.js';
import type {
  Provider,
  TranslatedQuery,
  SearchState,
} from '../../providers/base/types.js';
import { isProviderError } from '../../providers/base/types.js';
import {
  loadSession,
  updateDatabaseStatus,
  updateSessionStatus,
  getResumableProviders,
} from '../../session/manager.js';
import { MultiProviderProgress } from '../utils/progress.js';
import { createProviderInstance } from './search-executor.js';

/**
 * Result of a resume execution.
 */
export interface ResumeExecutionResult {
  success: boolean;
  resumed: number;
  results?: Record<string, { hits: number; retrieved: number; error?: string }>;
  error?: string;
}

/**
 * Interface for providers that support resuming.
 */
interface ResumableProviderInstance extends Provider {
  resumeSearch(state: SearchState): AsyncIterable<import('../../providers/base/types.js').Article>;
}

/**
 * Check if a provider instance supports resuming.
 */
function isResumable(provider: Provider): provider is ResumableProviderInstance {
  return 'resumeSearch' in provider && typeof (provider as any).resumeSearch === 'function';
}

/**
 * Execute resume for interrupted sessions.
 */
export async function executeResume(
  options: ResumeCommandOptions,
  sessionsDir: string,
  config: Config,
  showProgress = true
): Promise<ResumeExecutionResult> {
  // Load session
  let session;
  try {
    session = await loadSession(options.sessionId, sessionsDir);
  } catch (error) {
    return {
      success: false,
      resumed: 0,
      error: `Failed to load session: ${error instanceof Error ? error.message : error}`,
    };
  }

  // Get resumable providers
  let resumableProviders = getResumableProviders(session);

  // Filter by specific providers if requested
  if (options.providers && options.providers.length > 0) {
    resumableProviders = resumableProviders.filter((r) =>
      options.providers!.includes(r.provider)
    );
  }

  // Filter to only retry strategies if retryFailed is true
  if (options.retryFailed) {
    resumableProviders = resumableProviders.filter((r) => r.strategy === 'retry');
  }

  if (resumableProviders.length === 0) {
    return {
      success: true,
      resumed: 0,
      error: 'No providers to resume',
    };
  }

  const results: Record<string, { hits: number; retrieved: number; error?: string }> = {};

  // Create progress display if enabled
  let progress: MultiProviderProgress | undefined;
  if (showProgress && process.stdout.isTTY) {
    progress = new MultiProviderProgress(resumableProviders.map((p) => p.provider));
  }

  let successCount = 0;

  // Resume each provider
  for (const resumable of resumableProviders) {
    const providerName = resumable.provider;
    const dbStatus = session.databases[providerName];

    if (!dbStatus) continue;

    try {
      // Create provider instance
      const provider = createProviderInstance(providerName, config);

      // Build the translated query from stored query file
      const queryPath = join(sessionsDir, options.sessionId, dbStatus.files.query);
      let nativeQuery: string;
      try {
        nativeQuery = await readFile(queryPath, 'utf-8');
      } catch {
        // If query file doesn't exist, skip this provider
        progress?.fail(providerName, 'Query file not found');
        results[providerName] = { hits: 0, retrieved: 0, error: 'Query file not found' };
        continue;
      }

      const translatedQuery: TranslatedQuery = {
        native: nativeQuery.trim(),
        provider: providerName,
      };

      // Update database status to in_progress
      await updateDatabaseStatus(
        options.sessionId,
        providerName,
        {
          status: 'in_progress',
          startedAt: new Date().toISOString(),
        },
        sessionsDir
      );

      // Prepare results file path
      const resultsPath = join(sessionsDir, options.sessionId, dbStatus.files.results);

      let retrievedCount = dbStatus.retrievedCount ?? 0;
      const totalHits = dbStatus.totalHits ?? 0;

      progress?.update(providerName, retrievedCount, totalHits || 100, 'in_progress');

      // Determine how to resume
      if (resumable.strategy === 'continue' && isResumable(provider)) {
        // Build SearchState for continuing
        const searchState: SearchState = {
          provider: providerName,
          query: translatedQuery,
          totalResults: totalHits,
          retrievedCount,
          lastUpdated: new Date(),
          providerState: dbStatus.pagination
            ? {
                cursor: dbStatus.pagination.cursor,
                pageNumber: dbStatus.pagination.pageNumber,
              }
            : undefined,
        };

        // Resume search
        for await (const article of provider.resumeSearch(searchState)) {
          retrievedCount++;

          // Write article to JSONL file
          await appendFile(resultsPath, JSON.stringify(article) + '\n', 'utf-8');

          progress?.update(providerName, retrievedCount, totalHits || retrievedCount, 'in_progress');
        }
      } else {
        // Fresh start or retry - use regular search
        const searchOptions = {
          maxResults: config.providers[providerName].max_results,
        };

        for await (const article of provider.search(translatedQuery, searchOptions)) {
          retrievedCount++;

          // Write article to JSONL file
          await appendFile(resultsPath, JSON.stringify(article) + '\n', 'utf-8');

          progress?.update(providerName, retrievedCount, totalHits || retrievedCount * 2, 'in_progress');
        }
      }

      // Mark as completed
      progress?.complete(providerName);

      // Update database status
      await updateDatabaseStatus(
        options.sessionId,
        providerName,
        {
          status: 'completed',
          completedAt: new Date().toISOString(),
          totalHits: totalHits || retrievedCount,
          retrievedCount,
        },
        sessionsDir
      );

      results[providerName] = { hits: totalHits || retrievedCount, retrieved: retrievedCount };
      successCount++;
    } catch (error) {
      const errorMessage = error instanceof Error
          ? error.message
          : isProviderError(error)
            ? error.message
            : String(error);

      progress?.fail(providerName, errorMessage);

      // Update database status with error
      await updateDatabaseStatus(
        options.sessionId,
        providerName,
        {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: {
            code: 'RESUME_ERROR',
            message: errorMessage,
            retryable: true,
          },
        },
        sessionsDir
      );

      results[providerName] = { hits: 0, retrieved: 0, error: errorMessage };
    }
  }

  // Stop progress display
  progress?.stop();

  // Determine overall session status
  const anyFailed = resumableProviders.some((p) => {
    const r = results[p.provider];
    return r && r.error !== undefined;
  });
  const anySucceeded = resumableProviders.some((p) => {
    const r = results[p.provider];
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
  await updateSessionStatus(options.sessionId, sessionStatus, sessionsDir);

  if (sessionStatus === 'failed') {
    return {
      success: false,
      resumed: successCount,
      results,
      error: 'All providers failed',
    };
  }

  return {
    success: true,
    resumed: successCount,
    results,
  };
}
