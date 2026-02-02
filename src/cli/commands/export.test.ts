import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseExportOptions,
  validateExportInput,
  formatIds,
  formatJson,
  formatJsonl,
  deduplicateArticles,
} from './export.js';
import type { Article } from '../../providers/base/types.js';

const mockArticles: Article[] = [
  {
    doi: '10.1234/article1',
    pmid: '12345678',
    title: 'Test Article 1',
    authors: [{ family: 'Doe', given: 'John' }],
    source: 'pubmed',
    retrievedAt: '2024-01-15T10:00:00Z',
  },
  {
    doi: '10.1234/article2',
    title: 'Test Article 2',
    authors: [{ family: 'Smith', given: 'Jane' }],
    source: 'eric',
    retrievedAt: '2024-01-15T10:01:00Z',
    ericId: 'ED123456',
  },
  {
    arxivId: '2401.12345',
    title: 'Test Article 3',
    authors: [{ family: 'Wilson', given: 'Bob' }],
    source: 'arxiv',
    retrievedAt: '2024-01-15T10:02:00Z',
  },
];

describe('export command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseExportOptions', () => {
    it('should parse session id', () => {
      const result = parseExportOptions('session-123', {});

      expect(result.sessionId).toBe('session-123');
    });

    it('should parse format option', () => {
      const result = parseExportOptions('session-123', {
        format: 'json',
      });

      expect(result.format).toBe('json');
    });

    it('should default to jsonl format', () => {
      const result = parseExportOptions('session-123', {});

      expect(result.format).toBe('jsonl');
    });

    it('should parse output path', () => {
      const result = parseExportOptions('session-123', {
        output: '/path/to/output.json',
      });

      expect(result.outputPath).toBe('/path/to/output.json');
    });

    it('should parse provider filter', () => {
      const result = parseExportOptions('session-123', {
        db: 'pubmed,eric',
      });

      expect(result.providers).toEqual(['pubmed', 'eric']);
    });

    it('should parse id-type option', () => {
      const result = parseExportOptions('session-123', {
        idType: 'doi',
      });

      expect(result.idType).toBe('doi');
    });
  });

  describe('validateExportInput', () => {
    it('should accept valid session id', () => {
      const result = validateExportInput({
        sessionId: 'session-123',
        format: 'json',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject empty session id', () => {
      const result = validateExportInput({
        sessionId: '',
        format: 'json',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('session');
    });

    it('should reject invalid format', () => {
      const result = validateExportInput({
        sessionId: 'session-123',
        format: 'invalid' as 'json',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should reject id-type without ids format', () => {
      const result = validateExportInput({
        sessionId: 'session-123',
        format: 'json',
        idType: 'doi',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('ids');
    });

    it('should accept id-type with ids format', () => {
      const result = validateExportInput({
        sessionId: 'session-123',
        format: 'ids',
        idType: 'doi',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('formatIds', () => {
    it('should extract DOIs when idType is doi', () => {
      const result = formatIds(mockArticles, 'doi');

      expect(result).toContain('10.1234/article1');
      expect(result).toContain('10.1234/article2');
      expect(result).not.toContain('12345678');
    });

    it('should extract PMIDs when idType is pmid', () => {
      const result = formatIds(mockArticles, 'pmid');

      expect(result).toContain('12345678');
      expect(result).not.toContain('10.1234/article1');
    });

    it('should extract all IDs when idType is all', () => {
      const result = formatIds(mockArticles, 'all');

      expect(result).toContain('doi:10.1234/article1');
      expect(result).toContain('pmid:12345678');
      expect(result).toContain('doi:10.1234/article2');
      expect(result).toContain('eric:ED123456');
      expect(result).toContain('arxiv:2401.12345');
    });

    it('should skip articles without requested ID', () => {
      const result = formatIds(mockArticles, 'pmid');
      const lines = result.trim().split('\n');

      // Only one article has PMID
      expect(lines).toHaveLength(1);
    });
  });

  describe('formatJson', () => {
    it('should format articles as JSON array', () => {
      const result = formatJson(mockArticles);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].title).toBe('Test Article 1');
    });

    it('should format with pretty printing', () => {
      const result = formatJson(mockArticles);

      expect(result).toContain('\n');
      expect(result).toContain('  '); // indentation
    });

    it('should handle empty array', () => {
      const result = formatJson([]);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual([]);
    });
  });

  describe('formatJsonl', () => {
    it('should format each article as separate JSON line', () => {
      const result = formatJsonl(mockArticles);
      const lines = result.trim().split('\n');

      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0]!).title).toBe('Test Article 1');
      expect(JSON.parse(lines[1]!).title).toBe('Test Article 2');
      expect(JSON.parse(lines[2]!).title).toBe('Test Article 3');
    });

    it('should handle empty array', () => {
      const result = formatJsonl([]);

      expect(result).toBe('');
    });
  });

  describe('deduplicateArticles', () => {
    describe('within-provider deduplication (by PMID)', () => {
      it('should remove duplicate articles with the same PMID', () => {
        const articlesWithDuplicates: Article[] = [
          {
            pmid: '41541042',
            doi: '10.1234/dup1',
            title: 'Duplicate Article First',
            authors: [{ family: 'Doe', given: 'John' }],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
          {
            pmid: '99999999',
            title: 'Unique Article',
            authors: [{ family: 'Smith', given: 'Jane' }],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:01:00Z',
          },
          {
            pmid: '41541042',
            doi: '10.1234/dup1',
            title: 'Duplicate Article Second',
            authors: [{ family: 'Doe', given: 'John' }],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:02:00Z',
          },
        ];

        const result = deduplicateArticles(articlesWithDuplicates);

        expect(result.articles).toHaveLength(2);
        expect(result.duplicatesRemoved).toBe(1);
      });

      it('should keep the first occurrence (preserving retrieval order)', () => {
        const articlesWithDuplicates: Article[] = [
          {
            pmid: '41541042',
            title: 'First Occurrence',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
          {
            pmid: '41541042',
            title: 'Second Occurrence',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:01:00Z',
          },
        ];

        const result = deduplicateArticles(articlesWithDuplicates);

        expect(result.articles).toHaveLength(1);
        expect(result.articles[0]!.title).toBe('First Occurrence');
      });

      it('should report the number of duplicates removed', () => {
        const articlesWithDuplicates: Article[] = [
          {
            pmid: '11111111',
            title: 'Article A',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
          {
            pmid: '22222222',
            title: 'Article B',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:01:00Z',
          },
          {
            pmid: '11111111',
            title: 'Article A dup',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:02:00Z',
          },
          {
            pmid: '22222222',
            title: 'Article B dup',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:03:00Z',
          },
          {
            pmid: '11111111',
            title: 'Article A dup2',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:04:00Z',
          },
        ];

        const result = deduplicateArticles(articlesWithDuplicates);

        expect(result.articles).toHaveLength(2);
        expect(result.duplicatesRemoved).toBe(3);
      });

      it('should not remove articles without identifiers', () => {
        const articles: Article[] = [
          {
            title: 'No ID Article 1',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
          {
            title: 'No ID Article 2',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:01:00Z',
          },
        ];

        const result = deduplicateArticles(articles);

        expect(result.articles).toHaveLength(2);
        expect(result.duplicatesRemoved).toBe(0);
      });

      it('should handle empty array', () => {
        const result = deduplicateArticles([]);

        expect(result.articles).toHaveLength(0);
        expect(result.duplicatesRemoved).toBe(0);
      });

      it('should handle array with no duplicates', () => {
        const result = deduplicateArticles(mockArticles);

        expect(result.articles).toHaveLength(3);
        expect(result.duplicatesRemoved).toBe(0);
      });
    });

    describe('cross-provider deduplication (by DOI)', () => {
      it('should deduplicate articles with the same DOI from different providers', () => {
        const articles: Article[] = [
          {
            pmid: '12345678',
            doi: '10.1234/shared-article',
            title: 'Shared Article from PubMed',
            authors: [{ family: 'Doe', given: 'John' }],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:00:00Z',
            abstract: 'Full abstract from PubMed',
            journal: 'Journal of Testing',
          },
          {
            scopusId: 'SCOPUS-999',
            doi: '10.1234/shared-article',
            title: 'Shared Article from Scopus',
            authors: [{ family: 'Doe', given: 'J.' }],
            source: 'scopus',
            retrievedAt: '2024-01-15T10:01:00Z',
          },
        ];

        const result = deduplicateArticles(articles);

        expect(result.articles).toHaveLength(1);
        expect(result.duplicatesRemoved).toBe(1);
      });

      it('should prefer the record with more metadata when DOI matches', () => {
        // Scopus record has less metadata - appears first
        const articles: Article[] = [
          {
            scopusId: 'SCOPUS-999',
            doi: '10.1234/shared-article',
            title: 'Shared Article',
            authors: [{ family: 'Doe', given: 'J.' }],
            source: 'scopus',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
          {
            pmid: '12345678',
            doi: '10.1234/shared-article',
            title: 'Shared Article with Full Data',
            authors: [{ family: 'Doe', given: 'John' }],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:01:00Z',
            abstract: 'Full abstract',
            journal: 'Journal of Testing',
            volume: '42',
            issue: '3',
            pages: '100-110',
          },
        ];

        const result = deduplicateArticles(articles);

        expect(result.articles).toHaveLength(1);
        expect(result.duplicatesRemoved).toBe(1);
        // Should keep the PubMed record (more metadata)
        expect(result.articles[0]!.source).toBe('pubmed');
        expect(result.articles[0]!.abstract).toBe('Full abstract');
        expect(result.articles[0]!.pmid).toBe('12345678');
      });

      it('should keep the first record when metadata count is equal', () => {
        const articles: Article[] = [
          {
            doi: '10.1234/equal-metadata',
            title: 'Article from ERIC',
            authors: [],
            source: 'eric',
            ericId: 'ED111111',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
          {
            doi: '10.1234/equal-metadata',
            title: 'Article from arXiv',
            authors: [],
            source: 'arxiv',
            arxivId: '2401.99999',
            retrievedAt: '2024-01-15T10:01:00Z',
          },
        ];

        const result = deduplicateArticles(articles);

        expect(result.articles).toHaveLength(1);
        // When metadata count is equal, first occurrence wins
        expect(result.articles[0]!.source).toBe('eric');
      });

      it('should handle DOI case-insensitively', () => {
        const articles: Article[] = [
          {
            doi: '10.1234/CASE-TEST',
            title: 'Article 1',
            authors: [],
            source: 'pubmed',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
          {
            doi: '10.1234/case-test',
            title: 'Article 2',
            authors: [],
            source: 'scopus',
            retrievedAt: '2024-01-15T10:01:00Z',
          },
        ];

        const result = deduplicateArticles(articles);

        expect(result.articles).toHaveLength(1);
        expect(result.duplicatesRemoved).toBe(1);
      });
    });
  });
});
