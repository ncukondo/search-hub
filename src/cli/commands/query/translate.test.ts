import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateQueryCommand } from './translate.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');

const validYaml = `
name: test-query
description: A test query
query:
  - id: concept-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - insulin
    operator: OR
`;

describe('query translate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('translateQueryCommand', () => {
    it('should translate query for all providers', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml');

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      expect(Object.keys(result.translations!)).toContain('pubmed');
      expect(Object.keys(result.translations!)).toContain('eric');
      expect(Object.keys(result.translations!)).toContain('arxiv');
      expect(Object.keys(result.translations!)).toContain('scopus');
    });

    it('should translate query for specific provider', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml', {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      expect(Object.keys(result.translations!)).toEqual(['pubmed']);
    });

    it('should translate query for multiple specific providers', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml', {
        providers: ['pubmed', 'scopus'],
      });

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      expect(Object.keys(result.translations!).sort()).toEqual([
        'pubmed',
        'scopus',
      ]);
    });

    it('should return error for file read failure', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const result = await translateQueryCommand('/path/to/nonexistent.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('no such file');
    });

    it('should return error for invalid YAML', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('not: valid: yaml: content');

      const result = await translateQueryCommand('/path/to/invalid.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include native query string in translations', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml', {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      const pubmedTranslation = result.translations!['pubmed'];
      expect(pubmedTranslation).toBeDefined();
      expect(pubmedTranslation!.native).toBeDefined();
      expect(typeof pubmedTranslation!.native).toBe('string');
    });
  });
});
