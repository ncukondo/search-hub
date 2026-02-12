/**
 * Query Schema Validation using Zod
 *
 * Validates query YAML structure against the query DSL schema.
 * See spec/models/query-dsl.md for the full specification.
 */

import { z } from 'zod';
import type { QueryAST } from './types.js';

/**
 * Schema for field types.
 */
export const fieldTypeSchema = z.enum([
  'title',
  'abstract',
  'title_abstract',
  'author',
  'keyword',
  'all',
]);

/**
 * Schema for term block containing search terms.
 */
export const termBlockSchema = z.object({
  keywords: z.array(z.string()).min(1).optional(),
  mesh: z.array(z.string()).optional(),
  emtree: z.array(z.string()).optional(),
  eric: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
}).refine(
  (data) => data.keywords?.length || data.mesh?.length || data.emtree?.length || data.eric?.length,
  { message: 'At least one of keywords, mesh, emtree, or eric is required' }
);

/**
 * Schema for operator.
 */
export const operatorSchema = z.enum(['AND', 'OR']);

/**
 * Schema for query block (with required id).
 */
export const queryBlockSchema = z.object({
  id: z.string().min(1),
  field: fieldTypeSchema,
  terms: termBlockSchema,
  operator: operatorSchema,
});

/**
 * Schema for publication type filter.
 */
export const publicationTypeFilterSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/**
 * Schema for filters (YAML input format with snake_case).
 * Transforms to camelCase for internal use.
 */
export const filtersSchema = z
  .object({
    year_from: z.number().int().optional(),
    year_to: z.number().int().optional(),
    language: z.array(z.string()).optional(),
    publication_types: publicationTypeFilterSchema.optional(),
    categories: z.array(z.string()).optional(),
    source_types: z.array(z.string()).optional(),
  })
  .optional()
  .default({})
  .transform((data) => ({
    yearFrom: data.year_from,
    yearTo: data.year_to,
    languages: data.language,
    publicationTypes: data.publication_types,
    categories: data.categories,
    sourceTypes: data.source_types,
  }));

/**
 * Provider names schema.
 */
export const providerNameSchema = z.enum([
  'pubmed',
  'scopus',
  'eric',
  'arxiv',
  'wos',
  'embase',
]);

/**
 * Schema for a block replacement (QueryBlock without id).
 */
const blockReplacementSchema = z.object({
  field: fieldTypeSchema,
  terms: termBlockSchema,
  operator: operatorSchema,
});

/**
 * Schema for partial filters in adds section (YAML snake_case → camelCase).
 */
const addsFiltersSchema = z
  .object({
    year_from: z.number().int().optional(),
    year_to: z.number().int().optional(),
    language: z.array(z.string()).optional(),
    publication_types: publicationTypeFilterSchema.optional(),
    categories: z.array(z.string()).optional(),
    source_types: z.array(z.string()).optional(),
  })
  .transform((data) => ({
    yearFrom: data.year_from,
    yearTo: data.year_to,
    languages: data.language,
    publicationTypes: data.publication_types,
    categories: data.categories,
    sourceTypes: data.source_types,
  }));

/**
 * Schema for provider section with replaces and adds.
 */
export const providerSectionSchema = z.object({
  replaces: z.record(z.string(), blockReplacementSchema).optional(),
  adds: z.object({
    filters: addsFiltersSchema.optional(),
  }).optional(),
});

/**
 * Schema for providers object (partial record of provider -> section).
 */
const providersSchema = z
  .object({
    pubmed: providerSectionSchema.optional(),
    scopus: providerSectionSchema.optional(),
    eric: providerSectionSchema.optional(),
    arxiv: providerSectionSchema.optional(),
    wos: providerSectionSchema.optional(),
    embase: providerSectionSchema.optional(),
  })
  .optional()
  .default({});

/**
 * Schema for the complete query file (YAML input format).
 * Transforms to QueryAST for internal use.
 */
export const queryFileSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    query: z.array(queryBlockSchema).min(1),
    filters: filtersSchema,
    providers: providersSchema,
  })
  .refine(
    (data) => {
      // Cross-validation: replaces keys must reference existing block ids
      const blockIds = new Set(data.query.map((b) => b.id));
      for (const [, section] of Object.entries(data.providers ?? {})) {
        if (section?.replaces) {
          for (const key of Object.keys(section.replaces)) {
            if (!blockIds.has(key)) {
              return false;
            }
          }
        }
      }
      return true;
    },
    { message: 'replaces keys must reference existing block ids' }
  )
  .transform((data) => ({
    name: data.name,
    description: data.description,
    blocks: data.query,
    filters: data.filters,
    providers: data.providers,
  }));

/**
 * Validate a parsed YAML object against the query schema.
 * Returns a validated QueryAST.
 */
export function validateQueryFile(data: unknown): QueryAST {
  return queryFileSchema.parse(data);
}

/**
 * Validation error with path information.
 */
export class ValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Format Zod validation errors into an array of ValidationError objects.
 *
 * @param data - The data to validate
 * @returns Array of ValidationError objects (empty if valid)
 */
export function formatValidationErrors(data: unknown): ValidationError[] {
  const result = queryFileSchema.safeParse(data);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return new ValidationError(path, issue.message);
  });
}
