/**
 * Shared fulltext attach utilities.
 * Used by both the integration attach (register flow) and standalone attach command.
 */

import { readdir, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { FulltextMeta } from './types.js';

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
  meta: FulltextMeta;
}

/** Result for a single article's attach attempt. */
export interface AttachAttemptResult {
  status: 'attached' | 'skipped' | 'failed';
  refId?: string;
  files?: string[];
  dirName: string;
  reason?: string;
  error?: string;
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
      entries.push({ dirName, articleDir, meta: null as unknown as FulltextMeta });
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
