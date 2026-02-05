/**
 * fulltext sync command - Detect and register manually added files.
 */

import { join } from 'node:path';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile } from '../review/types.js';
import type { FulltextMeta, FulltextIndex, FileInfo } from '../../../fulltext/types.js';
import { loadMeta, saveMeta, updateMetaFiles } from '../../../fulltext/meta.js';
import { loadIndex, saveIndex, updateEntry } from '../../../fulltext/index-manager.js';
import { getFulltextDir, getIndexPath } from '../../../fulltext/paths.js';

/** Known fulltext filenames and their type keys. */
const FULLTEXT_FILES: Record<string, 'pdf' | 'xml' | 'markdown'> = {
  'fulltext.pdf': 'pdf',
  'fulltext.xml': 'xml',
  'fulltext.md': 'markdown',
};

export interface FulltextSyncOptions {
  sessionId: string;
  sessionsDir: string;
  dryRun?: boolean;
}

export interface FulltextSyncEntry {
  dirName: string;
  files: string[];
  sizes: number[];
}

export interface FulltextSyncResult {
  /** Total number of new files synced */
  synced: number;
  /** Number of articles updated */
  articlesUpdated: number;
  entries: FulltextSyncEntry[];
  dryRun?: boolean;
}

export async function executeFulltextSync(
  options: FulltextSyncOptions,
): Promise<FulltextSyncResult> {
  const { sessionId, sessionsDir, dryRun } = options;
  const sessionDir = join(sessionsDir, sessionId);
  const fulltextDir = getFulltextDir(sessionDir);

  // Load fulltext index
  const indexPath = getIndexPath(sessionDir);
  let index: FulltextIndex;
  try {
    index = await loadIndex(indexPath);
  } catch {
    // No index means no directories to sync
    return { synced: 0, articlesUpdated: 0, entries: [] };
  }

  // Scan all directories in fulltext/
  let dirEntries: string[];
  try {
    const entries = await readdir(fulltextDir, { withFileTypes: true });
    dirEntries = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return { synced: 0, articlesUpdated: 0, entries: [] };
  }

  const syncEntries: FulltextSyncEntry[] = [];
  let totalSynced = 0;
  const articlesWithChanges = new Set<string>();

  // Track updates for index and reviews
  const indexUpdates = new Map<string, { pdf: boolean; xml: boolean; markdown: boolean }>();
  const metaUpdates = new Map<string, { meta: FulltextMeta; path: string }>();

  for (const dirName of dirEntries) {
    const articleDir = join(fulltextDir, dirName);
    const metaPath = join(articleDir, 'meta.json');

    // Load meta.json
    let meta: FulltextMeta;
    try {
      meta = await loadMeta(metaPath);
    } catch {
      // Skip directories without meta.json
      continue;
    }

    const newFiles: string[] = [];
    const newSizes: number[] = [];
    const fileInfoUpdates: { pdf?: FileInfo; xml?: FileInfo; markdown?: FileInfo } = {};

    for (const [filename, typeKey] of Object.entries(FULLTEXT_FILES)) {
      // Skip if already tracked in meta
      if (meta.files[typeKey]) {
        continue;
      }

      // Check if file exists
      const filePath = join(articleDir, filename);
      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        continue; // File doesn't exist
      }

      if (!fileStat.isFile()) continue;

      // New file found
      const fileInfo: FileInfo = {
        filename,
        source: 'manual',
        retrievedAt: new Date().toISOString(),
        size: fileStat.size,
      };

      fileInfoUpdates[typeKey] = fileInfo;
      newFiles.push(filename);
      newSizes.push(fileStat.size);
    }

    if (newFiles.length > 0) {
      totalSynced += newFiles.length;
      articlesWithChanges.add(dirName);

      syncEntries.push({
        dirName,
        files: newFiles,
        sizes: newSizes,
      });

      if (!dryRun) {
        // Update meta.json
        const updatedMeta = updateMetaFiles(meta, fileInfoUpdates);
        metaUpdates.set(dirName, { meta: updatedMeta, path: metaPath });

        // Compute updated hasFiles for index
        const hasFiles = {
          pdf: !!(updatedMeta.files.pdf),
          xml: !!(updatedMeta.files.xml),
          markdown: !!(updatedMeta.files.markdown),
        };
        indexUpdates.set(dirName, hasFiles);
      }
    }
  }

  if (!dryRun && (metaUpdates.size > 0 || indexUpdates.size > 0)) {
    // Save all meta.json updates
    for (const [, { meta, path }] of metaUpdates) {
      await saveMeta(path, meta);
    }

    // Update fulltext-index.json
    for (const [dirName, hasFiles] of indexUpdates) {
      try {
        index = updateEntry(index, dirName, { hasFiles });
      } catch {
        // Entry not found in index - skip
      }
    }
    await saveIndex(indexPath, index);

    // Update reviews.yaml if it exists
    const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
    try {
      const reviewContent = await readFile(reviewsPath, 'utf-8');
      const reviewFile = parseYaml(reviewContent) as ReviewFile;
      let reviewsChanged = false;

      for (const article of reviewFile.articles) {
        if (article.fulltext?.dirName && indexUpdates.has(article.fulltext.dirName)) {
          const hasFiles = indexUpdates.get(article.fulltext.dirName);
          if (hasFiles) {
            article.fulltext.hasFiles = hasFiles;
            reviewsChanged = true;
          }
        }
      }

      if (reviewsChanged) {
        await writeFile(reviewsPath, stringifyYaml(reviewFile), 'utf-8');
      }
    } catch {
      // No reviews.yaml - that's fine
    }
  }

  return {
    synced: totalSynced,
    articlesUpdated: articlesWithChanges.size,
    entries: syncEntries,
    ...(dryRun && { dryRun: true }),
  };
}
