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

  constructor(config: PubMedConfig) {
    super(config);
    this.pubmedConfig = config;
    this.client = new PubMedClient(config);
  }

  /**
   * Search PubMed and stream results.
   */
  async *search(
    query: TranslatedQuery,
    options?: SearchOptions
  ): AsyncIterable<Article> {
    const maxResults = options?.maxResults;
    const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
    let retstart = 0;
    let totalRetrieved = 0;

    // Initial search to get total count and first batch of PMIDs
    const initialResult = await this.client.search(query.native, {
      retstart,
      retmax: pageSize,
      useHistory: false,
    });

    const totalCount = initialResult.count;

    // Update state
    this.currentState = this.createBaseState(query, totalCount, 0);

    // If no results, return early
    if (totalCount === 0 || initialResult.idlist.length === 0) {
      return;
    }

    // Process first page
    let currentPmids = initialResult.idlist;

    while (currentPmids.length > 0) {
      // Check if we've hit maxResults
      const remainingToFetch = maxResults !== undefined
        ? Math.min(currentPmids.length, maxResults - totalRetrieved)
        : currentPmids.length;

      if (remainingToFetch <= 0) {
        break;
      }

      const pmidsToFetch = currentPmids.slice(0, remainingToFetch);

      // Fetch full article data
      const articles = await this.client.fetch(pmidsToFetch);

      for (const article of articles) {
        yield article;
        totalRetrieved++;

        // Update state
        if (this.currentState) {
          this.currentState.retrievedCount = totalRetrieved;
          this.currentState.lastUpdated = new Date();
        }

        // Check maxResults
        if (maxResults !== undefined && totalRetrieved >= maxResults) {
          return;
        }
      }

      // Move to next page
      retstart += pageSize;

      // Check if we need more pages
      if (retstart >= totalCount) {
        break;
      }

      // Fetch next page of PMIDs
      const nextResult = await this.client.search(query.native, {
        retstart,
        retmax: pageSize,
      });

      currentPmids = nextResult.idlist;
    }
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
  async testConnection(): Promise<boolean> {
    try {
      await this.client.search('test', { retmax: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current search state for persistence.
   */
  getSearchState(): SearchState | null {
    return this.currentState;
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
      const result = await this.client.search(query.native, {
        retstart,
        retmax: DEFAULT_PAGE_SIZE,
      });

      // Update current state
      this.currentState = {
        ...state,
        lastUpdated: new Date(),
      };

      let currentPmids = result.idlist;
      let totalRetrieved = state.retrievedCount;

      while (currentPmids.length > 0) {
        const articles = await this.client.fetch(currentPmids);

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
        const nextResult = await this.client.search(query.native, {
          retstart: totalRetrieved,
          retmax: DEFAULT_PAGE_SIZE,
        });

        currentPmids = nextResult.idlist;
      }

      return;
    }

    // Use history server for resume
    if (providerState.webenv && providerState.querykey) {
      this.currentState = {
        ...state,
        lastUpdated: new Date(),
      };

      let retstart = providerState.retstart;
      let totalRetrieved = state.retrievedCount;

      while (totalRetrieved < state.totalResults) {
        const articles = await this.client.fetchFromHistory({
          webenv: providerState.webenv,
          querykey: providerState.querykey,
          retstart,
          retmax: DEFAULT_PAGE_SIZE,
        });

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
