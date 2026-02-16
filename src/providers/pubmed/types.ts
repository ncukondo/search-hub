/**
 * PubMed-specific types for the E-utilities API.
 */

import type { Article } from '../base/types';
import type { BaseProviderConfig } from '../base/provider';

/**
 * Extended Article type with PubMed-specific fields.
 */
export interface PubMedArticle extends Article {
  /** PubMed ID (required for PubMed articles) */
  pmid: string;
  /** Source is always 'pubmed' */
  source: 'pubmed';
  /** MeSH terms assigned to the article */
  meshTerms?: string[];
  /** Publication types (e.g., 'Journal Article', 'Review') */
  pubTypes?: string[];
  /** PubMed Central ID */
  pmc?: string;
  /** NLM Unique ID for the journal */
  nlmUniqueId?: string;
  /** Journal ISSN */
  journalIssn?: string;
}

/**
 * Response from the esearch API.
 */
export interface ESearchResponse {
  /** Total number of matching records */
  count: number;
  /** Number of records returned in this response */
  retmax: number;
  /** Starting offset of returned records */
  retstart: number;
  /** List of PMIDs returned */
  idlist: string[];
  /** Web environment for history server (used for large result sets) */
  webenv?: string;
  /** Query key for history server */
  querykey?: string;
  /** Warnings from PubMed (e.g., unrecognized operators, quoted phrases not found) */
  warnings?: string[];
}

/**
 * Response from the efetch API.
 */
export interface EFetchResponse {
  /** Parsed articles from the XML response */
  articles: PubMedArticle[];
}

/**
 * A related article link from ELink with a relevancy score.
 */
export interface ELinkItem {
  id: string;
  score: number;
}

/**
 * Response from the elink API.
 */
export interface ELinkResponse {
  links: ELinkItem[];
}

/**
 * Configuration options for PubMed provider.
 */
export interface PubMedConfig extends BaseProviderConfig {
  /** NCBI API key (optional but recommended for higher rate limits) */
  apiKey?: string;
  /** Email address (required by NCBI policy) */
  email: string;
  /** Maximum number of results to retrieve */
  maxResults?: number;
}

/**
 * PubMed-specific state for session resume.
 * PubMed uses the history server (webenv/querykey) for efficient pagination
 * of large result sets.
 */
export interface PubMedProviderState {
  /** Web environment from esearch (for history server) */
  webenv?: string;
  /** Query key from esearch (for history server) */
  querykey?: string;
  /** Current offset in the result set */
  retstart: number;
  /** Whether the search uses history server */
  useHistory: boolean;
}
