/**
 * Scopus HTTP Client
 *
 * Handles HTTP communication with the Scopus Search API.
 */

import type { ScopusConfig, ScopusSearchResponse } from './types';
import { parseSearchResponse } from './parser';
import { createProviderError, type ConnectionTestResult, type ProviderError, type RateLimitError } from '../base/types';

const SCOPUS_API_BASE = 'https://api.elsevier.com';
const SCOPUS_SEARCH_ENDPOINT = '/content/search/scopus';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Rate limit information from response headers.
 */
export interface ScopusRateLimitInfo {
  /** Maximum requests per time window */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** Unix timestamp when the window resets */
  reset: number;
}

/**
 * Search options for the Scopus client.
 */
export interface ScopusSearchOptions {
  /** Start index for pagination (0-based) */
  start?: number;
  /** Number of results per page (max 25 for COMPLETE view) */
  count?: number;
  /** View type (STANDARD or COMPLETE) */
  view?: 'STANDARD' | 'COMPLETE';
  /** Fields to return */
  fields?: string;
}

/**
 * Extended search response with rate limit info.
 */
export interface ScopusClientResponse extends ScopusSearchResponse {
  /** Rate limit information from response headers */
  rateLimit?: ScopusRateLimitInfo | undefined;
}

/**
 * HTTP client for Scopus API.
 */
export class ScopusClient {
  private readonly config: ScopusConfig;

  constructor(config: ScopusConfig) {
    this.config = config;
  }

  /**
   * Execute a search query against Scopus API.
   */
  async search(
    query: string,
    options: ScopusSearchOptions = {}
  ): Promise<ScopusClientResponse> {
    const url = this.buildSearchUrl(query, options);
    const headers = this.buildHeaders();
    const timeoutMs = this.config.timeout ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw this.handleErrorResponse(response);
      }

      const json = await response.json();
      const parsed = parseSearchResponse(json);

      return {
        ...parsed,
        rateLimit: this.parseRateLimitHeaders(response.headers),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createProviderError(
          'TIMEOUT',
          `Scopus API request timed out after ${timeoutMs}ms`,
          'scopus',
          { retryable: true }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Test the API connection by making a minimal search request.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Use a simple valid query instead of '*' which Scopus may reject
      await this.search('ALL(test)', { count: 1, view: 'STANDARD' });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);
      return { ok: false, error: message };
    }
  }

  /**
   * Build the search URL with query parameters.
   */
  private buildSearchUrl(query: string, options: ScopusSearchOptions): URL {
    const url = new URL(SCOPUS_SEARCH_ENDPOINT, SCOPUS_API_BASE);

    url.searchParams.set('query', query);
    url.searchParams.set('view', options.view ?? 'COMPLETE');

    if (options.start !== undefined) {
      url.searchParams.set('start', String(options.start));
    }
    if (options.count !== undefined) {
      url.searchParams.set('count', String(options.count));
    }
    if (options.fields !== undefined) {
      url.searchParams.set('field', options.fields);
    }

    return url;
  }

  /**
   * Build request headers including authentication.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-ELS-APIKey': this.config.apiKey,
    };

    if (this.config.instToken) {
      headers['X-ELS-Insttoken'] = this.config.instToken;
    }

    return headers;
  }

  /**
   * Parse rate limit information from response headers.
   */
  private parseRateLimitHeaders(headers: Headers): ScopusRateLimitInfo | undefined {
    const limit = headers.get('X-RateLimit-Limit');
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');

    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      };
    }

    return undefined;
  }

  /**
   * Handle error responses and convert to ProviderError.
   */
  private handleErrorResponse(response: Response): ProviderError | RateLimitError {
    const { status } = response;

    switch (status) {
      case 401:
        return createProviderError(
          'API_KEY_INVALID',
          `Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/`,
          'scopus',
          { retryable: false }
        );

      case 403:
        return createProviderError(
          'ACCESS_DENIED',
          `Scopus API access denied (HTTP 403). Your key may lack permissions for this resource.`,
          'scopus',
          { retryable: false }
        );

      case 429: {
        const retryAfter = response.headers.get('Retry-After');
        const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
        return {
          ...createProviderError(
            'RATE_LIMIT_EXCEEDED',
            'Scopus API rate limit exceeded',
            'scopus',
            { retryable: true }
          ),
          retryAfter: retryMs,
        } as RateLimitError;
      }

      default:
        if (status >= 500) {
          return createProviderError(
            'SERVER_ERROR',
            `Scopus API server error: ${status} ${response.statusText}`,
            'scopus',
            { retryable: true }
          );
        }
        return createProviderError(
          'NETWORK_ERROR',
          `Scopus API error: ${status} ${response.statusText}`,
          'scopus',
          { retryable: false }
        );
    }
  }
}
