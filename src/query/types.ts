/**
 * Query DSL Type Definitions
 *
 * These types define the internal AST representation of parsed query files.
 * See spec/models/query-dsl.md for the full specification.
 */

// Import and re-export ProviderName from the authoritative source
import type { ProviderName } from '../providers/base/types.js';
export type { ProviderName };

/**
 * Field types for query targeting.
 * Maps to database-specific field syntax in each provider.
 */
export type FieldType =
  | 'title'
  | 'abstract'
  | 'title_abstract'
  | 'author'
  | 'keyword'
  | 'all';

/**
 * Operator for combining terms within a block.
 */
export type Operator = 'AND' | 'OR';

/**
 * Term block containing search terms.
 * Terms are grouped by vocabulary type and OR'd within groups.
 */
export interface TermBlock {
  /** Free-text keywords (supported by all databases) */
  keywords: string[];
  /** MeSH terms (PubMed only) */
  mesh?: string[] | undefined;
  /** Emtree terms (Embase only) */
  emtree?: string[] | undefined;
  /** Terms to exclude from search results (NOT operator) */
  exclude?: string[] | undefined;
}

/**
 * A single query block targeting a specific field.
 */
export interface QueryBlock {
  /** Target field for the search */
  field: FieldType;
  /** Search terms */
  terms: TermBlock;
  /** How to combine terms within this block */
  operator: Operator;
}

/**
 * Publication type filter with include/exclude lists.
 */
export interface PublicationTypeFilter {
  /** Publication types to include */
  include?: string[] | undefined;
  /** Publication types to exclude */
  exclude?: string[] | undefined;
}

/**
 * Global filters applied to all databases.
 */
export interface Filters {
  /** Start year for date range filter */
  yearFrom?: number | undefined;
  /** End year for date range filter */
  yearTo?: number | undefined;
  /** Language codes (e.g., 'en', 'ja') */
  languages?: string[] | undefined;
  /** Publication type filters */
  publicationTypes?: PublicationTypeFilter | undefined;
}

/**
 * Database-specific override block.
 * Allows customization of filters and database-specific options.
 */
export interface OverrideBlock {
  /** Override global filters for this provider */
  filters?: Filters | undefined;
  /** arXiv categories (arXiv only) */
  categories?: string[] | undefined;
  /** Source types (Scopus only) */
  sourceTypes?: string[] | undefined;
}

/**
 * Complete Query Abstract Syntax Tree.
 * Internal representation of a parsed query file.
 */
export interface QueryAST {
  /** Query identifier */
  name: string;
  /** Human-readable description */
  description?: string | undefined;
  /** List of query blocks (AND'd together) */
  blocks: QueryBlock[];
  /** Global filters */
  filters: Filters;
  /** Provider-specific overrides */
  overrides: Partial<Record<ProviderName, OverrideBlock | undefined>>;
}
