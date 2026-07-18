/**
 * fulltext sync command - Detect and register manually added files.
 */

import { join } from 'node:path';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile } from '../review/types.js';
import {
  loadMeta,
  saveMeta,
  updateMetaFiles,
  getFulltextDir,
  type FulltextMeta,
  type FileInfo,
} from '@ncukondo/academic-fulltext';

/** Known fulltext filenames and their type keys. */
const FULLTEXT_FILES: Record<string, 'pdf' | 'xml' | 'html' | 'markdown'> = {
  'fulltext.pdf': 'pdf',
  'fulltext.xml': 'xml',
  'fulltext.html': 'html',
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

  // Scan all directories in fulltext/
  let dirEntries: string[];
  try {
    const entries = await readdir(fulltextDir, { withFileTypes: true });
    dirEntries = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { synced: 0, articlesUpdated: 0, entries: [] };
  }

  const syncEntries: FulltextSyncEntry[] = [];
  let totalSynced = 0;
  const articlesWithChanges = new Set<string>();

  // Track updates for meta and reviews
  const hasFilesUpdates = new Map<
    string,
    { pdf: boolean; xml: boolean; html: boolean; markdown: boolean }
  >();
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
    const fileInfoUpdates: {
      pdf?: FileInfo;
      xml?: FileInfo;
      html?: FileInfo;
      markdown?: FileInfo;
    } = {};

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

        // Compute updated hasFiles for reviews
        const hasFiles = {
          pdf: !!updatedMeta.files.pdf,
          xml: !!updatedMeta.files.xml,
          html: !!updatedMeta.files.html,
          markdown: !!updatedMeta.files.markdown,
        };
        hasFilesUpdates.set(dirName, hasFiles);
      }
    }
  }

  if (!dryRun && metaUpdates.size > 0) {
    // Save all meta.json updates
    for (const [, { meta, path }] of metaUpdates) {
      await saveMeta(path, meta);
    }

    // Update reviews.yaml if it exists
    const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
    try {
      const reviewContent = await readFile(reviewsPath, 'utf-8');
      const reviewFile = parseYaml(reviewContent) as ReviewFile;
      let reviewsChanged = false;

      for (const article of reviewFile.articles) {
        if (article.fulltext?.dirName && hasFilesUpdates.has(article.fulltext.dirName)) {
          const hasFiles = hasFilesUpdates.get(article.fulltext.dirName);
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
