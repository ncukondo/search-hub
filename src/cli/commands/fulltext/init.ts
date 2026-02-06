/**
 * fulltext init command - Create directories for included articles.
 */

import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile } from '../review/types.js';
import type { FulltextIndex, FulltextIndexEntry, ArticleFulltextRef } from '../../../fulltext/types.js';
import { generateCitationKey, generateDirName } from '../../../fulltext/citation-key.js';
import { createMeta, saveMeta } from '../../../fulltext/meta.js';
import { generateReadme } from '../../../fulltext/readme.js';
import { createIndex, addEntry, loadIndex, saveIndex } from '../../../fulltext/index-manager.js';
import { getFulltextDir, getArticleDir, getMetaPath, getReadmePath, getIndexPath } from '../../../fulltext/paths.js';

export interface FulltextInitOptions {
  sessionId: string;
  sessionsDir: string;
  dryRun?: boolean;
}

export interface FulltextInitEntry {
  dirName: string;
  citationKey: string;
  title: string;
  doi?: string;
  pmid?: string;
}

export interface FulltextInitResult {
  created: number;
  skipped: number;
  entries: FulltextInitEntry[];
  dryRun?: boolean;
}

export async function executeFulltextInit(
  options: FulltextInitOptions,
): Promise<FulltextInitResult> {
  const { sessionId, sessionsDir, dryRun } = options;
  const sessionDir = join(sessionsDir, sessionId);

  // Load reviews.yaml
  const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
  const reviewContent = await readFile(reviewsPath, 'utf-8');
  const reviewFile = parseYaml(reviewContent) as ReviewFile;

  // Filter to included articles
  const includedArticles = (reviewFile.articles ?? []).filter(
    (a) => a.finalDecision === 'include',
  );

  // Load or create fulltext index
  const indexPath = getIndexPath(sessionDir);
  let index: FulltextIndex;
  try {
    index = await loadIndex(indexPath);
  } catch {
    index = createIndex(sessionId);
  }

  // Collect existing dirNames from index and reviews for skip detection
  const existingDirNames = new Set(Object.keys(index.entries));
  // Also check reviews for already-assigned fulltext references
  for (const article of reviewFile.articles ?? []) {
    if (article.fulltext?.dirName) {
      existingDirNames.add(article.fulltext.dirName);
    }
  }

  const entries: FulltextInitEntry[] = [];
  const existingKeys: string[] = Object.values(index.entries).map(e => e.citationKey);
  let created = 0;
  let skipped = 0;

  // Track which articles in reviewFile to update with fulltext refs
  const fulltextUpdates = new Map<number, ArticleFulltextRef>();

  for (let i = 0; i < includedArticles.length; i++) {
    const article = includedArticles[i]!;

    // Find the article's index in the full review file (including non-included)
    const reviewIndex = reviewFile.articles.indexOf(article);

    // Skip if already has a fulltext directory
    if (article.fulltext?.dirName && existingDirNames.has(article.fulltext.dirName)) {
      skipped++;
      continue;
    }

    // Generate citation key and directory name
    const citationKey = generateCitationKey(article.authors, article.year, existingKeys);
    existingKeys.push(citationKey);

    const uuid = randomUUID();
    const dirName = generateDirName(citationKey, uuid);

    // Create meta
    const metaOpts: Parameters<typeof createMeta>[0] = {
      citationKey,
      uuid,
      title: article.title,
    };
    if (article.doi) metaOpts.doi = article.doi;
    if (article.pmid) metaOpts.pmid = article.pmid;
    if (article.arxivId) metaOpts.arxivId = article.arxivId;
    if (article.authors) metaOpts.authors = article.authors;
    if (article.year) metaOpts.year = article.year;
    const meta = createMeta(metaOpts);

    // Build index entry
    const indexEntry: FulltextIndexEntry = {
      dirName,
      citationKey,
      hasFiles: { pdf: false, xml: false, markdown: false },
    };
    if (article.doi) indexEntry.doi = article.doi;
    if (article.pmid) indexEntry.pmid = article.pmid;
    if (article.arxivId) indexEntry.arxivId = article.arxivId;

    // Build fulltext ref for reviews.yaml
    const fulltextRef: ArticleFulltextRef = {
      dirName,
      hasFiles: { pdf: false, xml: false, markdown: false },
    };

    if (!dryRun) {
      // Create directory
      const articleDir = getArticleDir(sessionDir, dirName);
      await mkdir(articleDir, { recursive: true });

      // Write meta.json
      await saveMeta(getMetaPath(sessionDir, dirName), meta);

      // Write README.md
      const readme = generateReadme(meta);
      await writeFile(getReadmePath(sessionDir, dirName), readme, 'utf-8');

      // Add to index
      index = addEntry(index, indexEntry);

      // Track review update
      fulltextUpdates.set(reviewIndex, fulltextRef);
    }

    created++;
    const entry: FulltextInitEntry = { dirName, citationKey, title: article.title };
    if (article.doi) entry.doi = article.doi;
    if (article.pmid) entry.pmid = article.pmid;
    entries.push(entry);
  }

  if (!dryRun) {
    // Ensure fulltext directory exists
    await mkdir(getFulltextDir(sessionDir), { recursive: true });

    // Save fulltext-index.json
    await saveIndex(indexPath, index);

    // Update reviews.yaml with fulltext references
    if (fulltextUpdates.size > 0) {
      for (const [reviewIdx, ref] of fulltextUpdates) {
        reviewFile.articles[reviewIdx]!.fulltext = ref;
      }
      await writeFile(reviewsPath, stringifyYaml(reviewFile), 'utf-8');
    }
  }

  return {
    created,
    skipped,
    entries,
    ...(dryRun && { dryRun: true }),
  };
}
