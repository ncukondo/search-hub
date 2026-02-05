import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { generateCitationKey, generateDirName } from './citation-key.js';
import { createMeta, saveMeta, loadMeta, updateMetaFiles } from './meta.js';
import {
  getFulltextDir,
  getArticleDir,
  getMetaPath,
  getReadmePath,
  getIndexPath,
} from './paths.js';
import {
  createIndex,
  saveIndex,
  loadIndex,
  addEntry,
  findByDoi,
  findByPmid,
  updateEntry,
} from './index-manager.js';
import { generateReadme } from './readme.js';
import type { FulltextIndexEntry } from './types.js';

describe('Fulltext Foundation Integration', () => {
  let sessionDir: string;

  beforeEach(async () => {
    sessionDir = join(tmpdir(), `search-hub-integration-${Date.now()}-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(sessionDir, { recursive: true, force: true });
  });

  it('should create article directory with meta.json and README.md', async () => {
    // 1. Generate citation key and directory name
    const citationKey = generateCitationKey('Smith, J.', '2024');
    expect(citationKey).toBe('smith2024');

    const uuid = randomUUID();
    const dirName = generateDirName(citationKey, uuid);
    expect(dirName).toMatch(/^smith2024-[a-f0-9]{8}$/);

    // 2. Resolve paths
    const articleDir = getArticleDir(sessionDir, dirName);
    const metaPath = getMetaPath(sessionDir, dirName);
    const readmePath = getReadmePath(sessionDir, dirName);

    // 3. Create directory structure
    await mkdir(articleDir, { recursive: true });

    // 4. Create and save meta.json
    const meta = createMeta({
      citationKey,
      uuid,
      title: 'A Systematic Review of Machine Learning',
      doi: '10.1234/test.2024',
      pmid: '12345678',
      authors: 'Smith, J.; Jones, A.',
      year: '2024',
    });
    expect(meta.dirName).toBe(dirName);
    expect(meta.oaStatus).toBe('unchecked');
    expect(meta.files).toEqual({});

    await saveMeta(metaPath, meta);

    // 5. Generate and save README
    const readmeContent = generateReadme(meta);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(readmePath, readmeContent, 'utf-8');

    // 6. Verify files exist and are valid
    const loadedMeta = await loadMeta(metaPath);
    expect(loadedMeta.citationKey).toBe('smith2024');
    expect(loadedMeta.doi).toBe('10.1234/test.2024');

    const readmeOnDisk = await readFile(readmePath, 'utf-8');
    expect(readmeOnDisk).toContain('# smith2024');
    expect(readmeOnDisk).toContain('10.1234/test.2024');
  });

  it('should add articles to index and verify lookups', async () => {
    // 1. Create fulltext directory
    const fulltextDir = getFulltextDir(sessionDir);
    await mkdir(fulltextDir, { recursive: true });

    // 2. Create index
    let index = createIndex('session-001');

    // 3. Add first article
    const key1 = generateCitationKey('Smith, J.', '2024');
    const dir1 = generateDirName(key1, 'aaaaaaaa-1111-2222-3333-444444444444');
    const entry1: FulltextIndexEntry = {
      dirName: dir1,
      citationKey: key1,
      doi: '10.1234/first',
      pmid: '11111111',
      hasFiles: { pdf: false, xml: false, markdown: false },
    };
    index = addEntry(index, entry1);

    // 4. Add second article (with collision handling)
    const key2 = generateCitationKey('Smith, R.', '2024', [key1]);
    expect(key2).toBe('smith2024a');

    const dir2 = generateDirName(key2, 'bbbbbbbb-5555-6666-7777-888888888888');
    const entry2: FulltextIndexEntry = {
      dirName: dir2,
      citationKey: key2,
      doi: '10.5678/second',
      hasFiles: { pdf: true, xml: false, markdown: false },
    };
    index = addEntry(index, entry2);

    // 5. Save and reload index
    const indexPath = getIndexPath(sessionDir);
    await saveIndex(indexPath, index);
    const loaded = await loadIndex(indexPath);

    // 6. Verify lookups
    const foundByDoi = findByDoi(loaded, '10.1234/first');
    expect(foundByDoi?.dirName).toBe(dir1);
    expect(foundByDoi?.citationKey).toBe('smith2024');

    const foundByPmid = findByPmid(loaded, '11111111');
    expect(foundByPmid?.dirName).toBe(dir1);

    const foundSecond = findByDoi(loaded, '10.5678/second');
    expect(foundSecond?.citationKey).toBe('smith2024a');
    expect(foundSecond?.hasFiles.pdf).toBe(true);

    // 7. Verify unknown lookups return undefined
    expect(findByDoi(loaded, '10.9999/unknown')).toBeUndefined();
    expect(findByPmid(loaded, '99999999')).toBeUndefined();
  });

  it('should update meta with file info and reflect in index', async () => {
    // 1. Set up article directory
    const uuid = 'cccccccc-9999-aaaa-bbbb-cccccccccccc';
    const citationKey = generateCitationKey('Jones, A.', '2023');
    const dirName = generateDirName(citationKey, uuid);
    const articleDir = getArticleDir(sessionDir, dirName);
    const metaPath = getMetaPath(sessionDir, dirName);

    await mkdir(articleDir, { recursive: true });

    // 2. Create initial meta (no files)
    const meta = createMeta({
      citationKey,
      uuid,
      title: 'Deep Learning for NLP',
      doi: '10.9876/nlp.2023',
      authors: 'Jones, A.',
      year: '2023',
    });
    await saveMeta(metaPath, meta);

    // 3. Create initial index with entry (no files)
    let index = createIndex('session-002');
    index = addEntry(index, {
      dirName,
      citationKey,
      doi: '10.9876/nlp.2023',
      hasFiles: { pdf: false, xml: false, markdown: false },
    });

    // 4. Simulate adding a PDF file — update meta
    const updatedMeta = updateMetaFiles(meta, {
      pdf: {
        filename: 'fulltext.pdf',
        source: 'pmc',
        retrievedAt: new Date().toISOString(),
        size: 1024000,
      },
    });
    expect(updatedMeta.files.pdf).toBeDefined();
    expect(updatedMeta.files.pdf?.filename).toBe('fulltext.pdf');
    expect(updatedMeta.files.pdf?.size).toBe(1024000);

    // Save updated meta
    await saveMeta(metaPath, updatedMeta);

    // 5. Update index entry to reflect file presence
    index = updateEntry(index, dirName, {
      hasFiles: { pdf: true, xml: false, markdown: false },
    });

    // Save and reload index
    const indexPath = getIndexPath(sessionDir);
    await saveIndex(indexPath, index);
    const loadedIndex = await loadIndex(indexPath);

    // 6. Verify updates persisted
    const loadedMeta = await loadMeta(metaPath);
    expect(loadedMeta.files.pdf?.source).toBe('pmc');

    const entry = loadedIndex.entries[dirName];
    expect(entry?.hasFiles.pdf).toBe(true);
    expect(entry?.hasFiles.xml).toBe(false);

    // 7. Lookup by DOI still works after update
    const found = findByDoi(loadedIndex, '10.9876/nlp.2023');
    expect(found?.hasFiles.pdf).toBe(true);
  });

  it('should handle full workflow from key generation to file persistence', async () => {
    // End-to-end: simulate creating an article directory for a real use case
    const fulltextDir = getFulltextDir(sessionDir);
    await mkdir(fulltextDir, { recursive: true });

    // Create index
    let index = createIndex('my-session');
    const indexPath = getIndexPath(sessionDir);

    // Add multiple articles
    const articles = [
      { author: 'Müller, K.', year: '2024', doi: '10.1000/a', title: 'German Study' },
      { author: '田中', year: '2023', doi: '10.2000/b', title: 'Japanese Study' },
      { author: undefined, year: undefined, doi: '10.3000/c', title: 'Unknown Article' },
    ];

    const existingKeys: string[] = [];

    for (const article of articles) {
      const citationKey = generateCitationKey(article.author, article.year, existingKeys);
      existingKeys.push(citationKey);

      const uuid = randomUUID();
      const dirName = generateDirName(citationKey, uuid);
      const articleDir = getArticleDir(sessionDir, dirName);

      // Create directory and files
      await mkdir(articleDir, { recursive: true });

      const meta = createMeta({
        citationKey,
        uuid,
        title: article.title,
        doi: article.doi,
      });
      await saveMeta(getMetaPath(sessionDir, dirName), meta);

      const readme = generateReadme(meta);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(getReadmePath(sessionDir, dirName), readme, 'utf-8');

      // Add to index
      index = addEntry(index, {
        dirName,
        citationKey,
        doi: article.doi,
        hasFiles: { pdf: false, xml: false, markdown: false },
      });
    }

    // Verify citation keys include transliterated names
    expect(existingKeys).toContain('muller2024');
    expect(existingKeys).toContain('tianzhong2023');
    expect(existingKeys).toContain('unknown0000');

    // Save index and verify
    await saveIndex(indexPath, index);
    const loaded = await loadIndex(indexPath);

    expect(Object.keys(loaded.entries)).toHaveLength(3);
    expect(findByDoi(loaded, '10.1000/a')?.citationKey).toBe('muller2024');
    expect(findByDoi(loaded, '10.2000/b')?.citationKey).toBe('tianzhong2023');
    expect(findByDoi(loaded, '10.3000/c')?.citationKey).toBe('unknown0000');

    // Verify files on disk
    for (const dirName of Object.keys(loaded.entries)) {
      const metaPath = getMetaPath(sessionDir, dirName);
      const metaStat = await stat(metaPath);
      expect(metaStat.isFile()).toBe(true);

      const readmePath = getReadmePath(sessionDir, dirName);
      const readmeStat = await stat(readmePath);
      expect(readmeStat.isFile()).toBe(true);
    }
  });
});
