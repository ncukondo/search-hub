/**
 * Mock provider for testing.
 *
 * Provides configurable responses for testing search orchestration
 * and other components that depend on providers.
 */

import { BaseProvider } from './provider';
import type { BaseProviderConfig } from './provider';
import type {
  ProviderName,
  Article,
  TranslatedQuery,
  SearchOptions,
  QueryAST,
  ProviderError,
  SearchState,
  SearchResumeResult,
  ConnectionTestResult,
} from './types';

/**
 * Configuration options for MockProvider.
 */
export interface MockProviderOptions extends BaseProviderConfig {
  /** Provider name to use */
  name?: ProviderName;
  /** Articles to return from search */
  articles?: Article[];
  /** Pre-configured translated query response */
  translatedQuery?: TranslatedQuery;
  /** Connection status to return from testConnection */
  connectionStatus?: boolean;
  /** Delay in ms before returning search results */
  searchDelay?: number;
  /** Error to throw on search */
  searchError?: ProviderError;
  /** State validation result to return */
  stateValidation?: SearchResumeResult;
}

/**
 * Default mock articles.
 */
const DEFAULT_ARTICLES: Article[] = [
  {
    doi: '10.1234/mock-article-1',
    title: 'Mock Article 1',
    authors: [{ family: 'Mock', given: 'Author' }],
    source: 'pubmed',
    retrievedAt: new Date().toISOString(),
    abstract: 'This is a mock article for testing purposes.',
  },
  {
    doi: '10.1234/mock-article-2',
    title: 'Mock Article 2',
    authors: [{ family: 'Test', given: 'Researcher' }],
    source: 'pubmed',
    retrievedAt: new Date().toISOString(),
    abstract: 'Another mock article for testing.',
  },
];

/**
 * Mock provider for testing.
 *
 * Allows configuring:
 * - Articles to return from search
 * - Translated query response
 * - Connection status
 * - Search delay (for simulating network latency)
 * - Search errors (for testing error handling)
 */
export class MockProvider extends BaseProvider {
  readonly name: ProviderName;
  private mockArticles: Article[];
  private translatedQueryResponse: TranslatedQuery;
  private connectionStatus: boolean;
  private searchDelay: number;
  private searchError: ProviderError | null;
  private currentSearchState: SearchState | null = null;
  private stateValidationResult: SearchResumeResult;
  private currentRetrievedCount = 0;

  constructor(options: MockProviderOptions = {}) {
    super(options);

    this.name = options.name ?? 'pubmed';
    this.mockArticles = options.articles ?? [...DEFAULT_ARTICLES];
    this.translatedQueryResponse = options.translatedQuery ?? {
      native: 'mock query',
      originalAst: {
        name: 'mock-query',
        blocks: [],
        filters: {},
        overrides: {},
      },
      provider: this.name,
    };
    this.connectionStatus = options.connectionStatus ?? true;
    this.searchDelay = options.searchDelay ?? 0;
    this.searchError = options.searchError ?? null;
    this.stateValidationResult = options.stateValidation ?? { valid: true };

    // Update articles source to match provider name
    this.mockArticles = this.mockArticles.map((article) => ({
      ...article,
      source: this.name,
    }));
  }

  async *search(
    _query: TranslatedQuery,
    options?: SearchOptions
  ): AsyncIterable<Article> {
    // Throw configured error if set
    if (this.searchError !== null) {
      throw this.searchError;
    }

    // Simulate network delay
    if (this.searchDelay > 0) {
      await this.delay(this.searchDelay);
    }

    // Determine how many articles to yield
    const maxResults = options?.maxResults ?? this.mockArticles.length;
    let count = 0;

    for (const article of this.mockArticles) {
      if (count >= maxResults) {
        break;
      }

      // Check for abort signal
      if (options?.signal?.aborted) {
        break;
      }

      yield article;
      count++;
    }
  }

  async count(_query: TranslatedQuery): Promise<number> {
    if (this.searchError !== null) {
      throw this.searchError;
    }
    if (this.searchDelay > 0) {
      await this.delay(this.searchDelay);
    }
    return this.mockArticles.length;
  }

  translateQuery(ast: QueryAST): TranslatedQuery {
    return {
      ...this.translatedQueryResponse,
      originalAst: ast,
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return this.connectionStatus ? { ok: true } : { ok: false, error: 'Connection test failed' };
  }

  /**
   * Update the articles to return.
   */
  setArticles(articles: Article[]): void {
    this.mockArticles = articles.map((article) => ({
      ...article,
      source: this.name,
    }));
  }

  /**
   * Set the error to throw on search.
   */
  setSearchError(error: ProviderError | null): void {
    this.searchError = error;
  }

  /**
   * Set the connection status.
   */
  setConnectionStatus(status: boolean): void {
    this.connectionStatus = status;
  }

  /**
   * Get current search state for session persistence.
   */
  getSearchState(): SearchState | null {
    return this.currentSearchState;
  }

  /**
   * Resume search from saved state.
   */
  async *resumeSearch(state: SearchState): AsyncIterable<Article> {
    // Extract offset from provider state
    const providerState = state.providerState as { offset?: number } | undefined;
    const offset = providerState?.offset ?? state.retrievedCount;

    // Throw configured error if set
    if (this.searchError !== null) {
      throw this.searchError;
    }

    // Simulate network delay
    if (this.searchDelay > 0) {
      await this.delay(this.searchDelay);
    }

    // Update current state
    this.currentSearchState = {
      ...state,
      lastUpdated: new Date(),
    };
    this.currentRetrievedCount = offset;

    // Yield remaining articles starting from offset
    for (let i = offset; i < this.mockArticles.length; i++) {
      const article = this.mockArticles[i];
      if (article) {
        this.currentRetrievedCount++;
        this.currentSearchState = {
          ...this.currentSearchState,
          retrievedCount: this.currentRetrievedCount,
          lastUpdated: new Date(),
          providerState: { offset: this.currentRetrievedCount },
        };
        yield article;
      }
    }
  }

  /**
   * Validate if state is still valid for resuming.
   */
  async validateState(_state: SearchState): Promise<SearchResumeResult> {
    return this.stateValidationResult;
  }

  /**
   * Set the state validation result.
   */
  setStateValidation(result: SearchResumeResult): void {
    this.stateValidationResult = result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
