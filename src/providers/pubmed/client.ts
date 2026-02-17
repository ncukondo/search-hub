/**
 * PubMed HTTP client for E-utilities API.
 *
 * Handles communication with NCBI's PubMed database including:
 * - esearch: Search and get PMIDs
 * - efetch: Fetch full records by PMID
 */

import { RateLimiter, createProviderError } from '../base/index.js';
import type { ProviderError, ProviderErrorCode } from '../base/types.js';
import { parseESearchResponse, parseEFetchResponse, parseELinkResponse } from './parser.js';
import type { ELinkOptions, ELinkResponse, RelatedArticle, ESearchResponse, PubMedArticle, PubMedConfig } from './types.js';

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
  /** Sort parameter for esearch (e.g. 'relevance', 'pub_date') */
  sort?: string;
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

  constructor(config: PubMedConfig, rateLimiter: RateLimiter) {
    this.config = config;
    this.rateLimiter = rateLimiter;
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

    if (options.sort) {
      params.set('sort', options.sort);
    }

    const url = `${BASE_URL}/esearch.fcgi?${params.toString()}`;
    const response = await this.fetchWithErrorHandling(url);
    const xml = await response.text();

    this.rateLimiter.resetBackoff();
    return parseESearchResponse(xml);
  }

  /**
   * Get total hit count for a query using ESearch with rettype=count.
   * Does not return IDs or download any results.
   */
  async searchCount(query: string): Promise<number> {
    await this.rateLimiter.acquire();

    const params = new URLSearchParams({
      db: 'pubmed',
      term: query,
      email: this.config.email,
      rettype: 'count',
      retmode: 'xml',
    });

    if (this.config.apiKey) {
      params.set('api_key', this.config.apiKey);
    }

    const url = `${BASE_URL}/esearch.fcgi?${params.toString()}`;
    const response = await this.fetchWithErrorHandling(url);
    const xml = await response.text();

    this.rateLimiter.resetBackoff();
    const parsed = parseESearchResponse(xml);
    return parsed.count;
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
   * Find related articles using ELink API with neighbor_score.
   */
  async findRelated(options: ELinkOptions): Promise<ELinkResponse[]> {
    await this.rateLimiter.acquire();

    const params = new URLSearchParams({
      dbfrom: 'pubmed',
      db: 'pubmed',
      cmd: 'neighbor_score',
      retmode: 'xml',
      email: this.config.email,
    });

    for (const id of options.ids) {
      params.append('id', id);
    }

    if (this.config.apiKey) {
      params.set('api_key', this.config.apiKey);
    }

    if (options.term) {
      params.set('term', options.term);
    }

    const url = `${BASE_URL}/elink.fcgi?${params.toString()}`;
    const response = await this.fetchWithErrorHandling(url);
    const xml = await response.text();

    this.rateLimiter.resetBackoff();
    const results = parseELinkResponse(xml);

    // Apply maxResults truncation per seed
    if (options.maxResults !== undefined) {
      for (const result of results) {
        result.relatedIds = result.relatedIds.slice(0, options.maxResults);
      }
    }

    return results;
  }

  /**
   * Find related articles with deduplication across multiple seeds.
   *
   * Merges related articles from all seeds, keeps highest score for duplicates,
   * excludes seed PMIDs from results, sorts by score descending, and truncates
   * to maxResults.
   */
  async findRelatedMerged(options: ELinkOptions): Promise<RelatedArticle[]> {
    // Pass options without maxResults to findRelated() to avoid double-truncation:
    // each seed should return all results so the merge sees the full picture.
    const { maxResults, ...findRelatedOptions } = options;
    const responses = await this.findRelated(findRelatedOptions);

    const seedSet = new Set(options.ids);
    const scoreMap = new Map<string, number>();

    for (const response of responses) {
      for (const related of response.relatedIds) {
        if (seedSet.has(related.id)) continue;
        const existing = scoreMap.get(related.id);
        if (existing === undefined || related.score > existing) {
          scoreMap.set(related.id, related.score);
        }
      }
    }

    const merged: RelatedArticle[] = Array.from(scoreMap.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);

    if (maxResults !== undefined) {
      return merged.slice(0, maxResults);
    }

    return merged;
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
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
      const error = this.createError(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests',
        true
      ) as ProviderError & { retryAfter?: number };
      if (retryAfterMs !== undefined) {
        error.retryAfter = retryAfterMs;
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
