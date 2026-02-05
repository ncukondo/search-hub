import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createIndex,
  loadIndex,
  saveIndex,
  addEntry,
  updateEntry,
  findByDoi,
  findByPmid,
} from './index-manager.js';
import type { FulltextIndexEntry } from './types.js';

describe('Index Management', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-index-test-${Date.now()}-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createIndex', () => {
    it('should create empty index with sessionId', () => {
      const index = createIndex('test-session-id');
      expect(index.sessionId).toBe('test-session-id');
      expect(index.entries).toEqual({});
      expect(index.updatedAt).toBeTruthy();
    });
  });

  describe('addEntry', () => {
    it('should add new entry to index', () => {
      const index = createIndex('test-session');
      const entry: FulltextIndexEntry = {
        dirName: 'smith2024-a1b2c3d4',
        citationKey: 'smith2024',
        doi: '10.1234/example',
        hasFiles: { pdf: false, xml: false, markdown: false },
      };

      const updated = addEntry(index, entry);
      expect(updated.entries['smith2024-a1b2c3d4']).toEqual(entry);
    });
  });

  describe('updateEntry', () => {
    it('should update existing entry', () => {
      let index = createIndex('test-session');
      const entry: FulltextIndexEntry = {
        dirName: 'smith2024-a1b2c3d4',
        citationKey: 'smith2024',
        doi: '10.1234/example',
        hasFiles: { pdf: false, xml: false, markdown: false },
      };
      index = addEntry(index, entry);

      const updated = updateEntry(index, 'smith2024-a1b2c3d4', {
        hasFiles: { pdf: true, xml: false, markdown: false },
      });

      const updatedEntry = updated.entries['smith2024-a1b2c3d4'];
      expect(updatedEntry?.hasFiles.pdf).toBe(true);
    });

    it('should throw on non-existent entry', () => {
      const index = createIndex('test-session');
      expect(() =>
        updateEntry(index, 'nonexistent', {
          hasFiles: { pdf: true, xml: false, markdown: false },
        }),
      ).toThrow('Entry not found');
    });
  });

  describe('findByDoi', () => {
    it('should find entry by DOI', () => {
      let index = createIndex('test-session');
      index = addEntry(index, {
        dirName: 'smith2024-a1b2c3d4',
        citationKey: 'smith2024',
        doi: '10.1234/example',
        hasFiles: { pdf: false, xml: false, markdown: false },
      });
      index = addEntry(index, {
        dirName: 'jones2023-e5f6g7h8',
        citationKey: 'jones2023',
        doi: '10.5678/other',
        hasFiles: { pdf: true, xml: false, markdown: false },
      });

      const found = findByDoi(index, '10.1234/example');
      expect(found?.dirName).toBe('smith2024-a1b2c3d4');
    });

    it('should return undefined for unknown DOI', () => {
      const index = createIndex('test-session');
      expect(findByDoi(index, '10.9999/unknown')).toBeUndefined();
    });
  });

  describe('findByPmid', () => {
    it('should find entry by PMID', () => {
      let index = createIndex('test-session');
      index = addEntry(index, {
        dirName: 'smith2024-a1b2c3d4',
        citationKey: 'smith2024',
        pmid: '12345678',
        hasFiles: { pdf: false, xml: false, markdown: false },
      });

      const found = findByPmid(index, '12345678');
      expect(found?.dirName).toBe('smith2024-a1b2c3d4');
    });

    it('should return undefined for unknown PMID', () => {
      const index = createIndex('test-session');
      expect(findByPmid(index, '99999999')).toBeUndefined();
    });
  });

  describe('saveIndex and loadIndex', () => {
    it('should save and load index with proper formatting', async () => {
      let index = createIndex('test-session');
      index = addEntry(index, {
        dirName: 'smith2024-a1b2c3d4',
        citationKey: 'smith2024',
        doi: '10.1234/example',
        hasFiles: { pdf: true, xml: false, markdown: false },
      });

      const indexPath = join(testDir, 'fulltext-index.json');
      await saveIndex(indexPath, index);
      const loaded = await loadIndex(indexPath);

      expect(loaded.sessionId).toBe('test-session');
      expect(loaded.entries['smith2024-a1b2c3d4']?.doi).toBe('10.1234/example');
      expect(loaded.entries['smith2024-a1b2c3d4']?.hasFiles.pdf).toBe(true);
    });

    it('should throw on non-existent index file', async () => {
      const indexPath = join(testDir, 'nonexistent.json');
      await expect(loadIndex(indexPath)).rejects.toThrow();
    });
  });
});
