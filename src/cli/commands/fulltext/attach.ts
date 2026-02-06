/**
 * Standalone fulltext attach command.
 * Attaches fulltext files to existing reference-manager entries.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FulltextAttachResult } from '../../../integration/types.js';
import { refFulltextAttach, refExport, type RefCliOptions } from '../../../integration/ref-cli.js';
import { findRefId, loadFulltextEntries, resolveAttachableFiles } from '../../../fulltext/attach-shared.js';

export interface FulltextAttachCommandOptions {
  sessionDir: string;
  dryRun: boolean;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Load the reference library and build a lookup map from identifiers to ref IDs.
 * Returns a map with keys like "doi:10.1234/test" and "pmid:12345678".
 */
async function buildRefLookupFromLibrary(
  libraryPath: string,
  refCliOptions: RefCliOptions,
): Promise<Map<string, string>> {
  const lookup = new Map<string, string>();

  try {
    // Try to read library directly from JSON file
    const content = await readFile(libraryPath, 'utf-8');
    const entries = JSON.parse(content) as Array<Record<string, unknown>>;

    for (const entry of entries) {
      const id = entry['id'] as string;
      if (!id) continue;

      const doi = entry['DOI'];
      if (doi && typeof doi === 'string') {
        lookup.set(`doi:${doi}`, id);
      }
      const pmid = entry['PMID'];
      if (pmid && typeof pmid === 'string') {
        lookup.set(`pmid:${pmid}`, id);
      }
    }
  } catch {
    // If library doesn't exist or can't be read, try ref export
    try {
      const entries = await refExport('*', refCliOptions) as Array<Record<string, unknown>>;
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          const id = entry['id'] as string;
          if (!id) continue;
          const doi = entry['DOI'];
          if (doi && typeof doi === 'string') {
            lookup.set(`doi:${doi}`, id);
          }
          const pmid = entry['PMID'];
          if (pmid && typeof pmid === 'string') {
            lookup.set(`pmid:${pmid}`, id);
          }
        }
      }
    } catch {
      // No library available
    }
  }

  return lookup;
}

/**
 * Execute the standalone fulltext attach command.
 * Reads the session's fulltext directories and attaches files to ref entries.
 */
export async function executeFulltextAttach(
  options: FulltextAttachCommandOptions,
): Promise<FulltextAttachResult> {
  const { sessionDir, dryRun, onProgress } = options;
  const fulltextDir = join(sessionDir, 'fulltext');
  const libraryPath = join(sessionDir, 'references.json');
  const refCliOptions: RefCliOptions = { libraryPath };

  const result: FulltextAttachResult = {
    summary: { total: 0, attached: 0, skipped: 0, failed: 0 },
    attached: [],
    skipped: [],
    failed: [],
  };

  // Build ref lookup from library
  const refLookup = await buildRefLookupFromLibrary(libraryPath, refCliOptions);

  // Load all fulltext entries
  const entries = await loadFulltextEntries(fulltextDir);
  result.summary.total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const { dirName, articleDir, meta } = entry;

    if (onProgress) {
      onProgress(i + 1, entries.length);
    }

    // Handle meta load failure
    if (!meta) {
      result.summary.failed++;
      result.failed.push({
        dirName,
        reason: 'meta_read_error',
        error: 'Failed to read meta.json',
      });
      continue;
    }

    // Find matching ref entry
    const refId = findRefId(meta, refLookup);
    if (!refId) {
      result.summary.skipped++;
      result.skipped.push({ dirName, reason: 'not_in_ref' });
      continue;
    }

    // Determine which files to attach (with disk verification)
    const filesToAttach = await resolveAttachableFiles(articleDir, meta);

    if (filesToAttach.length === 0) {
      result.summary.skipped++;
      result.skipped.push({ dirName, reason: 'no_files' });
      continue;
    }

    if (dryRun) {
      // Dry run: don't actually attach, just record what would be attached
      result.summary.attached++;
      result.attached.push({ refId, files: filesToAttach });
      continue;
    }

    // Attach files
    try {
      for (const filename of filesToAttach) {
        const filePath = join(articleDir, filename);
        await refFulltextAttach(refId, filePath, refCliOptions);
      }
      result.summary.attached++;
      result.attached.push({ refId, files: filesToAttach });
    } catch (error) {
      result.summary.failed++;
      result.failed.push({
        dirName,
        reason: 'attach_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}
