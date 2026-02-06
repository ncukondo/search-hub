/**
 * Fulltext attach logic for reference-manager integration.
 * Attaches fulltext files (PDF, Markdown) from session fulltext directories
 * to corresponding entries in the reference-manager library.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FulltextMeta } from '../fulltext/types.js';
import type { FulltextAttachResult } from './types.js';
import { refFulltextAttach, type RefCliOptions } from './ref-cli.js';

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

/** Files we try to attach, in order. */
const ATTACHABLE_FILES = ['fulltext.pdf', 'fulltext.md'] as const;

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
 * Find the ref ID matching a fulltext meta entry.
 * Tries DOI first, then PMID.
 */
function findRefId(meta: FulltextMeta, refLookup: Map<string, string>): string | undefined {
  if (meta.doi) {
    const byDoi = refLookup.get(`doi:${meta.doi}`);
    if (byDoi) return byDoi;
  }
  if (meta.pmid) {
    const byPmid = refLookup.get(`pmid:${meta.pmid}`);
    if (byPmid) return byPmid;
  }
  return undefined;
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

  const result: FulltextAttachResult = {
    summary: { total: 0, attached: 0, skipped: 0, failed: 0 },
    attached: [],
    skipped: [],
    failed: [],
  };

  // Read fulltext directory entries
  let entries: string[];
  try {
    const dirEntries = await readdir(fulltextDir, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    // No fulltext directory — nothing to attach
    return result;
  }

  result.summary.total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const dirName = entries[i]!;
    const articleDir = join(fulltextDir, dirName);

    if (onProgress) {
      onProgress(i + 1, entries.length);
    }

    // Load meta.json
    let meta: FulltextMeta;
    try {
      const raw = await readFile(join(articleDir, 'meta.json'), 'utf-8');
      meta = JSON.parse(raw) as FulltextMeta;
    } catch {
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

    // Determine which files to attach
    const filesToAttach: string[] = [];
    for (const filename of ATTACHABLE_FILES) {
      const fileKey = filename === 'fulltext.pdf' ? 'pdf' : 'markdown';
      if (meta.files[fileKey]) {
        filesToAttach.push(filename);
      }
    }

    if (filesToAttach.length === 0) {
      result.summary.skipped++;
      result.skipped.push({ dirName, reason: 'no_files' });
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
