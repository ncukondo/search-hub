/**
 * Standalone fulltext attach command.
 * Attaches fulltext files to existing reference-manager entries.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FulltextAttachResult } from '../../../integration/types.js';
import { refFulltextAttach, refExport, type RefCliOptions } from '../../../integration/ref-cli.js';
import { processFulltextEntries } from '../../../integration/attach-shared.js';

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
    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      console.warn(
        'Warning: Reference library file is not a JSON array. Falling back to ref export.',
      );
      throw new Error('Not an array');
    }

    const entries = parsed as Array<Record<string, unknown>>;
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
      const entries = (await refExport('*', refCliOptions)) as Array<Record<string, unknown>>;
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
      console.warn(
        'Warning: Could not read reference library. All articles will be skipped as "not_in_ref".',
      );
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

  // Build ref lookup from library
  const refLookup = await buildRefLookupFromLibrary(libraryPath, refCliOptions);

  return processFulltextEntries({
    fulltextDir,
    refLookup,
    attachFile: (refId, filePath) => refFulltextAttach(refId, filePath, refCliOptions),
    dryRun,
    ...(onProgress ? { onProgress } : {}),
  });
}
