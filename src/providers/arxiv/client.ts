/**
 * arXiv HTTP Client
 *
 * HTTP client for arXiv API with strict rate limiting.
 * arXiv enforces 1 request per 3 seconds and will block IPs that violate this.
 */

import { parseAtomFeed } from './parser.js';
import type { ArxivSearchResponse } from './types.js';
import { createProviderError } from '../base/types.js';

/**
 * Search options for arXiv API.
 */
export interface ArxivSearchOptions {
  /** Starting offset (0-based) */
  start: number;
  /** Maximum results to return */
  maxResults: number;
  /** Sort field */
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  /** Sort order */
  sortOrder?: 'ascending' | 'descending';
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Client configuration.
 */
export interface ArxivClientConfig {
  /** Base URL for arXiv API */
  baseUrl?: string;
  /** Minimum interval between requests in ms (default: 3000) */
  minRequestInterval?: number;
  /** Request timeout in ms */
  timeout?: number;
}

const DEFAULT_BASE_URL = 'http://export.arxiv.org/api/query';
const DEFAULT_MIN_REQUEST_INTERVAL = 3000; // 3 seconds
const DEFAULT_TIMEOUT = 60000; // 60 seconds

/**
 * HTTP client for arXiv API.
 */
export class ArxivClient {
  private readonly baseUrl: string;
  private readonly minRequestInterval: number;
  private readonly timeout: number;
  private lastRequestTime = 0;

  constructor(config: ArxivClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.minRequestInterval = config.minRequestInterval ?? DEFAULT_MIN_REQUEST_INTERVAL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Search arXiv with the given query.
   */
  async search(query: string, options: ArxivSearchOptions): Promise<ArxivSearchResponse> {
    // Enforce rate limiting
    await this.waitForRateLimit();

    const url = this.buildUrl(query, options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Combine with external signal if provided
    const abortHandler = () => controller.abort();
    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler);
    }

    try {
      this.lastRequestTime = Date.now();

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/atom+xml',
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw createProviderError(
          response.status === 503 ? 'RATE_LIMIT_EXCEEDED' : 'SERVER_ERROR',
          `arXiv API error: ${response.status} ${response.statusText}`,
          'arxiv',
          { retryable: response.status >= 500, cause: new Error(body) }
        );
      }

      const xml = await response.text();
      return parseAtomFeed(xml);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createProviderError(
          'TIMEOUT',
          'arXiv API request timed out',
          'arxiv',
          { retryable: true }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      // Clean up abort listener to prevent memory leaks
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /**
   * Build the API URL with query parameters.
   */
  private buildUrl(query: string, options: ArxivSearchOptions): string {
    const params = new URLSearchParams();
    params.set('search_query', query);
    params.set('start', String(options.start));
    params.set('max_results', String(options.maxResults));

    if (options.sortBy) {
      params.set('sortBy', options.sortBy);
    }
    if (options.sortOrder) {
      params.set('sortOrder', options.sortOrder);
    }

    return `${this.baseUrl}?${params.toString()}`;
  }

  /**
   * Wait until rate limit allows next request.
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await this.sleep(waitTime);
    }
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
