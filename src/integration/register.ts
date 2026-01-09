/**
 * Registration logic for reference-manager integration.
 * Handles registering articles with the ref CLI.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Article } from '../providers/base/types.js';
import { RegistrationRecordSchema, type RegistrationRecord } from './types.js';
import { refAdd, refExport, refUpdate } from './ref-cli.js';

const REGISTRATION_FILE = 'registration.json';

/**
 * Save registration record to session directory.
 */
export async function saveRegistrationRecord(
  sessionDir: string,
  record: RegistrationRecord
): Promise<void> {
  await fs.mkdir(sessionDir, { recursive: true });
  const filePath = path.join(sessionDir, REGISTRATION_FILE);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2));
}

/**
 * Load registration record from session directory.
 * Returns null if file does not exist.
 * Throws if file exists but is invalid.
 */
export async function loadRegistrationRecord(
  sessionDir: string
): Promise<RegistrationRecord | null> {
  const filePath = path.join(sessionDir, REGISTRATION_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return RegistrationRecordSchema.parse(data);
  } catch (error) {
    // File not found - return null
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    // Parse or validation error - re-throw
    throw error;
  }
}

/**
 * Options for registerArticles function.
 */
export interface RegisterOptions {
  sessionId: string;
  sessionDir: string;
  withAbstracts?: boolean;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Get the identifier to use for registration.
 * PMID is preferred over DOI for better metadata quality from PubMed.
 * Returns null if neither PMID nor DOI is available.
 */
function getRegistrationId(article: Article): string | null {
  if (article.pmid) {
    return `pmid:${article.pmid}`;
  }
  if (article.doi) {
    return article.doi;
  }
  return null;
}

/**
 * Register articles with reference-manager.
 * Processes each article and aggregates results.
 */
/**
 * Check if the ref entry already has an abstract.
 * Returns false if we can't determine (e.g., export fails).
 */
async function hasExistingAbstract(
  refId: string,
  libraryPath: string
): Promise<boolean> {
  try {
    const data = await refExport(refId, { libraryPath }) as { abstract?: string };
    return !!data.abstract;
  } catch {
    // If export fails, assume no abstract so we try to update
    return false;
  }
}

/**
 * Register articles with reference-manager.
 * Processes each article and aggregates results.
 */
export async function registerArticles(
  articles: Article[],
  options: RegisterOptions
): Promise<RegistrationRecord> {
  const { sessionId, sessionDir, withAbstracts, onProgress } = options;
  const libraryPath = path.join(sessionDir, 'references.json');

  const record: RegistrationRecord = {
    sessionId,
    timestamp: new Date().toISOString(),
    summary: {
      total: articles.length,
      added: 0,
      skipped: 0,
      failed: 0,
      noId: 0,
    },
    added: [],
    duplicates: [],
    failed: [],
  };

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]!;
    const id = getRegistrationId(article);

    // Report progress
    if (onProgress) {
      onProgress(i + 1, articles.length);
    }

    // Skip articles without identifiers
    if (!id) {
      record.summary.noId++;
      continue;
    }

    try {
      const output = await refAdd(id, { libraryPath });

      // Aggregate results
      record.summary.added += output.summary.added;
      record.summary.skipped += output.summary.skipped;
      record.summary.failed += output.summary.failed;

      // Record added items and update abstracts if requested
      for (const item of output.added) {
        record.added.push({
          source: id, // Use the identifier we sent to ref CLI
          id: item.id,
          title: item.title,
        });

        // Update abstract if withAbstracts is enabled and article has abstract
        if (withAbstracts && article.abstract) {
          const alreadyHasAbstract = await hasExistingAbstract(item.id, libraryPath);
          if (!alreadyHasAbstract) {
            try {
              await refUpdate(item.id, 'abstract', article.abstract, { libraryPath });
            } catch {
              // Log warning but continue - abstract update failure is non-fatal
            }
          }
        }
      }

      // Record duplicates
      for (const item of output.skipped) {
        record.duplicates.push({
          source: id, // Use the identifier we sent to ref CLI
          existingId: item.existingId,
          duplicateType: item.duplicateType,
        });
      }

      // Record failures from ref output
      for (const item of output.failed) {
        record.failed.push({
          source: id, // Use the identifier we sent to ref CLI
          reason: item.reason,
          error: item.error,
        });
      }
    } catch (error) {
      // Handle execution errors (network, parse errors, etc.)
      record.summary.failed++;
      record.failed.push({
        source: id,
        reason: 'execution_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return record;
}
