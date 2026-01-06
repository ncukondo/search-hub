/**
 * arXiv Provider
 *
 * Provider implementation for searching the arXiv preprint server.
 * Supports physics, mathematics, computer science, quantitative biology,
 * and related fields.
 */

import { BaseProvider } from '../base/provider.js';
import type {
  Article,
  TranslatedQuery,
  SearchOptions,
  SearchState,
  SearchResumeResult,
  QueryAST,
} from '../base/types.js';
import { ArxivClient } from './client.js';
import { translateQuery } from './translator.js';
import type { ArxivConfig, ArxivProviderState } from './types.js';
import { DEFAULT_ARXIV_CONFIG } from './types.js';

const DEFAULT_PAGE_SIZE = 100;

/**
 * arXiv provider for searching preprints.
 */
export class ArxivProvider extends BaseProvider {
  readonly name = 'arxiv' as const;

  private readonly client: ArxivClient;
  private readonly arxivConfig: Required<ArxivConfig>;

  // State tracking for session resume
  private currentState: SearchState | null = null;

  constructor(config: ArxivConfig = {}) {
    super({
      rateLimit: config.rateLimit ?? DEFAULT_ARXIV_CONFIG.rateLimit,
      timeout: config.timeout ?? DEFAULT_ARXIV_CONFIG.timeout,
      retries: config.retries ?? DEFAULT_ARXIV_CONFIG.retries,
      initialBackoff: config.initialBackoff ?? DEFAULT_ARXIV_CONFIG.initialBackoff,
      maxBackoff: config.maxBackoff ?? DEFAULT_ARXIV_CONFIG.maxBackoff,
    });

    this.arxivConfig = {
      ...DEFAULT_ARXIV_CONFIG,
      ...config,
    };

    this.client = new ArxivClient({
      baseUrl: this.arxivConfig.baseUrl,
      minRequestInterval: Math.ceil(1000 / this.arxivConfig.rateLimit), // Convert rate to interval
      timeout: this.arxivConfig.timeout,
    });
  }

  /**
   * Translate QueryAST to arXiv-native query syntax.
   */
  translateQuery(ast: QueryAST): TranslatedQuery {
    return translateQuery(ast);
  }

  /**
   * Search arXiv and yield articles as async iterable.
   */
  async *search(query: TranslatedQuery, options?: SearchOptions): AsyncIterable<Article> {
    const maxResults = options?.maxResults ?? this.arxivConfig.maxResults;
    const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

    let offset = 0;
    let retrievedCount = 0;
    let totalResults = 0;

    while (retrievedCount < maxResults) {
      const searchOptions: { start: number; maxResults: number; signal?: AbortSignal } = {
        start: offset,
        maxResults: Math.min(pageSize, maxResults - retrievedCount),
      };
      if (options?.signal) {
        searchOptions.signal = options.signal;
      }

      const response = await this.withRetry(() =>
        this.client.search(query.native, searchOptions)
      );

      totalResults = response.totalResults;

      // Update state for session resume
      this.currentState = {
        ...this.createBaseState(query, totalResults, retrievedCount),
        providerState: { offset } as ArxivProviderState,
      };

      // Yield articles from this page
      for (const entry of response.entries) {
        if (retrievedCount >= maxResults) {
          break;
        }
        yield entry;
        retrievedCount++;
      }

      // Update state after yielding
      if (this.currentState) {
        this.currentState.retrievedCount = retrievedCount;
        this.currentState.providerState = {
          offset: offset + response.entries.length,
        } as ArxivProviderState;
      }

      // Check if we've retrieved all available results
      if (response.entries.length === 0 || offset + response.entries.length >= totalResults) {
        break;
      }

      offset += response.entries.length;
    }

    // Clear state when search completes
    this.currentState = null;
  }

  /**
   * Test connection to arXiv API.
   */
  async testConnection(): Promise<boolean> {
    try {
      // Make a minimal search request
      await this.client.search('ti:test', { start: 0, maxResults: 1 });
      return true;
    } catch {
      return false;
    }
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
    const providerState = state.providerState as ArxivProviderState | undefined;
    const startOffset = providerState?.offset ?? 0;

    const maxResults = state.totalResults - state.retrievedCount;
    const pageSize = DEFAULT_PAGE_SIZE;

    let offset = startOffset;
    let retrievedCount = 0;

    while (retrievedCount < maxResults) {
      const response = await this.withRetry(() =>
        this.client.search(state.query.native, {
          start: offset,
          maxResults: Math.min(pageSize, maxResults - retrievedCount),
        })
      );

      // Update state
      this.currentState = {
        ...state,
        retrievedCount: state.retrievedCount + retrievedCount,
        lastUpdated: new Date(),
        providerState: { offset },
      };

      // Yield articles
      for (const entry of response.entries) {
        if (retrievedCount >= maxResults) {
          break;
        }
        yield entry;
        retrievedCount++;
      }

      // Update state after yielding
      if (this.currentState) {
        this.currentState.retrievedCount = state.retrievedCount + retrievedCount;
        this.currentState.providerState = {
          offset: offset + response.entries.length,
        } as ArxivProviderState;
      }

      // Check if done
      if (response.entries.length === 0 || offset + response.entries.length >= state.totalResults) {
        break;
      }

      offset += response.entries.length;
    }

    this.currentState = null;
  }

  /**
   * Validate if saved state is still valid.
   * arXiv uses offset-based pagination, so state is always valid.
   */
  async validateState(_state: SearchState): Promise<SearchResumeResult> {
    // Offset-based pagination doesn't expire
    return { valid: true };
  }
}
