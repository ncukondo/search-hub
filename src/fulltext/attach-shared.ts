/**
 * Shared fulltext attach utilities.
 * Used by both the integration attach (register flow) and standalone attach command.
 */

import { readdir, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { FulltextMeta } from './types.js';
import type { FulltextAttachResult } from '../integration/types.js';

/** Files we try to attach, in priority order. */
export const ATTACHABLE_FILES = ['fulltext.pdf', 'fulltext.md'] as const;

/**
 * Find the ref ID matching a fulltext meta entry.
 * Tries DOI first, then PMID.
 */
export function findRefId(meta: FulltextMeta, refLookup: Map<string, string>): string | undefined {
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

/** A single article directory entry with its loaded metadata. */
export interface ArticleEntry {
  dirName: string;
  articleDir: string;
  meta: FulltextMeta | null;
}

/**
 * Scan a fulltext directory and load metadata for all article subdirectories.
 * Returns an empty array if the directory doesn't exist.
 */
export async function loadFulltextEntries(fulltextDir: string): Promise<ArticleEntry[]> {
  let dirNames: string[];
  try {
    const dirEntries = await readdir(fulltextDir, { withFileTypes: true });
    dirNames = dirEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const entries: ArticleEntry[] = [];
  for (const dirName of dirNames) {
    const articleDir = join(fulltextDir, dirName);
    try {
      const raw = await readFile(join(articleDir, 'meta.json'), 'utf-8');
      const meta = JSON.parse(raw) as FulltextMeta;
      entries.push({ dirName, articleDir, meta });
    } catch {
      // Will be handled as a failed entry by the caller
      entries.push({ dirName, articleDir, meta: null });
    }
  }
  return entries;
}

/**
 * Determine which attachable files exist for an article, verifying on disk.
 */
export async function resolveAttachableFiles(
  articleDir: string,
  meta: FulltextMeta,
): Promise<string[]> {
  const filesToAttach: string[] = [];
  for (const filename of ATTACHABLE_FILES) {
    const fileKey = filename === 'fulltext.pdf' ? 'pdf' : 'markdown';
    if (meta.files[fileKey]) {
      try {
        await access(join(articleDir, filename), constants.R_OK);
        filesToAttach.push(filename);
      } catch {
        // File recorded in meta but not on disk — skip
      }
    }
  }
  return filesToAttach;
}

/** Options for processFulltextEntries. */
export interface ProcessFulltextEntriesOptions {
  /** Path to the fulltext directory (sessionDir/fulltext) */
  fulltextDir: string;
  /** Lookup map from identifiers to ref IDs */
  refLookup: Map<string, string>;
  /** Function to attach a single file to a ref entry */
  attachFile: (refId: string, filePath: string) => Promise<void>;
  /** If true, skip actual attach calls and just record what would be attached */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Shared attach loop: scan fulltext entries, match to refs, and attach files.
 * Both the standalone and integrated attach commands delegate to this function.
 */
export async function processFulltextEntries(
  options: ProcessFulltextEntriesOptions,
): Promise<FulltextAttachResult> {
  const { fulltextDir, refLookup, attachFile, dryRun = false, onProgress } = options;

  const result: FulltextAttachResult = {
    summary: { total: 0, attached: 0, skipped: 0, failed: 0 },
    attached: [],
    skipped: [],
    failed: [],
  };

  const entries = await loadFulltextEntries(fulltextDir);
  result.summary.total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const { dirName, articleDir, meta } = entry;

    if (onProgress) {
      onProgress(i + 1, entries.length);
    }

    if (!meta) {
      result.summary.failed++;
      result.failed.push({
        dirName,
        reason: 'meta_read_error',
        error: 'Failed to read meta.json',
      });
      continue;
    }

    const refId = findRefId(meta, refLookup);
    if (!refId) {
      result.summary.skipped++;
      result.skipped.push({ dirName, reason: 'not_in_ref' });
      continue;
    }

    const filesToAttach = await resolveAttachableFiles(articleDir, meta);

    if (filesToAttach.length === 0) {
      result.summary.skipped++;
      result.skipped.push({ dirName, reason: 'no_files' });
      continue;
    }

    if (dryRun) {
      result.summary.attached++;
      result.attached.push({ refId, files: filesToAttach });
      continue;
    }

    try {
      for (const filename of filesToAttach) {
        const filePath = join(articleDir, filename);
        await attachFile(refId, filePath);
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
