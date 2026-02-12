/**
 * Abstract base class for database providers.
 */

import { RateLimiter } from './rate-limiter';
import type {
  Provider,
  ProviderName,
  Article,
  TranslatedQuery,
  SearchOptions,
  ResolvedAST,
  ProviderError,
  SearchState,
  SearchResumeResult,
  ConnectionTestResult,
} from './types';
import { isProviderError, isRateLimitError } from './types';

/**
 * Configuration options for BaseProvider.
 */
export interface BaseProviderConfig {
  /** Requests per second rate limit */
  rateLimit?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Initial backoff time in ms for exponential backoff */
  initialBackoff?: number;
  /** Maximum backoff time in ms */
  maxBackoff?: number;
}

const DEFAULT_CONFIG: Required<BaseProviderConfig> = {
  rateLimit: 3,
  timeout: 30000,
  retries: 3,
  initialBackoff: 1000,
  maxBackoff: 60000,
};

/**
 * Abstract base class for database providers.
 *
 * Provides common infrastructure:
 * - Rate limiting
 * - Configuration management
 * - Retry logic (implemented in subclass)
 */
export abstract class BaseProvider implements Provider {
  /** Provider name identifier */
  abstract readonly name: ProviderName;

  /** Rate limiter instance */
  protected readonly rateLimiter: RateLimiter;

  /** Merged configuration */
  protected readonly config: Required<BaseProviderConfig>;

  constructor(config: BaseProviderConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.rateLimiter = new RateLimiter({
      tokensPerSecond: this.config.rateLimit,
      burstSize: this.config.rateLimit,
      initialBackoff: this.config.initialBackoff,
      maxBackoff: this.config.maxBackoff,
    });
  }

  /**
   * Execute search and return results as async iterable (streaming).
   */
  abstract search(
    query: TranslatedQuery,
    options?: SearchOptions
  ): AsyncIterable<Article>;

  /**
   * Get total hit count for a query without downloading results.
   * Used for count-only mode during query refinement.
   */
  abstract count(query: TranslatedQuery): Promise<number>;

  /**
   * Convert ResolvedAST to database-native syntax.
   */
  abstract translateQuery(resolved: ResolvedAST): TranslatedQuery;

  /**
   * Verify API access and credentials.
   * Returns { ok: true } on success, { ok: false, error: string } on failure.
   * Does not throw.
   */
  abstract testConnection(): Promise<ConnectionTestResult>;

  /**
   * Get the current search state for session persistence.
   * Returns null if no search is in progress.
   */
  abstract getSearchState(): SearchState | null;

  /**
   * Resume a search from a saved state.
   * Continues yielding articles from where the previous search left off.
   */
  abstract resumeSearch(state: SearchState): AsyncIterable<Article>;

  /**
   * Validate if a saved state is still valid for resuming.
   * Some providers (e.g., PubMed) have server-side state that can expire.
   */
  abstract validateState(state: SearchState): Promise<SearchResumeResult>;

  /**
   * Create a base SearchState with common fields.
   * Subclasses can extend this with provider-specific state.
   */
  protected createBaseState(
    query: TranslatedQuery,
    totalResults: number,
    retrievedCount: number
  ): SearchState {
    return {
      provider: this.name,
      query,
      totalResults,
      retrievedCount,
      lastUpdated: new Date(),
    };
  }

  /**
   * Execute a function with retry logic.
   *
   * Retries on network errors and server errors.
   * Does not retry on auth errors.
   * Uses exponential backoff between retries.
   * Respects rate limit error's retryAfter if provided.
   */
  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: ProviderError | Error | undefined;
    let currentBackoff = this.config.initialBackoff;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as ProviderError | Error;

        // Check if we should retry
        if (!this.shouldRetry(error)) {
          throw error;
        }

        // If we've exhausted retries, throw
        if (attempt >= this.config.retries) {
          throw error;
        }

        // Calculate wait time
        let waitTime: number;
        if (isRateLimitError(error) && 'retryAfter' in error && typeof error.retryAfter === 'number') {
          waitTime = error.retryAfter;
        } else {
          waitTime = currentBackoff;
          currentBackoff = Math.min(currentBackoff * 2, this.config.maxBackoff);
        }

        await this.sleep(waitTime);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError;
  }

  /**
   * Determine if an error should trigger a retry.
   */
  private shouldRetry(error: unknown): boolean {
    if (isProviderError(error)) {
      return error.retryable;
    }

    // Treat unknown errors as non-retryable
    return false;
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Serialized search state for JSON storage.
 */
interface SerializedSearchState {
  provider: string;
  query: TranslatedQuery;
  totalResults: number;
  retrievedCount: number;
  lastUpdated: string; // ISO 8601 string
  providerState?: unknown;
}

/**
 * Serialize a SearchState to a JSON string.
 * Handles Date conversion to ISO 8601 string.
 */
export function serializeState(state: SearchState): string {
  const serialized: SerializedSearchState = {
    provider: state.provider,
    query: state.query,
    totalResults: state.totalResults,
    retrievedCount: state.retrievedCount,
    lastUpdated: state.lastUpdated.toISOString(),
    providerState: state.providerState,
  };
  return JSON.stringify(serialized);
}

/**
 * Deserialize a JSON string to a SearchState.
 * Handles Date conversion from ISO 8601 string.
 */
export function deserializeState(json: string): SearchState {
  const parsed = JSON.parse(json) as SerializedSearchState;
  return {
    provider: parsed.provider as SearchState['provider'],
    query: parsed.query,
    totalResults: parsed.totalResults,
    retrievedCount: parsed.retrievedCount,
    lastUpdated: new Date(parsed.lastUpdated),
    providerState: parsed.providerState,
  };
}
