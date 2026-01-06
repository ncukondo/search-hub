/**
 * PubMed HTTP client for E-utilities API.
 *
 * Handles communication with NCBI's PubMed database including:
 * - esearch: Search and get PMIDs
 * - efetch: Fetch full records by PMID
 */

import { RateLimiter, createProviderError } from '../base/index.js';
import type { ProviderError, ProviderErrorCode } from '../base/types.js';
import { parseESearchResponse, parseEFetchResponse } from './parser.js';
import type { ESearchResponse, PubMedArticle, PubMedConfig } from './types.js';

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * Options for esearch API call.
 */
export interface SearchOptions {
  /** Starting offset for pagination (default: 0) */
  retstart?: number;
  /** Maximum number of results to return (default: 20, max: 10000) */
  retmax?: number;
  /** Use history server for large result sets */
  useHistory?: boolean;
}

/**
 * Options for history-based fetch.
 */
export interface HistoryFetchOptions {
  /** Web environment from esearch */
  webenv: string;
  /** Query key from esearch */
  querykey: string;
  /** Starting offset */
  retstart: number;
  /** Maximum number of results */
  retmax: number;
}

/**
 * HTTP client for PubMed E-utilities API.
 */
export class PubMedClient {
  private readonly config: PubMedConfig;
  private readonly rateLimiter: RateLimiter;

  constructor(config: PubMedConfig) {
    this.config = config;

    // Rate limit: 3 req/s without key, 10 req/s with key
    const tokensPerSecond = config.apiKey ? 10 : 3;
    this.rateLimiter = new RateLimiter({
      tokensPerSecond,
      burstSize: tokensPerSecond,
    });
  }

  /**
   * Search PubMed using esearch API.
   */
  async search(query: string, options: SearchOptions = {}): Promise<ESearchResponse> {
    await this.rateLimiter.acquire();

    const params = new URLSearchParams({
      db: 'pubmed',
      term: query,
      email: this.config.email,
      retmode: 'xml',
    });

    if (this.config.apiKey) {
      params.set('api_key', this.config.apiKey);
    }

    if (options.retstart !== undefined) {
      params.set('retstart', String(options.retstart));
    }

    if (options.retmax !== undefined) {
      params.set('retmax', String(options.retmax));
    }

    if (options.useHistory) {
      params.set('usehistory', 'y');
    }

    const url = `${BASE_URL}/esearch.fcgi?${params.toString()}`;
    const response = await this.fetchWithErrorHandling(url);
    const xml = await response.text();

    this.rateLimiter.resetBackoff();
    return parseESearchResponse(xml);
  }

  /**
   * Fetch articles by PMID list using efetch API.
   */
  async fetch(pmids: string[]): Promise<PubMedArticle[]> {
    if (pmids.length === 0) {
      return [];
    }

    await this.rateLimiter.acquire();

    const params = new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      rettype: 'xml',
      retmode: 'xml',
      email: this.config.email,
    });

    if (this.config.apiKey) {
      params.set('api_key', this.config.apiKey);
    }

    const url = `${BASE_URL}/efetch.fcgi?${params.toString()}`;
    const response = await this.fetchWithErrorHandling(url);
    const xml = await response.text();

    this.rateLimiter.resetBackoff();
    return parseEFetchResponse(xml).articles;
  }

  /**
   * Fetch articles using history server (webenv/querykey).
   */
  async fetchFromHistory(options: HistoryFetchOptions): Promise<PubMedArticle[]> {
    await this.rateLimiter.acquire();

    const params = new URLSearchParams({
      db: 'pubmed',
      WebEnv: options.webenv,
      query_key: options.querykey,
      retstart: String(options.retstart),
      retmax: String(options.retmax),
      rettype: 'xml',
      retmode: 'xml',
      email: this.config.email,
    });

    if (this.config.apiKey) {
      params.set('api_key', this.config.apiKey);
    }

    const url = `${BASE_URL}/efetch.fcgi?${params.toString()}`;
    const response = await this.fetchWithErrorHandling(url);
    const xml = await response.text();

    this.rateLimiter.resetBackoff();
    return parseEFetchResponse(xml).articles;
  }

  /**
   * Fetch with error handling for HTTP responses.
   */
  private async fetchWithErrorHandling(url: string): Promise<Response> {
    let response: Response;

    try {
      response = await fetch(url);
    } catch (error) {
      throw this.createError('NETWORK_ERROR', 'Network request failed', true, error);
    }

    if (response.ok) {
      return response;
    }

    // Handle error responses
    if (response.status === 400) {
      throw this.createError('PARSE_ERROR', 'Invalid query syntax', false);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const error = this.createError(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests',
        true
      ) as ProviderError & { retryAfter?: number };
      if (retryAfter) {
        error.retryAfter = parseInt(retryAfter, 10) * 1000;
      }
      throw error;
    }

    if (response.status >= 500) {
      throw this.createError('SERVER_ERROR', `Server error: ${response.status}`, true);
    }

    throw this.createError(
      'NETWORK_ERROR',
      `HTTP ${response.status}: ${response.statusText}`,
      true
    );
  }

  /**
   * Create a ProviderError.
   */
  private createError(
    code: ProviderErrorCode,
    message: string,
    retryable: boolean,
    cause?: unknown
  ): ProviderError {
    return createProviderError(code, message, 'pubmed', { retryable, cause });
  }
}
