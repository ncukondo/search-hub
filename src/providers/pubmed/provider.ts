/**
 * PubMed Provider implementation.
 *
 * Provides access to NCBI's PubMed database for biomedical literature searches.
 */

import { BaseProvider } from '../base/provider.js';
import type {
  Article,
  QueryAST,
  SearchOptions,
  SearchState,
  TranslatedQuery,
  SearchResumeResult,
  ConnectionTestResult,
} from '../base/types.js';
import { PubMedClient } from './client.js';
import { translateQuery } from './translator.js';
import type { PubMedConfig, PubMedProviderState } from './types.js';

/** Default page size for fetching results */
const DEFAULT_PAGE_SIZE = 20;

/**
 * PubMed provider for searching biomedical literature.
 */
export class PubMedProvider extends BaseProvider {
  readonly name = 'pubmed' as const;

  private readonly client: PubMedClient;
  private readonly pubmedConfig: PubMedConfig;

  /** Current search state for session persistence */
  private currentState: SearchState | null = null;

  /** Warnings from the most recent search */
  private searchWarnings: string[] = [];

  constructor(config: PubMedConfig) {
    super({
      ...config,
      rateLimit: config.rateLimit ?? (config.apiKey ? 10 : 3),
    });
    this.pubmedConfig = config;
    this.client = new PubMedClient(config, this.rateLimiter);
  }

  /**
   * Search PubMed and stream results.
   * Uses NCBI history server for efficient pagination of large result sets.
   */
  async *search(
    query: TranslatedQuery,
    options?: SearchOptions
  ): AsyncIterable<Article> {
    const maxResults = options?.maxResults;
    const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
    let retstart = 0;
    let totalRetrieved = 0;

    // Initial search with history server enabled
    const initialResult = await this.withRetry(() => this.client.search(query.native, {
      retstart: 0,
      retmax: pageSize,
      useHistory: true,
    }));

    const totalCount = initialResult.count;
    const webenv = initialResult.webenv;
    const querykey = initialResult.querykey;

    // Store any warnings from the search response
    this.searchWarnings = initialResult.warnings ?? [];

    // Initialize state with provider-specific history server info
    const providerState: PubMedProviderState = {
      retstart: 0,
      useHistory: !!(webenv && querykey),
      ...(webenv && { webenv }),
      ...(querykey && { querykey }),
    };

    this.currentState = {
      ...this.createBaseState(query, totalCount, 0),
      providerState,
    };

    // If no results, return early
    if (totalCount === 0 || initialResult.idlist.length === 0) {
      return;
    }

    // Fetch first page of articles using PMIDs from initial search
    const firstPageArticles = await this.withRetry(() => this.client.fetch(initialResult.idlist));

    for (const article of firstPageArticles) {
      totalRetrieved++;
      retstart++;

      this.updateState(totalRetrieved, retstart, providerState);

      yield article;

      if (maxResults !== undefined && totalRetrieved >= maxResults) {
        return;
      }
    }

    // Continue with subsequent pages using history server if available
    while (retstart < totalCount) {
      if (maxResults !== undefined && totalRetrieved >= maxResults) {
        break;
      }

      const remainingToFetch = maxResults !== undefined
        ? Math.min(pageSize, maxResults - totalRetrieved)
        : pageSize;

      let articles: Article[];

      if (webenv && querykey) {
        // Use history server for efficient pagination
        articles = await this.withRetry(() => this.client.fetchFromHistory({
          webenv,
          querykey,
          retstart,
          retmax: remainingToFetch,
        }));
      } else {
        // Fallback to offset-based pagination
        const result = await this.withRetry(() => this.client.search(query.native, {
          retstart,
          retmax: remainingToFetch,
        }));
        articles = await this.withRetry(() => this.client.fetch(result.idlist));
      }

      if (articles.length === 0) {
        break;
      }

      for (const article of articles) {
        totalRetrieved++;
        retstart++;

        this.updateState(totalRetrieved, retstart, providerState);

        yield article;

        if (maxResults !== undefined && totalRetrieved >= maxResults) {
          return;
        }
      }
    }
  }

  /**
   * Update current state with progress information.
   */
  private updateState(
    retrievedCount: number,
    retstart: number,
    providerState: PubMedProviderState
  ): void {
    if (this.currentState) {
      this.currentState.retrievedCount = retrievedCount;
      this.currentState.lastUpdated = new Date();
      this.currentState.providerState = {
        ...providerState,
        retstart,
      };
    }
  }

  /**
   * Get total hit count for a query without downloading results.
   * Uses ESearch with rettype=count for efficiency.
   */
  async count(query: TranslatedQuery): Promise<number> {
    return this.withRetry(() => this.client.searchCount(query.native));
  }

  /**
   * Convert QueryAST to PubMed native syntax.
   */
  translateQuery(ast: QueryAST): TranslatedQuery {
    return translateQuery(ast);
  }

  /**
   * Test connection to PubMed API.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.client.search('test', { retmax: 1 });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  /**
   * Get current search state for persistence.
   */
  getSearchState(): SearchState | null {
    return this.currentState;
  }

  /**
   * Get warnings from the most recent search.
   */
  getWarnings(): string[] {
    return this.searchWarnings;
  }

  /**
   * Resume search from saved state.
   */
  async *resumeSearch(state: SearchState): AsyncIterable<Article> {
    const providerState = state.providerState as PubMedProviderState | undefined;

    if (!providerState) {
      // No provider-specific state, start fresh from offset
      const query = state.query;
      const retstart = state.retrievedCount;

      // Continue from where we left off
      const result = await this.withRetry(() => this.client.search(query.native, {
        retstart,
        retmax: DEFAULT_PAGE_SIZE,
      }));

      // Update current state
      this.currentState = {
        ...state,
        lastUpdated: new Date(),
      };

      let currentPmids = result.idlist;
      let totalRetrieved = state.retrievedCount;

      while (currentPmids.length > 0) {
        const articles = await this.withRetry(() => this.client.fetch(currentPmids));

        for (const article of articles) {
          yield article;
          totalRetrieved++;

          if (this.currentState) {
            this.currentState.retrievedCount = totalRetrieved;
            this.currentState.lastUpdated = new Date();
          }
        }

        // Check if done
        if (totalRetrieved >= state.totalResults) {
          break;
        }

        // Fetch next page
        const nextResult = await this.withRetry(() => this.client.search(query.native, {
          retstart: totalRetrieved,
          retmax: DEFAULT_PAGE_SIZE,
        }));

        currentPmids = nextResult.idlist;
      }

      return;
    }

    // Use history server for resume
    if (providerState.webenv && providerState.querykey) {
      const webenv = providerState.webenv;
      const querykey = providerState.querykey;
      this.currentState = {
        ...state,
        lastUpdated: new Date(),
      };

      let retstart = providerState.retstart;
      let totalRetrieved = state.retrievedCount;

      while (totalRetrieved < state.totalResults) {
        const articles = await this.withRetry(() => this.client.fetchFromHistory({
          webenv,
          querykey,
          retstart,
          retmax: DEFAULT_PAGE_SIZE,
        }));

        if (articles.length === 0) {
          break;
        }

        for (const article of articles) {
          yield article;
          totalRetrieved++;
          retstart++;

          if (this.currentState) {
            this.currentState.retrievedCount = totalRetrieved;
            this.currentState.lastUpdated = new Date();
          }
        }
      }
    }
  }

  /**
   * Validate if saved state is still usable.
   */
  async validateState(state: SearchState): Promise<SearchResumeResult> {
    const providerState = state.providerState as PubMedProviderState | undefined;

    // If no provider state, we can resume with offset pagination
    if (!providerState) {
      return { valid: true };
    }

    // If using history server, validate webenv is still valid
    if (providerState.webenv && providerState.querykey) {
      try {
        // Try to fetch one record to verify history is still valid
        await this.client.fetchFromHistory({
          webenv: providerState.webenv,
          querykey: providerState.querykey,
          retstart: 0,
          retmax: 1,
        });
        return { valid: true };
      } catch {
        return {
          valid: false,
          reason: 'Server-side history expired',
        };
      }
    }

    return { valid: true };
  }
}
