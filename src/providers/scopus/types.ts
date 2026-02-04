/**
 * Scopus-specific types for the search-hub CLI tool.
 */

import type { Article, Author } from '../base/types';
import type { BaseProviderConfig } from '../base/provider';

/**
 * Scopus author with Scopus-specific author ID.
 */
export interface ScopusAuthor extends Author {
  /** Scopus author ID */
  authid?: string | undefined;
}

/**
 * Scopus document extending the base Article type.
 * Includes Scopus-specific fields like citation count.
 */
export interface ScopusDocument extends Article {
  /** Scopus authors with author IDs */
  authors: ScopusAuthor[];

  /** Scopus ID (format: SCOPUS_ID:nnnnnnnn) */
  scopusId: string;

  /** Citation count */
  citedByCount?: number | undefined;

  /** Scopus EID (Electronic Identifier) */
  eid?: string | undefined;

  /** Source type (journal, conference, etc.) */
  sourceType?: string | undefined;
}

/**
 * Raw entry from Scopus API response.
 */
export interface ScopusRawEntry {
  'dc:identifier'?: string;
  'dc:title'?: string;
  'dc:creator'?: string;
  'dc:description'?: string;
  'prism:doi'?: string;
  'prism:coverDate'?: string;
  'prism:publicationName'?: string;
  'prism:volume'?: string;
  'prism:issueIdentifier'?: string;
  'prism:pageRange'?: string;
  'citedby-count'?: string;
  eid?: string;
  subtypeDescription?: string;
  author?: Array<{
    authname?: string;
    authid?: string;
    'afid'?: Array<{ $?: string }>;
  }>;
}

/**
 * Scopus API search response structure.
 */
export interface ScopusSearchResponse {
  /** Total number of results */
  totalResults: number;

  /** Current start index (0-based) */
  startIndex: number;

  /** Number of items per page */
  itemsPerPage: number;

  /** Array of result entries */
  entries: ScopusRawEntry[];

  /** Warning message if parse failed or had issues */
  parseWarning?: string | undefined;
}

/**
 * Configuration for Scopus provider.
 */
export interface ScopusConfig extends BaseProviderConfig {
  /** Scopus API key (required) */
  apiKey: string;

  /** Institutional token (optional, for higher limits) */
  instToken?: string;

  /** Maximum results per search */
  maxResults?: number;
}

/**
 * Scopus provider state for session resume.
 */
export interface ScopusProviderState {
  /** Current offset in the search results */
  offset: number;

  /** Total results count from the search */
  totalResults: number;

  /** The native query string */
  query: string;
}
