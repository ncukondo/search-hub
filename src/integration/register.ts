/**
 * Registration logic for reference-manager integration.
 * Handles registering articles with the ref CLI.
 */

import * as path from 'node:path';
import type { Article } from '../providers/base/types.js';
import type { RegistrationRecord } from './types.js';
import { refAdd } from './ref-cli.js';

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
export async function registerArticles(
  articles: Article[],
  options: RegisterOptions
): Promise<RegistrationRecord> {
  const { sessionId, sessionDir, onProgress } = options;
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
      const output = await refAdd(id, {
        env: { REFERENCE_MANAGER_LIBRARY: libraryPath },
      });

      // Aggregate results
      record.summary.added += output.summary.added;
      record.summary.skipped += output.summary.skipped;
      record.summary.failed += output.summary.failed;

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

      // Record failures from ref output
      for (const item of output.failed) {
        record.failed.push({
          source: item.source,
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
