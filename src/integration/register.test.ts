/**
 * Tests for registration logic (bulk import).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Article } from '../providers/base/types.js';
import type { RefAddOutput } from './types.js';

// Mock ref-cli module
vi.mock('./ref-cli.js', () => ({
  refAddBulk: vi.fn(),
}));

// Mock fulltext-attach module
vi.mock('./fulltext-attach.js', () => ({
  attachFulltexts: vi.fn(),
}));

import { refAddBulk } from './ref-cli.js';
import { attachFulltexts } from './fulltext-attach.js';
import {
  registerArticles,
  saveRegistrationRecord,
  loadRegistrationRecord,
  type RegisterOptions,
} from './register.js';

// Helper to create test articles
function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Test Article',
    authors: [{ family: 'Test', given: 'Author' }],
    source: 'pubmed',
    retrievedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

// Helper to create bulk ref add output
function createBulkOutput(
  added: Array<{ source: string; id: string; title: string }> = [],
  skipped: Array<{ source: string; existingId: string; duplicateType: string }> = [],
  failed: Array<{ source: string; reason: string; error?: string }> = [],
): RefAddOutput {
  return {
    summary: {
      total: added.length + skipped.length + failed.length,
      added: added.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    added,
    skipped,
    failed,
  };
}

describe('registerArticles (bulk import)', () => {
  const mockRefAddBulk = vi.mocked(refAddBulk);
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-register-test-'));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  const createOptions = (): RegisterOptions => ({
    sessionId: 'test-session-123',
    sessionDir: tempDir,
  });

  describe('bulk conversion and import', () => {
    it('should convert articles to CSL-JSON and call refAddBulk', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article 1',
          authors: [{ family: 'Smith', given: 'John' }],
          publicationDate: '2024-01-15',
        }),
      ];

      // Capture the file path and verify content when refAddBulk is called
      mockRefAddBulk.mockImplementation(async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const cslJson = JSON.parse(content);
        expect(cslJson).toHaveLength(1);
        expect(cslJson[0].id).toBe('smith-2024');
        expect(cslJson[0].type).toBe('article-journal');
        expect(cslJson[0].PMID).toBe('12345678');
        expect(cslJson[0].title).toBe('Article 1');
        return createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'Article 1' }]);
      });

      await registerArticles(articles, createOptions());

      // Verify refAddBulk was called with correct library path
      expect(mockRefAddBulk).toHaveBeenCalledWith(path.join(tempDir, '_bulk_import.json'), {
        libraryPath: path.join(tempDir, 'references.json'),
      });
    });

    it('should map RefAddOutput to RegistrationRecord correctly', async () => {
      const articles = [
        createArticle({
          pmid: '11111111',
          title: 'New Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
        createArticle({
          pmid: '22222222',
          title: 'Dup Article',
          authors: [{ family: 'Jones' }],
          publicationDate: '2024',
        }),
        createArticle({
          doi: '10.1234/fail',
          title: 'Fail Article',
          authors: [{ family: 'Chen' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput(
          [{ source: 'smith-2024', id: 'smith-2024', title: 'New Article' }],
          [{ source: 'jones-2024', existingId: 'existing-2023', duplicateType: 'pmid' }],
          [{ source: 'chen-2024', reason: 'fetch_error', error: 'Not found' }],
        ),
      );

      const result = await registerArticles(articles, createOptions());

      expect(result.summary.total).toBe(3);
      expect(result.summary.added).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.noId).toBe(0);
      expect(result.added).toHaveLength(1);
      expect(result.added[0]).toEqual({
        source: 'smith-2024',
        id: 'smith-2024',
        title: 'New Article',
      });
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0]).toEqual({
        source: 'jones-2024',
        existingId: 'existing-2023',
        duplicateType: 'pmid',
      });
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({
        source: 'chen-2024',
        reason: 'fetch_error',
        error: 'Not found',
      });
    });
  });

  describe('articles without identifiers', () => {
    it('should count articles without any identifier as noId and exclude from CSL-JSON', async () => {
      const articles = [
        createArticle({ title: 'No ID Article 1' }),
        createArticle({ title: 'No ID Article 2' }),
        createArticle({
          pmid: '12345678',
          title: 'With PMID',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockImplementation(async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const cslJson = JSON.parse(content);
        // Only one article should be in CSL-JSON (the one with PMID)
        expect(cslJson).toHaveLength(1);
        return createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'With PMID' }]);
      });

      const result = await registerArticles(articles, createOptions());

      expect(result.summary.noId).toBe(2);
      expect(result.summary.total).toBe(3);
    });

    it('should not call refAddBulk when all articles lack identifiers', async () => {
      const articles = [createArticle({ title: 'No ID Article' })];

      const result = await registerArticles(articles, createOptions());

      expect(mockRefAddBulk).not.toHaveBeenCalled();
      expect(result.summary.noId).toBe(1);
      expect(result.summary.added).toBe(0);
    });
  });

  describe('articles with alternative identifiers', () => {
    it('should include arXiv-only articles in the bulk import, not count as noId', async () => {
      const articles = [
        createArticle({
          arxivId: '2401.12345',
          title: 'arXiv Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockImplementation(async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const cslJson = JSON.parse(content);
        expect(cslJson).toHaveLength(1);
        expect(cslJson[0].custom).toEqual({ arxiv_id: '2401.12345' });
        return createBulkOutput([
          { source: 'smith-2024', id: 'smith-2024', title: 'arXiv Article' },
        ]);
      });

      const result = await registerArticles(articles, createOptions());

      expect(mockRefAddBulk).toHaveBeenCalled();
      expect(result.summary.noId).toBe(0);
      expect(result.summary.added).toBe(1);
    });

    it('should include ERIC-only articles in the bulk import, not count as noId', async () => {
      const articles = [
        createArticle({
          ericId: 'ED123456',
          title: 'ERIC Article',
          authors: [{ family: 'Jones' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockImplementation(async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const cslJson = JSON.parse(content);
        expect(cslJson).toHaveLength(1);
        expect(cslJson[0].custom).toEqual({ eric_id: 'ED123456' });
        return createBulkOutput([
          { source: 'jones-2024', id: 'jones-2024', title: 'ERIC Article' },
        ]);
      });

      const result = await registerArticles(articles, createOptions());

      expect(mockRefAddBulk).toHaveBeenCalled();
      expect(result.summary.noId).toBe(0);
      expect(result.summary.added).toBe(1);
    });

    it('should include Scopus-only articles in the bulk import, not count as noId', async () => {
      const articles = [
        createArticle({
          scopusId: '2-s2.0-85012345678',
          title: 'Scopus Article',
          authors: [{ family: 'Chen' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockImplementation(async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const cslJson = JSON.parse(content);
        expect(cslJson).toHaveLength(1);
        expect(cslJson[0].custom).toEqual({ scopus_id: '2-s2.0-85012345678' });
        return createBulkOutput([
          { source: 'chen-2024', id: 'chen-2024', title: 'Scopus Article' },
        ]);
      });

      const result = await registerArticles(articles, createOptions());

      expect(mockRefAddBulk).toHaveBeenCalled();
      expect(result.summary.noId).toBe(0);
      expect(result.summary.added).toBe(1);
    });

    it('should count only truly identifier-less articles as noId in a mixed batch', async () => {
      const articles = [
        createArticle({
          arxivId: '2401.12345',
          title: 'arXiv Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
        createArticle({ title: 'No ID Article' }),
      ];

      mockRefAddBulk.mockImplementation(async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const cslJson = JSON.parse(content);
        expect(cslJson).toHaveLength(1);
        return createBulkOutput([
          { source: 'smith-2024', id: 'smith-2024', title: 'arXiv Article' },
        ]);
      });

      const result = await registerArticles(articles, createOptions());

      expect(result.summary.noId).toBe(1);
      expect(result.summary.total).toBe(2);
      expect(result.summary.added).toBe(1);
    });
  });

  describe('temp file cleanup', () => {
    it('should clean up temp file after successful import', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'Article' }]),
      );

      await registerArticles(articles, createOptions());

      // Verify temp file was cleaned up
      const tempFilePath = path.join(tempDir, '_bulk_import.json');
      const exists = await fs
        .access(tempFilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it('should clean up temp file even when refAddBulk throws', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockRejectedValueOnce(new Error('Bulk import failed'));

      const result = await registerArticles(articles, createOptions());

      // Temp file should still be cleaned up
      const tempFilePath = path.join(tempDir, '_bulk_import.json');
      const exists = await fs
        .access(tempFilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);

      // Error should be recorded
      expect(result.summary.failed).toBe(1);
      expect(result.failed[0]!.reason).toBe('execution_error');
    });
  });

  describe('registration record metadata', () => {
    it('should include sessionId in the record', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];
      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'Article' }]),
      );

      const result = await registerArticles(articles, createOptions());

      expect(result.sessionId).toBe('test-session-123');
    });

    it('should include timestamp in ISO format', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];
      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'Article' }]),
      );

      const result = await registerArticles(articles, createOptions());

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('session-specific library path', () => {
    it('should pass libraryPath option to refAddBulk', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'Article' }]),
      );

      await registerArticles(articles, createOptions());

      expect(mockRefAddBulk).toHaveBeenCalledWith(expect.any(String), {
        libraryPath: path.join(tempDir, 'references.json'),
      });
    });
  });

  describe('progress callback', () => {
    it('should call onProgress', async () => {
      const articles = [
        createArticle({
          pmid: '11111111',
          title: 'Article 1',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
        createArticle({
          pmid: '22222222',
          title: 'Article 2',
          authors: [{ family: 'Jones' }],
          publicationDate: '2024',
        }),
        createArticle({ title: 'No ID' }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([
          { source: 'smith-2024', id: 'smith-2024', title: 'Article 1' },
          { source: 'jones-2024', id: 'jones-2024', title: 'Article 2' },
        ]),
      );

      const onProgress = vi.fn();
      await registerArticles(articles, { ...createOptions(), onProgress });

      // Progress should be called at least once
      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe('withAbstracts deprecation', () => {
    it('should log deprecation warning when withAbstracts is true', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'Article' }]),
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await registerArticles(articles, { ...createOptions(), withAbstracts: true });

        expect(warnSpy).toHaveBeenCalledWith(
          'Note: abstracts are now always included in bulk import. --with-abstracts flag is no longer needed.',
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should not log deprecation warning when withAbstracts is not set', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'smith-2024', id: 'smith-2024', title: 'Article' }]),
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await registerArticles(articles, createOptions());

        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should always include abstracts in CSL-JSON regardless of withAbstracts flag', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article with Abstract',
          abstract: 'This is the abstract.',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockImplementation(async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        const cslJson = JSON.parse(content);
        // Abstract should always be included
        expect(cslJson[0].abstract).toBe('This is the abstract.');
        return createBulkOutput([
          { source: 'smith-2024', id: 'smith-2024', title: 'Article with Abstract' },
        ]);
      });

      await registerArticles(articles, createOptions());
    });
  });

  describe('fulltext attach integration', () => {
    const mockAttachFulltexts = vi.mocked(attachFulltexts);

    it('should call attachFulltexts after successful bulk import', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article 1',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'pmid:12345678', id: 'smith-2024', title: 'Article 1' }]),
      );

      mockAttachFulltexts.mockResolvedValueOnce({
        summary: { total: 1, attached: 1, skipped: 0, failed: 0 },
        attached: [{ refId: 'smith-2024', files: ['fulltext.pdf'] }],
        skipped: [],
        failed: [],
      });

      const result = await registerArticles(articles, createOptions());

      expect(mockAttachFulltexts).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionDir: tempDir,
          libraryPath: path.join(tempDir, 'references.json'),
          addedRefs: expect.arrayContaining([{ id: 'smith-2024', source: 'pmid:12345678' }]),
        }),
      );
      expect(result.fulltext).toBeDefined();
      expect(result.fulltext!.summary.attached).toBe(1);
    });

    it('should skip attachFulltexts when noAttachFulltext is true', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article 1',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([{ source: 'pmid:12345678', id: 'smith-2024', title: 'Article 1' }]),
      );

      const result = await registerArticles(articles, {
        ...createOptions(),
        noAttachFulltext: true,
      });

      expect(mockAttachFulltexts).not.toHaveBeenCalled();
      expect(result.fulltext).toBeUndefined();
    });

    it('should include fulltext results in registration record', async () => {
      const articles = [
        createArticle({
          pmid: '11111111',
          title: 'A1',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
        createArticle({
          doi: '10.1234/test',
          title: 'A2',
          authors: [{ family: 'Jones' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput([
          { source: 'pmid:11111111', id: 'smith-2024', title: 'A1' },
          { source: '10.1234/test', id: 'jones-2024', title: 'A2' },
        ]),
      );

      mockAttachFulltexts.mockResolvedValueOnce({
        summary: { total: 2, attached: 1, skipped: 1, failed: 0 },
        attached: [{ refId: 'smith-2024', files: ['fulltext.pdf', 'fulltext.md'] }],
        skipped: [{ dirName: 'jones2024-aabbccdd', reason: 'no_files' }],
        failed: [],
      });

      const result = await registerArticles(articles, createOptions());

      expect(result.fulltext).toBeDefined();
      expect(result.fulltext!.summary.total).toBe(2);
      expect(result.fulltext!.attached).toHaveLength(1);
      expect(result.fulltext!.skipped).toHaveLength(1);
    });

    it('should include duplicates in addedRefs for fulltext attach', async () => {
      const articles = [
        createArticle({
          pmid: '11111111',
          title: 'New',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
        createArticle({
          pmid: '22222222',
          title: 'Dup',
          authors: [{ family: 'Jones' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput(
          [{ source: 'pmid:11111111', id: 'smith-2024', title: 'New' }],
          [{ source: 'pmid:22222222', existingId: 'jones-2024', duplicateType: 'pmid' }],
        ),
      );

      mockAttachFulltexts.mockResolvedValueOnce({
        summary: { total: 0, attached: 0, skipped: 0, failed: 0 },
        attached: [],
        skipped: [],
        failed: [],
      });

      await registerArticles(articles, createOptions());

      expect(mockAttachFulltexts).toHaveBeenCalledWith(
        expect.objectContaining({
          addedRefs: expect.arrayContaining([
            { id: 'smith-2024', source: 'pmid:11111111' },
            { id: 'jones-2024', source: 'pmid:22222222' },
          ]),
        }),
      );
    });

    it('should call attachFulltexts when all articles are duplicates', async () => {
      const articles = [
        createArticle({
          pmid: '11111111',
          title: 'Dup1',
          authors: [{ family: 'Smith' }],
          publicationDate: '2024',
        }),
        createArticle({
          pmid: '22222222',
          title: 'Dup2',
          authors: [{ family: 'Jones' }],
          publicationDate: '2024',
        }),
      ];

      mockRefAddBulk.mockResolvedValueOnce(
        createBulkOutput(
          [],
          [
            { source: 'pmid:11111111', existingId: 'smith-2024', duplicateType: 'pmid' },
            { source: 'pmid:22222222', existingId: 'jones-2024', duplicateType: 'pmid' },
          ],
        ),
      );

      mockAttachFulltexts.mockResolvedValueOnce({
        summary: { total: 0, attached: 0, skipped: 0, failed: 0 },
        attached: [],
        skipped: [],
        failed: [],
      });

      await registerArticles(articles, createOptions());

      expect(mockAttachFulltexts).toHaveBeenCalledWith(
        expect.objectContaining({
          addedRefs: expect.arrayContaining([
            { id: 'smith-2024', source: 'pmid:11111111' },
            { id: 'jones-2024', source: 'pmid:22222222' },
          ]),
        }),
      );
    });

    it('should not call attachFulltexts when no articles were added', async () => {
      const articles = [createArticle({ title: 'No ID' })];

      const result = await registerArticles(articles, createOptions());

      expect(mockAttachFulltexts).not.toHaveBeenCalled();
      expect(result.fulltext).toBeUndefined();
    });
  });
});

describe('Registration Record Storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('saveRegistrationRecord', () => {
    it('should save record to session directory as registration.json', async () => {
      const record = {
        sessionId: 'test-session',
        timestamp: '2024-01-15T10:00:00.000Z',
        summary: { total: 1, added: 1, skipped: 0, failed: 0, noId: 0 },
        added: [{ source: 'pmid:12345678', id: 'smith2024', title: 'Test' }],
        duplicates: [],
        failed: [],
      };

      await saveRegistrationRecord(tempDir, record);

      const filePath = path.join(tempDir, 'registration.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const savedRecord = JSON.parse(content);

      expect(savedRecord).toEqual(record);
    });

    it('should create directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'session');
      const record = {
        sessionId: 'test-session',
        timestamp: '2024-01-15T10:00:00.000Z',
        summary: { total: 0, added: 0, skipped: 0, failed: 0, noId: 0 },
        added: [],
        duplicates: [],
        failed: [],
      };

      await saveRegistrationRecord(nestedDir, record);

      const filePath = path.join(nestedDir, 'registration.json');
      expect(
        await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);
    });

    it('should format JSON with indentation', async () => {
      const record = {
        sessionId: 'test-session',
        timestamp: '2024-01-15T10:00:00.000Z',
        summary: { total: 0, added: 0, skipped: 0, failed: 0, noId: 0 },
        added: [],
        duplicates: [],
        failed: [],
      };

      await saveRegistrationRecord(tempDir, record);

      const filePath = path.join(tempDir, 'registration.json');
      const content = await fs.readFile(filePath, 'utf-8');

      // Check that JSON is formatted with indentation
      expect(content).toContain('\n');
      expect(content).toMatch(/^\{\n\s+"sessionId"/);
    });
  });

  describe('loadRegistrationRecord', () => {
    it('should load record from session directory', async () => {
      const record = {
        sessionId: 'test-session',
        timestamp: '2024-01-15T10:00:00.000Z',
        summary: { total: 2, added: 1, skipped: 1, failed: 0, noId: 0 },
        added: [{ source: 'pmid:12345678', id: 'smith2024', title: 'Test' }],
        duplicates: [{ source: '10.1234/x', existingId: 'jones2023', duplicateType: 'doi' }],
        failed: [],
      };

      const filePath = path.join(tempDir, 'registration.json');
      await fs.writeFile(filePath, JSON.stringify(record));

      const loaded = await loadRegistrationRecord(tempDir);

      expect(loaded).toEqual(record);
    });

    it('should return null if file does not exist', async () => {
      const result = await loadRegistrationRecord(tempDir);

      expect(result).toBeNull();
    });

    it('should throw error if file contains invalid JSON', async () => {
      const filePath = path.join(tempDir, 'registration.json');
      await fs.writeFile(filePath, 'not valid json');

      await expect(loadRegistrationRecord(tempDir)).rejects.toThrow();
    });

    it('should throw error if file contains invalid schema', async () => {
      const filePath = path.join(tempDir, 'registration.json');
      await fs.writeFile(filePath, JSON.stringify({ invalid: 'data' }));

      await expect(loadRegistrationRecord(tempDir)).rejects.toThrow();
    });
  });
});
