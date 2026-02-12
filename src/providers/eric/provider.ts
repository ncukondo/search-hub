/**
 * ERIC Provider implementation.
 * Provides search functionality for the ERIC education database.
 */

import { BaseProvider, type BaseProviderConfig } from '../base/provider';
import type {
  Article,
  TranslatedQuery,
  SearchOptions,
  ResolvedAST,
  SearchState,
  SearchResumeResult,
  ConnectionTestResult,
} from '../base/types';
import { ERICClient, type ERICSearchOptions } from './client';
import type { ERICSearchResult } from './parser';
import { translateQuery } from './translator';
import type { ERICConfig, ERICProviderState } from './types';

/** Default page size for ERIC searches */
const DEFAULT_PAGE_SIZE = 100;

/** ERIC API base URL for connection test */
const ERIC_API_BASE_URL = 'https://api.ies.ed.gov/eric/';

/**
 * Interface for ERIC client (for dependency injection in tests).
 */
export interface IERICClient {
  search(query: string, options?: ERICSearchOptions): Promise<ERICSearchResult>;
}

/**
 * Extended configuration for ERIC provider with optional client injection.
 */
export interface ERICProviderOptions extends ERICConfig {
  /** Optional client for dependency injection (testing) */
  client?: IERICClient;
}

/**
 * ERIC database provider.
 * Implements the Provider interface for searching ERIC.
 */
export class ERICProvider extends BaseProvider {
  readonly name = 'eric' as const;

  private readonly client: IERICClient;
  private readonly pageSize: number;

  // Current search state for session persistence
  private currentQuery: TranslatedQuery | null = null;
  private currentOffset = 0;
  private currentTotalResults = 0;
  private currentRetrievedCount = 0;

  constructor(config: ERICProviderOptions = {}) {
    // Set default rate limit for ERIC (5 req/s recommended)
    const baseConfig: BaseProviderConfig = {
      rateLimit: config.rateLimit ?? 5,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
    };
    if (config.initialBackoff !== undefined) {
      baseConfig.initialBackoff = config.initialBackoff;
    }
    if (config.maxBackoff !== undefined) {
      baseConfig.maxBackoff = config.maxBackoff;
    }
    super(baseConfig);

    this.pageSize = config.maxResultsPerPage ?? DEFAULT_PAGE_SIZE;
    // Allow client injection for testing
    this.client = config.client ?? new ERICClient({
      timeout: this.config.timeout,
    });
  }

  /**
   * Translate a ResolvedAST to ERIC-native query syntax.
   */
  translateQuery(resolved: ResolvedAST): TranslatedQuery {
    return translateQuery(resolved);
  }

  /**
   * Get total hit count for a query without downloading results.
   * Uses a minimal search with rows=0 to get only the total count.
   */
  async count(query: TranslatedQuery): Promise<number> {
    await this.rateLimiter.acquire();
    const result = await this.withRetry(() =>
      this.client.search(query.native, { start: 0, rows: 0 })
    );
    return result.totalResults;
  }

  /**
   * Execute search and return results as async iterable (streaming).
   */
  async *search(
    query: TranslatedQuery,
    options: SearchOptions = {}
  ): AsyncIterable<Article> {
    const maxResults = options.maxResults ?? Number.MAX_SAFE_INTEGER;
    const pageSize = options.pageSize ?? this.pageSize;

    // Initialize search state
    this.currentQuery = query;
    this.currentOffset = 0;
    this.currentTotalResults = 0;
    this.currentRetrievedCount = 0;

    let retrieved = 0;

    while (retrieved < maxResults) {
      // Wait for rate limiter
      await this.rateLimiter.acquire();

      // Execute search with retry
      const searchOptions: ERICSearchOptions = {
        start: this.currentOffset,
        rows: Math.min(pageSize, maxResults - retrieved),
      };
      if (options.signal) {
        searchOptions.signal = options.signal;
      }
      const result = await this.withRetry(() =>
        this.client.search(query.native, searchOptions)
      );

      // Update total on first page
      if (this.currentOffset === 0) {
        this.currentTotalResults = result.totalResults;
      }

      // No more results
      if (result.documents.length === 0) {
        break;
      }

      // Yield documents
      for (const doc of result.documents) {
        if (retrieved >= maxResults) {
          break;
        }
        yield doc;
        retrieved++;
        this.currentRetrievedCount = retrieved;
      }

      // Update offset for next page
      this.currentOffset += result.documents.length;

      // Check if we've retrieved all results
      if (this.currentOffset >= this.currentTotalResults) {
        break;
      }
    }
  }

  /**
   * Verify API access.
   * Returns false on failure (doesn't throw).
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await fetch(`${ERIC_API_BASE_URL}?search=test&format=json&rows=1`);
      if (!response.ok) {
        return { ok: false, error: `ERIC API returned HTTP ${response.status}` };
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  /**
   * Get the current search state for session persistence.
   */
  getSearchState(): SearchState | null {
    if (!this.currentQuery) {
      return null;
    }

    const providerState: ERICProviderState = {
      offset: this.currentOffset,
      pageSize: this.pageSize,
    };

    return {
      ...this.createBaseState(
        this.currentQuery,
        this.currentTotalResults,
        this.currentRetrievedCount
      ),
      providerState,
    };
  }

  /**
   * Resume a search from a saved state.
   */
  async *resumeSearch(state: SearchState): AsyncIterable<Article> {
    const providerState = state.providerState as ERICProviderState | undefined;
    if (!providerState) {
      throw new Error('Invalid state: missing providerState');
    }

    // Restore state
    this.currentQuery = state.query;
    this.currentOffset = providerState.offset;
    this.currentTotalResults = state.totalResults;
    this.currentRetrievedCount = state.retrievedCount;

    const maxResults = this.currentTotalResults - this.currentRetrievedCount;
    const pageSize = providerState.pageSize ?? this.pageSize;
    let retrieved = 0;

    // Continue from saved offset
    while (retrieved < maxResults) {
      await this.rateLimiter.acquire();

      const searchOptions: ERICSearchOptions = {
        start: this.currentOffset,
        rows: Math.min(pageSize, maxResults - retrieved),
      };

      const result = await this.withRetry(() =>
        this.client.search(state.query.native, searchOptions)
      );

      if (result.documents.length === 0) {
        break;
      }

      for (const doc of result.documents) {
        if (retrieved >= maxResults) {
          break;
        }
        yield doc;
        retrieved++;
        this.currentRetrievedCount++;
      }

      this.currentOffset += result.documents.length;

      if (this.currentOffset >= this.currentTotalResults) {
        break;
      }
    }
  }

  /**
   * Validate if a saved state is still valid for resuming.
   * ERIC uses offset-based pagination, so state is always valid.
   */
  async validateState(_state: SearchState): Promise<SearchResumeResult> {
    // ERIC uses offset-based pagination with no server-side state
    // The state is always valid for resuming
    return { valid: true };
  }
}
