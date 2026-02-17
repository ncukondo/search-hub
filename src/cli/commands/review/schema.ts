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
    reviewer: z.string().describe("Reviewer identifier (e.g., 'gpt-4o', 'claude-sonnet', 'human:tanaka')"),
    decision: reviewDecisionSchema.describe('Assessment decision').optional(),
    basis: reviewBasisSchema.describe('Basis of the decision (what information was used)').optional(),
    comment: z.string().describe('Optional comment or reason').optional(),
    timestamp: z.string().datetime().describe('ISO 8601 timestamp').optional(),
  })
  .strict()
  .describe('Individual assessment of an article');

export const mergedSourceSchema = z
  .object({
    source: z.string().describe("Database source (e.g., 'pubmed', 'scopus')"),
    pmid: z.string().optional(),
    doi: z.string().optional(),
    scopusId: z.string().optional(),
    arxivId: z.string().optional(),
    ericId: z.string().optional(),
  })
  .strict()
  .describe('Source information for merged duplicates');

export const articleFulltextRefSchema = z
  .object({
    dirName: z.string(),
    hasFiles: z
      .object({
        pdf: z.boolean(),
        xml: z.boolean(),
        html: z.boolean(),
        markdown: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const articleEntrySchema = z
  .object({
    // Identifiers
    doi: z.string().describe('Digital Object Identifier').optional(),
    pmid: z.string().describe('PubMed ID').optional(),
    scopusId: z.string().describe('Scopus ID').optional(),
    arxivId: z.string().describe('arXiv ID').optional(),
    ericId: z.string().describe('ERIC ID').optional(),
    // Bibliographic info
    title: z.string().describe('Article title'),
    authors: z.string().describe('Authors (formatted string)').optional(),
    year: z.string().describe('Publication year').optional(),
    abstract: z.string().describe('Article abstract').optional(),
    // Deduplication tracking
    mergedFrom: z.array(mergedSourceSchema).describe('Sources this article was merged from during deduplication').optional(),
    // Review data
    reviews: z.array(reviewSchema).describe('List of assessments'),
    reviewHistory: z.array(reviewSchema).describe('Historical reviews (only in extracted ReviewFiles, never in master file)').optional(),
    finalDecision: z
      .union([z.literal('include'), z.literal('exclude'), z.null()])
      .describe('Final inclusion/exclusion decision (null in extracted files)')
      .optional(),
    // Fulltext reference
    fulltext: articleFulltextRefSchema.optional(),
  })
  .strict()
  .describe('Article with identifiers, bibliographic info, and reviews');

export const reviewerRecordSchema = z
  .object({
    name: z.string().describe('Reviewer identifier'),
    basis: reviewBasisSchema.describe('Basis level at which the reviewer participated'),
  })
  .strict()
  .describe('Record of a reviewer\'s participation at a specific basis level');

export const reviewModeSchema = z.enum(['screening', 'picking']);

export const reviewFileSchema = z
  .object({
    sessionId: z.string().describe('Session identifier'),
    mode: reviewModeSchema.describe('Review mode: screening (exclusion-based) or picking (inclusion-based)').optional(),
    criteria: z.string().describe('Path to inclusion criteria file').optional(),
    reviewer: z.string().describe('Reviewer identifier (only in extracted ReviewFiles)').optional(),
    basis: reviewBasisSchema.describe('Basis level for screening (only in extracted ReviewFiles)').optional(),
    articles: z.array(articleEntrySchema).describe('List of articles with review data'),
    reviewers: z.array(reviewerRecordSchema).describe('Registry of reviewers who participated at each basis level').optional(),
  })
  .strict()
  .describe('Schema for article review workflow tracking');

/** Generate a JSON Schema from the review file Zod schema. */
export function generateReviewJSONSchema(): Record<string, unknown> {
  return z.toJSONSchema(reviewFileSchema, {
    target: 'draft-7',
  });
}
