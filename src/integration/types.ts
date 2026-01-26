/**
 * Integration types for reference-manager integration.
 * These types define the data structures for registration records
 * and ref CLI command output.
 */

import { z } from 'zod';

/**
 * Schema for items added by ref add command.
 * Note: uuid field was added in reference-manager v0.16.x
 */
const RefAddedItemSchema = z.object({
  source: z.string(),
  id: z.string(),
  title: z.string(),
  uuid: z.string().optional(),
});

/**
 * Schema for items skipped (duplicates) by ref add command.
 * Note: reason field was added in reference-manager v0.16.x
 */
const RefSkippedItemSchema = z.object({
  source: z.string(),
  existingId: z.string(),
  duplicateType: z.string(),
  reason: z.string().optional(),
});

/**
 * Schema for items that failed during ref add command.
 */
const RefFailedItemSchema = z.object({
  source: z.string(),
  reason: z.string(),
  error: z.string().optional(),
});

/**
 * Schema for ref add -o json output.
 * This validates the JSON output from the reference-manager CLI.
 */
export const RefAddOutputSchema = z.object({
  summary: z.object({
    total: z.number(),
    added: z.number(),
    skipped: z.number(),
    failed: z.number(),
  }),
  added: z.array(RefAddedItemSchema),
  skipped: z.array(RefSkippedItemSchema),
  failed: z.array(RefFailedItemSchema),
});

export type RefAddOutput = z.infer<typeof RefAddOutputSchema>;

/**
 * Schema for registration record summary.
 */
const RegistrationSummarySchema = z.object({
  total: z.number(),
  added: z.number(),
  skipped: z.number(),
  failed: z.number(),
  noId: z.number(),
});

/**
 * Schema for added items in registration record.
 */
const RegistrationAddedItemSchema = z.object({
  source: z.string(),
  id: z.string(),
  title: z.string(),
});

/**
 * Schema for duplicate items in registration record.
 */
const RegistrationDuplicateItemSchema = z.object({
  source: z.string(),
  existingId: z.string(),
  duplicateType: z.string(),
});

/**
 * Schema for failed items in registration record.
 */
const RegistrationFailedItemSchema = z.object({
  source: z.string(),
  reason: z.string(),
  error: z.string().optional(),
});

/**
 * Schema for registration record.
 * This represents the result of registering search results with reference-manager.
 */
export const RegistrationRecordSchema = z.object({
  sessionId: z.string().min(1),
  timestamp: z.string().datetime(),
  summary: RegistrationSummarySchema,
  added: z.array(RegistrationAddedItemSchema),
  duplicates: z.array(RegistrationDuplicateItemSchema),
  failed: z.array(RegistrationFailedItemSchema),
});

export type RegistrationRecord = z.infer<typeof RegistrationRecordSchema>;
