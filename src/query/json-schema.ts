/**
 * JSON Schema generation for query YAML files.
 *
 * Defines an input-only schema (without transforms) that mirrors the structure
 * of queryFileSchema from validator.ts. This is necessary because Zod v4's
 * z.toJSONSchema() cannot handle .transform() calls.
 *
 * The generated JSON Schema enables editor autocompletion and validation
 * via the yaml-language-server $schema comment.
 */
import * as z from 'zod';
import { fieldTypeSchema, operatorSchema, publicationTypeFilterSchema } from './validator.js';

/** Filters input schema (without transform) */
const filtersInputSchema = z
  .object({
    year_from: z.number().int().optional(),
    year_to: z.number().int().optional(),
    language: z.array(z.string()).optional(),
    publication_types: publicationTypeFilterSchema.optional(),
    categories: z.array(z.string()).optional(),
    source_types: z.array(z.string()).optional(),
  })
  .optional();

/** Term block input schema (without refine) */
const termBlockInputSchema = z.object({
  keywords: z.array(z.string()).min(1).optional(),
  mesh: z.array(z.string()).optional(),
  emtree: z.array(z.string()).optional(),
  eric: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/** Query block input schema */
const queryBlockInputSchema = z.object({
  id: z.string().min(1),
  field: fieldTypeSchema,
  terms: termBlockInputSchema,
  operator: operatorSchema,
});

/** Block replacement input schema (without id) */
const blockReplacementInputSchema = z.object({
  field: fieldTypeSchema,
  terms: termBlockInputSchema,
  operator: operatorSchema,
});

/** Provider section input schema */
const providerSectionInputSchema = z
  .object({
    replaces: z.record(z.string(), blockReplacementInputSchema).optional(),
    adds: z
      .object({
        filters: filtersInputSchema,
      })
      .optional(),
  })
  .optional();

/** Query file input schema (without transform) - mirrors queryFileSchema input */
const queryFileInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  query: z.array(queryBlockInputSchema).min(1),
  filters: filtersInputSchema,
  providers: z
    .object({
      pubmed: providerSectionInputSchema,
      scopus: providerSectionInputSchema,
      eric: providerSectionInputSchema,
      arxiv: providerSectionInputSchema,
      wos: providerSectionInputSchema,
      embase: providerSectionInputSchema,
    })
    .optional(),
});

/** Generate a JSON Schema from the query file Zod schema. */
export function generateQueryJSONSchema(): Record<string, unknown> {
  return z.toJSONSchema(queryFileInputSchema, {
    target: 'draft-2020-12',
  });
}
