/**
 * Tests for registration logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Article } from '../providers/base/types.js';
import type { RefAddOutput } from './types.js';

// Mock ref-cli module
vi.mock('./ref-cli.js', () => ({
  refAdd: vi.fn(),
  refUpdate: vi.fn(),
  refExport: vi.fn(),
}));

import { refAdd, refUpdate, refExport } from './ref-cli.js';
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

// Helper to create successful ref add output
function createRefAddOutput(
  source: string,
  id: string,
  title: string
): RefAddOutput {
  return {
    summary: { total: 1, added: 1, skipped: 0, failed: 0 },
    added: [{ source, id, title }],
    skipped: [],
    failed: [],
  };
}

// Helper to create duplicate ref add output
function createDuplicateOutput(
  source: string,
  existingId: string,
  duplicateType: string
): RefAddOutput {
  return {
    summary: { total: 1, added: 0, skipped: 1, failed: 0 },
    added: [],
    skipped: [{ source, existingId, duplicateType }],
    failed: [],
  };
}

// Helper to create failed ref add output
function createFailedOutput(
  source: string,
  reason: string,
  error?: string
): RefAddOutput {
  return {
    summary: { total: 1, added: 0, skipped: 0, failed: 1 },
    added: [],
    skipped: [],
    failed: [{ source, reason, error }],
  };
}

describe('registerArticles', () => {
  const mockRefAdd = vi.mocked(refAdd);
  const mockRefUpdate = vi.mocked(refUpdate);
  const mockRefExport = vi.mocked(refExport);

  const baseOptions: RegisterOptions = {
    sessionId: 'test-session-123',
    sessionDir: '/tmp/sessions/test-session-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ID selection', () => {
    it('should prefer PMID over DOI when both are available', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          doi: '10.1234/example',
          title: 'Article with both IDs',
        }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article with both IDs')
      );

      await registerArticles(articles, baseOptions);

      expect(mockRefAdd).toHaveBeenCalledTimes(1);
      expect(mockRefAdd).toHaveBeenCalledWith('pmid:12345678', expect.any(Object));
    });

    it('should use DOI when PMID is not available', async () => {
      const articles = [
        createArticle({
          doi: '10.1234/example',
          title: 'Article with DOI only',
        }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('10.1234/example', 'jones2024', 'Article with DOI only')
      );

      await registerArticles(articles, baseOptions);

      expect(mockRefAdd).toHaveBeenCalledTimes(1);
      expect(mockRefAdd).toHaveBeenCalledWith('10.1234/example', expect.any(Object));
    });
  });

  describe('articles without identifiers', () => {
    it('should count articles without DOI or PMID as noId', async () => {
      const articles = [
        createArticle({ title: 'No ID Article 1' }),
        createArticle({ title: 'No ID Article 2' }),
        createArticle({ pmid: '12345678', title: 'With PMID' }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'With PMID')
      );

      const result = await registerArticles(articles, baseOptions);

      expect(result.summary.noId).toBe(2);
      expect(result.summary.total).toBe(3);
      expect(mockRefAdd).toHaveBeenCalledTimes(1);
    });

    it('should not call ref add for articles without identifiers', async () => {
      const articles = [
        createArticle({ title: 'No ID Article' }),
      ];

      const result = await registerArticles(articles, baseOptions);

      expect(mockRefAdd).not.toHaveBeenCalled();
      expect(result.summary.noId).toBe(1);
      expect(result.summary.added).toBe(0);
    });
  });

  describe('result aggregation', () => {
    it('should aggregate results from multiple ref add calls', async () => {
      const articles = [
        createArticle({ pmid: '11111111', title: 'Article 1' }),
        createArticle({ pmid: '22222222', title: 'Article 2' }),
        createArticle({ doi: '10.1234/example', title: 'Article 3' }),
      ];

      mockRefAdd
        .mockResolvedValueOnce(createRefAddOutput('pmid:11111111', 'smith2024', 'Article 1'))
        .mockResolvedValueOnce(createRefAddOutput('pmid:22222222', 'jones2024', 'Article 2'))
        .mockResolvedValueOnce(createRefAddOutput('10.1234/example', 'chen2024', 'Article 3'));

      const result = await registerArticles(articles, baseOptions);

      expect(result.summary.total).toBe(3);
      expect(result.summary.added).toBe(3);
      expect(result.summary.skipped).toBe(0);
      expect(result.summary.failed).toBe(0);
      expect(result.added).toHaveLength(3);
    });

    it('should record added items correctly', async () => {
      const articles = [
        createArticle({ pmid: '12345678', title: 'Test Article' }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Test Article')
      );

      const result = await registerArticles(articles, baseOptions);

      expect(result.added).toEqual([
        { source: 'pmid:12345678', id: 'smith2024', title: 'Test Article' },
      ]);
    });
  });

  describe('duplicate handling', () => {
    it('should record duplicates correctly', async () => {
      const articles = [
        createArticle({ pmid: '12345678', title: 'Duplicate Article' }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createDuplicateOutput('pmid:12345678', 'existing2023', 'pmid')
      );

      const result = await registerArticles(articles, baseOptions);

      expect(result.summary.skipped).toBe(1);
      expect(result.duplicates).toEqual([
        { source: 'pmid:12345678', existingId: 'existing2023', duplicateType: 'pmid' },
      ]);
    });

    it('should handle mixed results with duplicates and new entries', async () => {
      const articles = [
        createArticle({ pmid: '11111111', title: 'New Article' }),
        createArticle({ pmid: '22222222', title: 'Duplicate Article' }),
      ];

      mockRefAdd
        .mockResolvedValueOnce(createRefAddOutput('pmid:11111111', 'new2024', 'New Article'))
        .mockResolvedValueOnce(createDuplicateOutput('pmid:22222222', 'existing2023', 'pmid'));

      const result = await registerArticles(articles, baseOptions);

      expect(result.summary.added).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(result.added).toHaveLength(1);
      expect(result.duplicates).toHaveLength(1);
    });
  });

  describe('failure handling', () => {
    it('should record failures correctly', async () => {
      const articles = [
        createArticle({ pmid: '12345678', title: 'Article' }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createFailedOutput('pmid:12345678', 'not_found', 'PMID not found in database')
      );

      const result = await registerArticles(articles, baseOptions);

      expect(result.summary.failed).toBe(1);
      expect(result.failed).toEqual([
        { source: 'pmid:12345678', reason: 'not_found', error: 'PMID not found in database' },
      ]);
    });

    it('should continue processing after a failure', async () => {
      const articles = [
        createArticle({ pmid: '11111111', title: 'Failing Article' }),
        createArticle({ pmid: '22222222', title: 'Successful Article' }),
      ];

      mockRefAdd
        .mockResolvedValueOnce(createFailedOutput('pmid:11111111', 'not_found'))
        .mockResolvedValueOnce(createRefAddOutput('pmid:22222222', 'smith2024', 'Successful Article'));

      const result = await registerArticles(articles, baseOptions);

      expect(result.summary.failed).toBe(1);
      expect(result.summary.added).toBe(1);
      expect(mockRefAdd).toHaveBeenCalledTimes(2);
    });

    it('should handle ref add throwing an error', async () => {
      const articles = [
        createArticle({ pmid: '11111111', title: 'Error Article' }),
        createArticle({ pmid: '22222222', title: 'Successful Article' }),
      ];

      mockRefAdd
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createRefAddOutput('pmid:22222222', 'smith2024', 'Successful Article'));

      const result = await registerArticles(articles, baseOptions);

      expect(result.summary.failed).toBe(1);
      expect(result.summary.added).toBe(1);
      expect(result.failed[0]).toMatchObject({
        source: 'pmid:11111111',
        reason: 'execution_error',
      });
    });
  });

  describe('session-specific library path', () => {
    it('should pass libraryPath option to ref add', async () => {
      const articles = [
        createArticle({ pmid: '12345678', title: 'Article' }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article')
      );

      await registerArticles(articles, baseOptions);

      expect(mockRefAdd).toHaveBeenCalledWith('pmid:12345678', {
        libraryPath: '/tmp/sessions/test-session-123/references.json',
      });
    });
  });

  describe('progress callback', () => {
    it('should call onProgress callback for each article', async () => {
      const articles = [
        createArticle({ pmid: '11111111', title: 'Article 1' }),
        createArticle({ pmid: '22222222', title: 'Article 2' }),
        createArticle({ title: 'No ID' }), // Should also trigger progress
      ];

      mockRefAdd
        .mockResolvedValueOnce(createRefAddOutput('pmid:11111111', 'smith2024', 'Article 1'))
        .mockResolvedValueOnce(createRefAddOutput('pmid:22222222', 'jones2024', 'Article 2'));

      const onProgress = vi.fn();
      await registerArticles(articles, { ...baseOptions, onProgress });

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
      expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
    });
  });

  describe('registration record metadata', () => {
    it('should include sessionId in the record', async () => {
      const articles = [createArticle({ pmid: '12345678', title: 'Article' })];
      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article')
      );

      const result = await registerArticles(articles, baseOptions);

      expect(result.sessionId).toBe('test-session-123');
    });

    it('should include timestamp in ISO format', async () => {
      const articles = [createArticle({ pmid: '12345678', title: 'Article' })];
      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article')
      );

      const result = await registerArticles(articles, baseOptions);

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('withAbstracts option', () => {
    it('should call ref update with abstract when withAbstracts is enabled', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article with Abstract',
          abstract: 'This is the abstract text.',
        }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article with Abstract')
      );
      mockRefExport.mockResolvedValueOnce({ abstract: undefined }); // No existing abstract
      mockRefUpdate.mockResolvedValueOnce(undefined);

      await registerArticles(articles, { ...baseOptions, withAbstracts: true });

      expect(mockRefUpdate).toHaveBeenCalledTimes(1);
      expect(mockRefUpdate).toHaveBeenCalledWith(
        'smith2024',
        'abstract',
        'This is the abstract text.',
        expect.any(Object)
      );
    });

    it('should not call ref update when withAbstracts is disabled', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          abstract: 'Abstract text',
        }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article')
      );

      await registerArticles(articles, baseOptions); // withAbstracts is false by default

      expect(mockRefUpdate).not.toHaveBeenCalled();
    });

    it('should skip ref update if article has no abstract', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article without Abstract',
        }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article without Abstract')
      );

      await registerArticles(articles, { ...baseOptions, withAbstracts: true });

      expect(mockRefUpdate).not.toHaveBeenCalled();
    });

    it('should skip ref update if ref entry already has abstract', async () => {
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          abstract: 'New abstract',
        }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article')
      );
      mockRefExport.mockResolvedValueOnce({ abstract: 'Existing abstract' });

      await registerArticles(articles, { ...baseOptions, withAbstracts: true });

      expect(mockRefUpdate).not.toHaveBeenCalled();
    });

    it('should handle special characters in abstract', async () => {
      const abstractWithSpecialChars = 'Abstract with "quotes" and \\backslash\\ and $pecial chars.';
      const articles = [
        createArticle({
          pmid: '12345678',
          title: 'Article',
          abstract: abstractWithSpecialChars,
        }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article')
      );
      mockRefExport.mockResolvedValueOnce({ abstract: undefined });
      mockRefUpdate.mockResolvedValueOnce(undefined);

      await registerArticles(articles, { ...baseOptions, withAbstracts: true });

      expect(mockRefUpdate).toHaveBeenCalledWith(
        'smith2024',
        'abstract',
        abstractWithSpecialChars,
        expect.any(Object)
      );
    });

    it('should continue with other articles if ref update fails', async () => {
      const articles = [
        createArticle({ pmid: '11111111', title: 'Article 1', abstract: 'Abstract 1' }),
        createArticle({ pmid: '22222222', title: 'Article 2', abstract: 'Abstract 2' }),
      ];

      mockRefAdd
        .mockResolvedValueOnce(createRefAddOutput('pmid:11111111', 'smith2024', 'Article 1'))
        .mockResolvedValueOnce(createRefAddOutput('pmid:22222222', 'jones2024', 'Article 2'));
      mockRefExport
        .mockResolvedValueOnce({ abstract: undefined })
        .mockResolvedValueOnce({ abstract: undefined });
      mockRefUpdate
        .mockRejectedValueOnce(new Error('Update failed'))
        .mockResolvedValueOnce(undefined);

      const result = await registerArticles(articles, { ...baseOptions, withAbstracts: true });

      // Both articles should still be registered successfully
      expect(result.summary.added).toBe(2);
      expect(mockRefUpdate).toHaveBeenCalledTimes(2);
    });

    it('should handle ref export failure gracefully', async () => {
      const articles = [
        createArticle({ pmid: '12345678', title: 'Article', abstract: 'Abstract' }),
      ];

      mockRefAdd.mockResolvedValueOnce(
        createRefAddOutput('pmid:12345678', 'smith2024', 'Article')
      );
      mockRefExport.mockRejectedValueOnce(new Error('Export failed'));
      // Should still try to update if export fails
      mockRefUpdate.mockResolvedValueOnce(undefined);

      await registerArticles(articles, { ...baseOptions, withAbstracts: true });

      // Should still try to update since we can't confirm there's an existing abstract
      expect(mockRefUpdate).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Registration Record Storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-test-'));
  });

  afterEach(async () => {
    const fs = await import('node:fs/promises');
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('saveRegistrationRecord', () => {
    it('should save record to session directory as registration.json', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
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
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
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
      expect(await fs.access(filePath).then(() => true).catch(() => false)).toBe(true);
    });

    it('should format JSON with indentation', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
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
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
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
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const filePath = path.join(tempDir, 'registration.json');
      await fs.writeFile(filePath, 'not valid json');

      await expect(loadRegistrationRecord(tempDir)).rejects.toThrow();
    });

    it('should throw error if file contains invalid schema', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const filePath = path.join(tempDir, 'registration.json');
      await fs.writeFile(filePath, JSON.stringify({ invalid: 'data' }));

      await expect(loadRegistrationRecord(tempDir)).rejects.toThrow();
    });
  });
});
