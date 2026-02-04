/**
 * ERIC HTTP client.
 * Handles API requests to the ERIC database.
 */

import type { ERICSearchResponse } from './types';
import { parseSearchResponse, type ERICSearchResult } from './parser';
import { createProviderError } from '../base/types';

/** ERIC API base URL */
export const ERIC_API_BASE_URL = 'https://api.ies.ed.gov/eric/';

/** Default fields to request from ERIC API */
export const DEFAULT_FIELDS = [
  'id',
  'title',
  'author',
  'description',
  'publicationdateyear',
  'publicationtype',
  'source',
  'issn',
  'peerreviewed',
  'url',
  'identifiersgov',
  'subject',
];

/** Default page size for search results */
const DEFAULT_PAGE_SIZE = 100;

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/**
 * Search options for ERIC client.
 */
export interface ERICSearchOptions {
  /** Starting offset (0-based) */
  start?: number;
  /** Number of results to return (max 2000) */
  rows?: number;
  /** Fields to return (default: DEFAULT_FIELDS) */
  fields?: string[];
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Configuration for ERIC client.
 */
export interface ERICClientConfig {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Base URL for ERIC API */
  baseUrl?: string;
}

/**
 * HTTP client for ERIC API.
 */
export class ERICClient {
  private readonly timeout: number;
  private readonly baseUrl: string;

  constructor(config: ERICClientConfig = {}) {
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.baseUrl = config.baseUrl ?? ERIC_API_BASE_URL;
  }

  /**
   * Search ERIC database.
   */
  async search(
    query: string,
    options: ERICSearchOptions = {}
  ): Promise<ERICSearchResult> {
    const {
      start = 0,
      rows = DEFAULT_PAGE_SIZE,
      fields = DEFAULT_FIELDS,
      signal,
    } = options;

    // Build URL with query parameters
    const params = new URLSearchParams({
      search: query,
      format: 'json',
      start: start.toString(),
      rows: rows.toString(),
      fields: fields.join(','),
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Chain with provided signal if any
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw createProviderError(
          response.status >= 500 ? 'SERVER_ERROR' : 'PARSE_ERROR',
          `ERIC API error: ${response.status} ${response.statusText}`,
          'eric',
          { retryable: response.status >= 500 }
        );
      }

      const json = (await response.json()) as ERICSearchResponse;
      return parseSearchResponse(json);
    } catch (error) {
      // Handle AbortError (timeout or user cancellation)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw createProviderError(
          'TIMEOUT',
          'ERIC API request timed out or was aborted. ' +
            'This may be due to slow network or server issues. ' +
            'Try again later or check your network connection.',
          'eric',
          { retryable: true, cause: error }
        );
      }
      // Handle network errors (connection refused, DNS failure, etc.)
      if (error instanceof TypeError ||
          (error instanceof Error && /network|fetch|connect|ECONNREFUSED|ENOTFOUND|dns/i.test(error.message))) {
        throw createProviderError(
          'NETWORK_ERROR',
          'Failed to connect to ERIC API. ' +
            'This may be due to network issues or the ERIC service being unavailable. ' +
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          'eric',
          { retryable: true, cause: error }
        );
      }
      // Re-throw ProviderErrors as-is (from parseSearchResponse validation)
      if (error && typeof error === 'object' && 'code' in error && 'provider' in error) {
        throw error;
      }
      // Wrap unexpected errors
      throw createProviderError(
        'SERVER_ERROR',
        `ERIC API unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'eric',
        { retryable: false, cause: error }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
