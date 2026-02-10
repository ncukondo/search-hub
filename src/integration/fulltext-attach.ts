/**
 * Fulltext attach logic for reference-manager integration.
 * Attaches fulltext files (PDF, Markdown) from session fulltext directories
 * to corresponding entries in the reference-manager library.
 */

import { join } from 'node:path';
import type { FulltextAttachResult } from './types.js';
import { refFulltextAttach, type RefCliOptions } from './ref-cli.js';
import { processFulltextEntries } from './attach-shared.js';

/**
 * Options for attachFulltexts function.
 */
export interface AttachFulltextsOptions {
  /** Path to the session directory */
  sessionDir: string;
  /** Path to the reference library file */
  libraryPath: string;
  /** List of refs that were added/exist in the library, with source identifiers */
  addedRefs: Array<{ id: string; source: string }>;
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Extract DOI from a source string.
 * Sources look like "10.1234/test" (bare DOI) or "doi:10.1234/test".
 */
function extractDoi(source: string): string | undefined {
  if (source.startsWith('10.')) return source;
  if (source.startsWith('doi:')) return source.slice(4);
  return undefined;
}

/**
 * Extract PMID from a source string.
 * Sources look like "pmid:12345678".
 */
function extractPmid(source: string): string | undefined {
  if (source.startsWith('pmid:')) return source.slice(5);
  return undefined;
}

/**
 * Build a lookup map from identifiers to ref IDs.
 * Keys are normalized: "doi:10.1234/test" and "pmid:12345678".
 */
function buildRefLookup(addedRefs: Array<{ id: string; source: string }>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const ref of addedRefs) {
    const doi = extractDoi(ref.source);
    if (doi) {
      lookup.set(`doi:${doi}`, ref.id);
    }
    const pmid = extractPmid(ref.source);
    if (pmid) {
      lookup.set(`pmid:${pmid}`, ref.id);
    }
  }
  return lookup;
}

/**
 * Attach fulltext files from session fulltext directories to reference-manager entries.
 *
 * For each article directory in sessionDir/fulltext/:
 * 1. Load meta.json to get identifiers
 * 2. Match to a ref entry by DOI or PMID
 * 3. Attach available fulltext files (PDF, Markdown)
 * 4. Record results
 */
export async function attachFulltexts(
  options: AttachFulltextsOptions,
): Promise<FulltextAttachResult> {
  const { sessionDir, libraryPath, addedRefs, onProgress } = options;
  const fulltextDir = join(sessionDir, 'fulltext');
  const refCliOptions: RefCliOptions = { libraryPath };
  const refLookup = buildRefLookup(addedRefs);

  return processFulltextEntries({
    fulltextDir,
    refLookup,
    attachFile: (refId, filePath) => refFulltextAttach(refId, filePath, refCliOptions),
    ...(onProgress ? { onProgress } : {}),
  });
}
