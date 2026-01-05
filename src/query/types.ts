/**
 * Query DSL Type Definitions
 *
 * These types define the internal AST representation of parsed query files.
 * See spec/models/query-dsl.md for the full specification.
 */

/**
 * Supported database provider names.
 */
export type ProviderName = 'pubmed' | 'scopus' | 'eric' | 'arxiv' | 'wos' | 'embase';

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
  mesh?: string[];
  /** Emtree terms (Embase only) */
  emtree?: string[];
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
  include?: string[];
  /** Publication types to exclude */
  exclude?: string[];
}

/**
 * Global filters applied to all databases.
 */
export interface Filters {
  /** Start year for date range filter */
  yearFrom?: number;
  /** End year for date range filter */
  yearTo?: number;
  /** Language codes (e.g., 'en', 'ja') */
  languages?: string[];
  /** Publication type filters */
  publicationTypes?: PublicationTypeFilter;
}

/**
 * Database-specific override block.
 * Allows customization of filters and database-specific options.
 */
export interface OverrideBlock {
  /** Override global filters for this provider */
  filters?: Filters;
  /** arXiv categories (arXiv only) */
  categories?: string[];
  /** Source types (Scopus only) */
  sourceTypes?: string[];
}

/**
 * Complete Query Abstract Syntax Tree.
 * Internal representation of a parsed query file.
 */
export interface QueryAST {
  /** Query identifier */
  name: string;
  /** Human-readable description */
  description?: string;
  /** List of query blocks (AND'd together) */
  blocks: QueryBlock[];
  /** Global filters */
  filters: Filters;
  /** Provider-specific overrides */
  overrides: Partial<Record<ProviderName, OverrideBlock>>;
}
