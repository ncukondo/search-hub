/**
 * arXiv Provider Types
 *
 * Types for interacting with the arXiv API.
 * arXiv hosts preprints in physics, mathematics, computer science,
 * quantitative biology, and related fields.
 */

import type { Article } from '../base/types.js';
import type { BaseProviderConfig } from '../base/provider.js';

/**
 * arXiv category taxonomy.
 * Format: archive.subject (e.g., cs.AI, physics.gen-ph)
 */
export type ArxivCategory = string;

/**
 * Version information for an arXiv paper.
 */
export interface ArxivVersion {
  version: string;
  submitted: string;
}

/**
 * arXiv paper extending the base Article type.
 * Includes arXiv-specific fields like categories and versions.
 */
export interface ArxivPaper extends Article {
  /** arXiv identifier (e.g., 2401.12345) - required for arXiv papers */
  arxivId: string;

  /** arXiv source identifier */
  source: 'arxiv';

  /** List of arXiv categories */
  categories: ArxivCategory[];

  /** Primary arXiv category */
  primaryCategory: ArxivCategory;

  /** Version history (optional) */
  versions?: ArxivVersion[];
}

/**
 * Response from arXiv API search.
 * Parsed from Atom XML feed.
 */
export interface ArxivSearchResponse {
  /** Total number of results matching the query */
  totalResults: number;

  /** Starting index of current page (0-based) */
  startIndex: number;

  /** Number of items per page */
  itemsPerPage: number;

  /** List of papers in current page */
  entries: ArxivPaper[];
}

/**
 * Configuration for arXiv provider.
 */
export interface ArxivConfig extends BaseProviderConfig {
  /** arXiv API base URL */
  baseUrl?: string;

  /** Maximum results to fetch (arXiv recommends max 2000 per request) */
  maxResults?: number;
}

/**
 * Default arXiv configuration values.
 */
export const DEFAULT_ARXIV_CONFIG: Required<ArxivConfig> = {
  baseUrl: 'http://export.arxiv.org/api/query',
  rateLimit: 0.33, // 1 request per 3 seconds (strictly enforced by arXiv)
  timeout: 60000, // arXiv can be slow
  retries: 3,
  maxResults: 10000,
  initialBackoff: 1000,
  maxBackoff: 30000,
};

/**
 * Provider-specific state for session resume.
 * arXiv uses offset-based pagination, so we only need to track the offset.
 */
export interface ArxivProviderState {
  /** Current pagination offset (0-based) */
  offset: number;
}
