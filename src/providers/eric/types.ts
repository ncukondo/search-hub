/**
 * ERIC-specific types for the ERIC provider.
 */

import type { Article } from '../base/types';
import type { BaseProviderConfig } from '../base/provider';

/**
 * ERIC document extending the base Article type.
 * Represents a single result from ERIC database.
 */
export interface ERICDocument extends Article {
  /** ERIC ID (required for ERIC documents) */
  ericId: string;

  /** Source is always 'eric' for ERIC documents */
  source: 'eric';

  /** ERIC Thesaurus descriptors (controlled vocabulary) */
  descriptors?: string[];

  /** Whether the document is peer-reviewed */
  peerReviewed?: boolean;

  /** Publication type (e.g., "Journal Articles", "Reports - Research") */
  publicationType?: string;

  /** ISSN if available */
  issn?: string;

  /** Government document identifier */
  identifiersGov?: string;

  /** Subject terms */
  subject?: string[];
}

/**
 * Raw document from ERIC API response.
 */
export interface ERICRawDocument {
  /** ERIC ID (e.g., "EJ123456" or "ED654321") */
  id: string;

  /** Document title */
  title: string;

  /** Authors in "Last, First" format */
  author?: string[];

  /** Abstract/description */
  description?: string;

  /** Publication year */
  publicationdateyear?: number;

  /** Source/journal name */
  source?: string;

  /** URL to document */
  url?: string;

  /** Publication type */
  publicationtype?: string;

  /** ISSN */
  issn?: string;

  /** Whether peer-reviewed */
  peerreviewed?: boolean;

  /** Government identifiers */
  identifiersgov?: string;

  /** ERIC descriptors */
  subject?: string[];
}

/**
 * ERIC API search response structure.
 */
export interface ERICSearchResponse {
  response: {
    /** Total number of results found */
    numFound: number;

    /** Starting offset of this page */
    start: number;

    /** Array of documents */
    docs: ERICRawDocument[];
  };
}

/**
 * Configuration options for ERIC provider.
 */
export interface ERICConfig extends BaseProviderConfig {
  /** Maximum results per page (ERIC max is 2000) */
  maxResultsPerPage?: number;
}

/**
 * ERIC provider-specific state for session resume.
 * Uses offset-based pagination (no server-side state like PubMed).
 */
export interface ERICProviderState {
  /** Current offset in result set */
  offset: number;

  /** Page size used for the search */
  pageSize: number;
}
