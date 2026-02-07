/**
 * Registration logic for reference-manager integration.
 * Uses bulk CSL-JSON import for performance.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Article } from '../providers/base/types.js';
import { RegistrationRecordSchema, type RegistrationRecord } from './types.js';
import { refAddBulk } from './ref-cli.js';
import { articlesToCslJson } from './csl-json.js';
import { attachFulltexts } from './fulltext-attach.js';

const REGISTRATION_FILE = 'registration.json';
const BULK_IMPORT_FILE = '_bulk_import.json';

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
  /** Skip fulltext attach step */
  noAttachFulltext?: boolean;
  onProgress?: (current: number, total: number) => void;
  onAttachProgress?: (current: number, total: number) => void;
}

/**
 * Check if an article has an identifier suitable for registration.
 * Articles without DOI or PMID are included in CSL-JSON via metadata,
 * but we track them separately for the noId count.
 */
function hasIdentifier(article: Article): boolean {
  return !!(article.pmid || article.doi);
}

/**
 * Register articles with reference-manager using bulk CSL-JSON import.
 *
 * Flow:
 * 1. Filter out articles without identifiers (noId)
 * 2. Convert remaining articles to CSL-JSON array
 * 3. Write to temporary file in sessionDir
 * 4. Call refAddBulk() once
 * 5. Map output to RegistrationRecord
 * 6. Clean up temporary file
 */
export async function registerArticles(
  articles: Article[],
  options: RegisterOptions
): Promise<RegistrationRecord> {
  const { sessionId, sessionDir, withAbstracts, noAttachFulltext, onProgress, onAttachProgress } = options;
  const libraryPath = path.join(sessionDir, 'references.json');

  if (withAbstracts) {
    console.warn(
      'Note: abstracts are now always included in bulk import. --with-abstracts flag is no longer needed.'
    );
  }

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

  // Separate articles with and without identifiers
  const articlesWithId: Article[] = [];
  for (const article of articles) {
    if (hasIdentifier(article)) {
      articlesWithId.push(article);
    } else {
      record.summary.noId++;
    }
  }

  // Report progress: counting phase
  if (onProgress) {
    onProgress(articlesWithId.length, articles.length);
  }

  // If no articles have identifiers, return early
  if (articlesWithId.length === 0) {
    return record;
  }

  // Convert to CSL-JSON
  const cslJsonItems = articlesToCslJson(articlesWithId);
  const tempFilePath = path.join(sessionDir, BULK_IMPORT_FILE);

  try {
    // Write CSL-JSON to temporary file
    await fs.writeFile(tempFilePath, JSON.stringify(cslJsonItems));

    // Bulk import
    const output = await refAddBulk(tempFilePath, { libraryPath });

    // Aggregate summary
    record.summary.added = output.summary.added;
    record.summary.skipped = output.summary.skipped;
    record.summary.failed = output.summary.failed;

    // Record added items
    for (const item of output.added) {
      record.added.push({
        source: item.source,
        id: item.id,
        title: item.title,
      });
    }

    // Record duplicates
    for (const item of output.skipped) {
      record.duplicates.push({
        source: item.source,
        existingId: item.existingId,
        duplicateType: item.duplicateType,
      });
    }

    // Record failures
    for (const item of output.failed) {
      record.failed.push({
        source: item.source,
        reason: item.reason,
        error: item.error,
      });
    }
  } catch (error) {
    // Handle bulk import execution errors
    record.summary.failed = articlesWithId.length;
    record.failed.push({
      source: 'bulk_import',
      reason: 'execution_error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    // Clean up temporary file
    await fs.unlink(tempFilePath).catch(() => {});
  }

  // Fulltext attach step (after successful import)
  if (!noAttachFulltext) {
    const addedRefs = record.added.map((item) => ({
      id: item.id,
      source: item.source,
    }));
    // Also include duplicates (already in library) — they may need fulltext attachment
    const dupRefs = record.duplicates.map((item) => ({
      id: item.existingId,
      source: item.source,
    }));
    const allRefs = [...addedRefs, ...dupRefs];

    if (allRefs.length > 0) {
      const attachOptions = {
        sessionDir,
        libraryPath,
        addedRefs: allRefs,
        ...(onAttachProgress ? { onProgress: onAttachProgress } : {}),
      };
      const fulltextResult = await attachFulltexts(attachOptions);

      record.fulltext = fulltextResult;
    }
  }

  return record;
}
