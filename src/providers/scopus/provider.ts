/**
 * Scopus Provider
 *
 * Implements the Provider interface for Scopus database searches.
 */

import { BaseProvider, type BaseProviderConfig } from '../base/provider';
import type {
  Article,
  TranslatedQuery,
  SearchOptions,
  QueryAST,
  SearchState,
  SearchResumeResult,
} from '../base/types';
import { ScopusClient } from './client';
import { parseDocument } from './parser';
import { translateQuery } from './translator';
import type { ScopusConfig, ScopusProviderState } from './types';

/** Default page size for Scopus (max 25 for COMPLETE view) */
const DEFAULT_PAGE_SIZE = 25;

/**
 * Scopus database provider.
 */
export class ScopusProvider extends BaseProvider {
  readonly name = 'scopus' as const;

  private readonly client: ScopusClient;
  private readonly scopusConfig: ScopusConfig;

  /** Current search state for resume support */
  private currentState: SearchState | null = null;

  constructor(config: ScopusConfig) {
    const baseConfig: BaseProviderConfig = {};
    if (config.rateLimit !== undefined) {
      baseConfig.rateLimit = config.rateLimit;
    }
    if (config.timeout !== undefined) {
      baseConfig.timeout = config.timeout;
    }
    if (config.retries !== undefined) {
      baseConfig.retries = config.retries;
    }
    if (config.initialBackoff !== undefined) {
      baseConfig.initialBackoff = config.initialBackoff;
    }
    if (config.maxBackoff !== undefined) {
      baseConfig.maxBackoff = config.maxBackoff;
    }
    super(baseConfig);

    this.scopusConfig = config;
    this.client = new ScopusClient(config);
  }

  /**
   * Translate QueryAST to Scopus search syntax.
   */
  translateQuery(ast: QueryAST): TranslatedQuery {
    return translateQuery(ast);
  }

  /**
   * Execute search and return results as async iterable.
   */
  async *search(
    query: TranslatedQuery,
    options: SearchOptions = {}
  ): AsyncIterable<Article> {
    const maxResults = options.maxResults ?? this.scopusConfig.maxResults ?? 10000;
    const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);

    let offset = 0;
    let totalResults = 0;
    let retrievedCount = 0;

    // Initialize state
    this.currentState = this.createBaseState(query, 0, 0);

    while (retrievedCount < maxResults) {
      // Wait for rate limiter
      await this.rateLimiter.acquire();

      // Fetch page with retry
      const response = await this.withRetry(async () => {
        return await this.client.search(query.native, {
          start: offset,
          count: Math.min(pageSize, maxResults - retrievedCount),
        });
      });

      // Update total on first page
      if (offset === 0) {
        totalResults = response.totalResults;
      }

      // Update state
      this.currentState = {
        ...this.createBaseState(query, totalResults, retrievedCount),
        providerState: {
          offset,
          totalResults,
          query: query.native,
        } as ScopusProviderState,
      };

      // Yield articles
      for (const entry of response.entries) {
        if (retrievedCount >= maxResults) {
          break;
        }

        const doc = parseDocument(entry);
        retrievedCount++;
        yield doc;

        // Update state after each article
        if (this.currentState) {
          this.currentState.retrievedCount = retrievedCount;
          this.currentState.lastUpdated = new Date();
        }
      }

      // Move to next page
      offset += response.entries.length;

      // Check if we've retrieved all results
      if (offset >= totalResults || response.entries.length === 0) {
        break;
      }

      // Check abort signal
      if (options.signal?.aborted) {
        break;
      }
    }

    // Clear state when search completes
    this.currentState = null;
  }

  /**
   * Verify API access and credentials.
   */
  async testConnection(): Promise<boolean> {
    return this.client.testConnection();
  }

  /**
   * Get current search state for session persistence.
   */
  getSearchState(): SearchState | null {
    return this.currentState;
  }

  /**
   * Resume search from saved state.
   */
  async *resumeSearch(state: SearchState): AsyncIterable<Article> {
    const providerState = state.providerState as ScopusProviderState;
    if (!providerState) {
      throw new Error('Invalid state: missing provider state');
    }

    const maxResults = state.totalResults;
    const pageSize = DEFAULT_PAGE_SIZE;

    let offset = providerState.offset + state.retrievedCount;
    let retrievedCount = state.retrievedCount;

    // Restore state
    this.currentState = { ...state };

    while (retrievedCount < maxResults) {
      // Wait for rate limiter
      await this.rateLimiter.acquire();

      // Fetch page with retry
      const response = await this.withRetry(async () => {
        return await this.client.search(providerState.query, {
          start: offset,
          count: Math.min(pageSize, maxResults - retrievedCount),
        });
      });

      // Update state
      this.currentState = {
        ...this.currentState!,
        retrievedCount,
        lastUpdated: new Date(),
        providerState: {
          ...providerState,
          offset,
        },
      };

      // Yield articles
      for (const entry of response.entries) {
        if (retrievedCount >= maxResults) {
          break;
        }

        const doc = parseDocument(entry);
        retrievedCount++;
        yield doc;

        // Update state after each article
        if (this.currentState) {
          this.currentState.retrievedCount = retrievedCount;
          this.currentState.lastUpdated = new Date();
        }
      }

      // Move to next page
      offset += response.entries.length;

      // Check if we've retrieved all results
      if (offset >= maxResults || response.entries.length === 0) {
        break;
      }
    }

    // Clear state when search completes
    this.currentState = null;
  }

  /**
   * Validate if a saved state is still valid for resuming.
   */
  async validateState(state: SearchState): Promise<SearchResumeResult> {
    // Check if the API key is still valid
    const connectionValid = await this.testConnection();
    if (!connectionValid) {
      return {
        valid: false,
        reason: 'API key is invalid or connection failed',
      };
    }

    // For Scopus, offset-based pagination is always valid if the API key works
    // We don't need to check server-side state like PubMed's WebEnv
    const providerState = state.providerState as ScopusProviderState;
    if (!providerState) {
      return {
        valid: false,
        reason: 'Missing provider state',
      };
    }

    return { valid: true };
  }
}
