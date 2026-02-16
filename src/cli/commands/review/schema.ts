/**
 * Zod schemas for review workflow types.
 *
 * Single source of truth for:
 * - TypeScript types (via z.infer<>)
 * - JSON Schema for IDE autocompletion (via z.toJSONSchema())
 *
 * Follows the pattern established in src/query/json-schema.ts.
 */
import * as z from 'zod';

export const reviewDecisionSchema = z.enum(['include', 'exclude', 'uncertain']);

export const reviewBasisSchema = z.enum(['title', 'abstract', 'fulltext']);

export const reviewSchema = z
  .object({
    reviewer: z.string(),
    decision: reviewDecisionSchema.optional(),
    basis: reviewBasisSchema.optional(),
    comment: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .strict();

export const mergedSourceSchema = z
  .object({
    source: z.string(),
    pmid: z.string().optional(),
    doi: z.string().optional(),
    scopusId: z.string().optional(),
    arxivId: z.string().optional(),
    ericId: z.string().optional(),
  })
  .strict();

export const articleFulltextRefSchema = z
  .object({
    dirName: z.string(),
    hasFiles: z.object({
      pdf: z.boolean(),
      xml: z.boolean(),
      html: z.boolean(),
      markdown: z.boolean(),
    }),
  })
  .strict();

export const articleEntrySchema = z
  .object({
    // Identifiers
    doi: z.string().optional(),
    pmid: z.string().optional(),
    scopusId: z.string().optional(),
    arxivId: z.string().optional(),
    ericId: z.string().optional(),
    // Bibliographic info
    title: z.string(),
    authors: z.string().optional(),
    year: z.string().optional(),
    abstract: z.string().optional(),
    // Deduplication tracking
    mergedFrom: z.array(mergedSourceSchema).optional(),
    // Review data
    reviews: z.array(reviewSchema),
    reviewHistory: z.array(reviewSchema).optional(),
    finalDecision: z
      .union([z.literal('include'), z.literal('exclude'), z.null()])
      .optional(),
    // Fulltext reference
    fulltext: articleFulltextRefSchema.optional(),
  })
  .strict();

export const reviewerRecordSchema = z
  .object({
    name: z.string(),
    basis: reviewBasisSchema,
  })
  .strict();

export const reviewFileSchema = z
  .object({
    sessionId: z.string(),
    criteria: z.string().optional(),
    reviewer: z.string().optional(),
    basis: reviewBasisSchema.optional(),
    articles: z.array(articleEntrySchema),
    reviewers: z.array(reviewerRecordSchema).optional(),
  })
  .strict();

/** Generate a JSON Schema from the review file Zod schema. */
export function generateReviewJSONSchema(): Record<string, unknown> {
  return z.toJSONSchema(reviewFileSchema, {
    target: 'draft-7',
  });
}
