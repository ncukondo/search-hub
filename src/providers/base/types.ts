/**
 * Provider base types for the search-hub CLI tool.
 * These types define the common interface for all database providers.
 */

import type { QueryAST, ResolvedAST } from '../../query/types.js';

// Re-export QueryAST and ResolvedAST for convenience
export type { QueryAST, ResolvedAST };

/**
 * Supported provider names.
 */
export type ProviderName =
  | 'pubmed'
  | 'eric'
  | 'arxiv'
  | 'scopus'
  | 'wos'
  | 'embase';

/**
 * Author information.
 */
export interface Author {
  /** Last name (required) */
  family: string;
  /** First name */
  given?: string;
  /** Institutional affiliation */
  affiliation?: string;
  /** ORCID identifier */
  orcid?: string;
}

/**
 * Represents a single search result from any database.
 * At least one identifier (doi, pmid, arxivId, scopusId, ericId) is required.
 */
export interface Article {
  // Identifiers (at least one required)
  doi?: string;
  pmid?: string;
  arxivId?: string;
  scopusId?: string;
  ericId?: string;

  // Required fields
  title: string;
  authors: Author[];
  source: ProviderName;
  retrievedAt: string; // ISO 8601 format

  // Optional fields
  abstract?: string;
  publicationDate?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  rawResponse?: unknown;
}

/**
 * Result of translating a query to database-native syntax.
 */
export interface TranslatedQuery {
  /** Database-native query string */
  native: string;
  /** Provider that produced this translation */
  provider: ProviderName;
  /** Warnings about unsupported controlled vocabulary */
  warnings?: string[];
}

/**
 * Search options for controlling query execution.
 */
export type SortField = 'relevance' | 'date';

export interface SearchOptions {
  /** Maximum number of results to retrieve */
  maxResults?: number;
  /** Number of results per page/request */
  pageSize?: number;
  /** Date range filter */
  dateRange?: {
    start: string;
    end: string;
  };
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Sort order for results */
  sort?: SortField;
}

/**
 * Result of a connection test.
 */
export interface ConnectionTestResult {
  /** Whether the connection succeeded */
  ok: boolean;
  /** Error message if the connection failed */
  error?: string;
}

/**
 * Core provider interface that all database providers must implement.
 */
export interface Provider {
  /** Provider name identifier */
  readonly name: ProviderName;

  /**
   * Execute search and return results as async iterable (streaming).
   */
  search(
    query: TranslatedQuery,
    options?: SearchOptions
  ): AsyncIterable<Article>;

  /**
   * Get total hit count for a query without downloading results.
   * Used for count-only mode during query refinement.
   */
  count(query: TranslatedQuery): Promise<number>;

  /**
   * Convert ResolvedAST to database-native syntax.
   */
  translateQuery(resolved: ResolvedAST): TranslatedQuery;

  /**
   * Verify API access and credentials.
   * Returns { ok: true } on success, { ok: false, error: string } on failure.
   * Does not throw.
   */
  testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Error codes used by providers.
 */
export type ProviderErrorCode =
  | 'PROVIDER_NOT_AVAILABLE'
  | 'API_KEY_MISSING'
  | 'API_KEY_INVALID'
  | 'ACCESS_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'QUERY_ERROR'
  | 'SERVER_ERROR'
  | 'TIMEOUT';

/**
 * Base error type for provider errors.
 */
export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  provider: ProviderName;
  retryable: boolean;
  cause?: unknown;
}

/**
 * Rate limit exceeded error with retry information.
 */
export interface RateLimitError extends ProviderError {
  code: 'RATE_LIMIT_EXCEEDED';
  /** Time to wait before retrying (in milliseconds) */
  retryAfter?: number;
}

/**
 * Authentication/authorization error.
 */
export interface AuthError extends ProviderError {
  code: 'API_KEY_MISSING' | 'API_KEY_INVALID' | 'ACCESS_DENIED';
}

/**
 * Create a provider error.
 */
export function createProviderError(
  code: ProviderErrorCode,
  message: string,
  provider: ProviderName,
  options?: { retryable?: boolean; cause?: unknown }
): ProviderError {
  return {
    code,
    message,
    provider,
    retryable: options?.retryable ?? false,
    cause: options?.cause,
  };
}

/**
 * Check if an error is a provider error.
 */
export function isProviderError(error: unknown): error is ProviderError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const e = error as Record<string, unknown>;
  return (
    typeof e['code'] === 'string' &&
    typeof e['message'] === 'string' &&
    typeof e['provider'] === 'string' &&
    typeof e['retryable'] === 'boolean'
  );
}

/**
 * Check if an error is a rate limit error.
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return isProviderError(error) && error.code === 'RATE_LIMIT_EXCEEDED';
}

/**
 * Check if an error is an auth error.
 */
export function isAuthError(error: unknown): error is AuthError {
  return (
    isProviderError(error) &&
    (error.code === 'API_KEY_MISSING' || error.code === 'API_KEY_INVALID' || error.code === 'ACCESS_DENIED')
  );
}

/**
 * Represents the current state of a search for session persistence.
 * Used to resume searches after interruption or application restart.
 */
export interface SearchState {
  /** Provider that produced this state */
  provider: ProviderName;
  /** The query being executed */
  query: TranslatedQuery;
  /** Total number of results available */
  totalResults: number;
  /** Number of results retrieved so far */
  retrievedCount: number;
  /** When the state was last updated */
  lastUpdated: Date;
  /** Provider-specific state (e.g., PubMed webenv/querykey, or offset for other providers) */
  providerState?: unknown;
}

/**
 * Result of validating a search state for resume.
 */
export interface SearchResumeResult {
  /** Whether the state is valid for resuming */
  valid: boolean;
  /** Reason if the state is invalid */
  reason?: string;
}
