import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseExportOptions,
  validateExportInput,
  formatIds,
  formatJson,
  formatJsonl,
  formatCslJson,
  deduplicateArticles,
  type JsonExportMetadata,
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

    it('should group identifiers per article separated by blank lines when idType is all', () => {
      const result = formatIds(mockArticles, 'all');
      const groups = result.split('\n\n');

      // 3 articles = 3 groups
      expect(groups).toHaveLength(3);

      // First article has pmid and doi
      expect(groups[0]).toContain('pmid:12345678');
      expect(groups[0]).toContain('doi:10.1234/article1');

      // Second article has doi and ericId
      expect(groups[1]).toContain('doi:10.1234/article2');
      expect(groups[1]).toContain('eric:ED123456');

      // Third article has only arxivId
      expect(groups[2]).toBe('arxiv:2401.12345');
    });

    it('should output pmid before doi within each group', () => {
      const result = formatIds(mockArticles, 'all');
      const groups = result.split('\n\n');

      // First article has both pmid and doi
      const lines = groups[0]!.split('\n');
      expect(lines[0]).toBe('pmid:12345678');
      expect(lines[1]).toBe('doi:10.1234/article1');
    });

    it('should show single line per group for articles with only one ID type', () => {
      const articlesWithSingleId: Article[] = [
        {
          title: 'Only PMID',
          authors: [],
          pmid: '11111111',
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
        {
          title: 'Only DOI',
          authors: [],
          doi: '10.9999/only-doi',
          source: 'scopus',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ];

      const result = formatIds(articlesWithSingleId, 'all');
      const groups = result.split('\n\n');

      expect(groups).toHaveLength(2);
      expect(groups[0]).toBe('pmid:11111111');
      expect(groups[1]).toBe('doi:10.9999/only-doi');
    });

    it('should skip articles without any IDs when idType is all', () => {
      const articlesWithNoIds: Article[] = [
        {
          title: 'Has PMID',
          authors: [],
          pmid: '11111111',
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
        {
          title: 'No IDs at all',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ];

      const result = formatIds(articlesWithNoIds, 'all');
      const groups = result.split('\n\n');

      expect(groups).toHaveLength(1);
      expect(groups[0]).toBe('pmid:11111111');
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

    it('should include year field extracted from publicationDate', () => {
      const articles: Article[] = [
        {
          title: 'Article with full date',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
          publicationDate: '2025-03-15',
        },
        {
          title: 'Article with year only',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
          publicationDate: '2025',
        },
        {
          title: 'Article with year-month',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
          publicationDate: '2025-03',
        },
        {
          title: 'Article without date',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ];

      const result = formatJson(articles);
      const parsed = JSON.parse(result);

      expect(parsed[0].year).toBe(2025);
      expect(parsed[1].year).toBe(2025);
      expect(parsed[2].year).toBe(2025);
      expect(parsed[3].year).toBeNull();
    });

    it('should produce bare array when metadata is not provided (backward compatible)', () => {
      const result = formatJson(mockArticles);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });

    it('should produce envelope with session, summary, results when metadata is provided', () => {
      const metadata: JsonExportMetadata = {
        sessionId: '20240115_diabetes-ai_a3f2c1',
        sessionName: 'diabetes_ai_scoping',
        createdAt: '2024-01-15T10:00:00Z',
        databases: { pubmed: 2, eric: 1 },
      };

      const result = formatJson(mockArticles, metadata);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('session');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('results');

      expect(parsed.session.id).toBe('20240115_diabetes-ai_a3f2c1');
      expect(parsed.session.name).toBe('diabetes_ai_scoping');
      expect(parsed.session.createdAt).toBe('2024-01-15T10:00:00Z');
    });

    it('should have summary.totalResults matching article count', () => {
      const metadata: JsonExportMetadata = {
        sessionId: 'test-session',
        sessionName: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        databases: { pubmed: 2, eric: 1 },
      };

      const result = formatJson(mockArticles, metadata);
      const parsed = JSON.parse(result);

      expect(parsed.summary.totalResults).toBe(mockArticles.length);
    });

    it('should have summary.databases matching per-database counts', () => {
      const metadata: JsonExportMetadata = {
        sessionId: 'test-session',
        sessionName: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        databases: { pubmed: 800, eric: 200 },
      };

      const result = formatJson(mockArticles, metadata);
      const parsed = JSON.parse(result);

      expect(parsed.summary.databases).toEqual({ pubmed: 800, eric: 200 });
    });

    it('should include year field in results within envelope', () => {
      const articles: Article[] = [
        {
          title: 'Article with date',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
          publicationDate: '2025-03-15',
        },
      ];

      const metadata: JsonExportMetadata = {
        sessionId: 'test-session',
        sessionName: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        databases: { pubmed: 1 },
      };

      const result = formatJson(articles, metadata);
      const parsed = JSON.parse(result);

      expect(parsed.results[0].year).toBe(2025);
    });

    it('should handle empty articles with metadata', () => {
      const metadata: JsonExportMetadata = {
        sessionId: 'empty-session',
        sessionName: 'empty',
        createdAt: '2024-01-15T10:00:00Z',
        databases: {},
      };

      const result = formatJson([], metadata);
      const parsed = JSON.parse(result);

      expect(parsed.session.id).toBe('empty-session');
      expect(parsed.summary.totalResults).toBe(0);
      expect(parsed.results).toEqual([]);
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

    it('should include year field extracted from publicationDate', () => {
      const articles: Article[] = [
        {
          title: 'Full date article',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
          publicationDate: '2025-03-15',
        },
        {
          title: 'No date article',
          authors: [],
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ];

      const result = formatJsonl(articles);
      const lines = result.trim().split('\n');

      expect(JSON.parse(lines[0]!).year).toBe(2025);
      expect(JSON.parse(lines[1]!).year).toBeNull();
    });
  });

  describe('formatCslJson', () => {
    it('should produce a valid CSL-JSON array', () => {
      const result = formatCslJson(mockArticles);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });

    it('should produce pretty-printed JSON (2-space indent)', () => {
      const result = formatCslJson(mockArticles);

      expect(result).toContain('\n');
      expect(result).toContain('  '); // 2-space indentation
      // Verify it matches expected pretty-print format
      const parsed = JSON.parse(result);
      expect(result).toBe(JSON.stringify(parsed, null, 2));
    });

    it('should map article fields correctly via articlesToCslJson()', () => {
      const articles: Article[] = [
        {
          title: 'Test CSL Article',
          authors: [{ family: 'Doe', given: 'John' }, { family: 'Smith', given: 'Jane' }],
          doi: '10.1234/test',
          pmid: '11111111',
          abstract: 'Test abstract',
          publicationDate: '2024-03-15',
          journal: 'Journal of Testing',
          volume: '42',
          issue: '3',
          pages: '100-110',
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ];

      const result = formatCslJson(articles);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(1);
      const item = parsed[0];
      expect(item.type).toBe('article-journal');
      expect(item.title).toBe('Test CSL Article');
      expect(item.author).toEqual([
        { family: 'Doe', given: 'John' },
        { family: 'Smith', given: 'Jane' },
      ]);
      expect(item.DOI).toBe('10.1234/test');
      expect(item.PMID).toBe('11111111');
      expect(item.abstract).toBe('Test abstract');
      expect(item.issued).toEqual({ 'date-parts': [[2024, 3, 15]] });
      expect(item['container-title']).toBe('Journal of Testing');
      expect(item.volume).toBe('42');
      expect(item.issue).toBe('3');
      expect(item.page).toBe('100-110');
    });

    it('should handle empty array', () => {
      const result = formatCslJson([]);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual([]);
    });

    it('should generate unique IDs for articles with same author/year', () => {
      const articles: Article[] = [
        {
          title: 'First Article',
          authors: [{ family: 'Smith', given: 'John' }],
          publicationDate: '2024-01-01',
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
        {
          title: 'Second Article',
          authors: [{ family: 'Smith', given: 'John' }],
          publicationDate: '2024-06-01',
          source: 'pubmed',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ];

      const result = formatCslJson(articles);
      const parsed = JSON.parse(result);

      expect(parsed[0].id).toBe('smith-2024');
      expect(parsed[1].id).toBe('smith-2024a');
    });
  });

  describe('validateExportInput with csl-json format', () => {
    it('should accept csl-json as a valid format', () => {
      const result = validateExportInput({
        sessionId: 'session-123',
        format: 'csl-json',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject id-type with csl-json format', () => {
      const result = validateExportInput({
        sessionId: 'session-123',
        format: 'csl-json',
        idType: 'doi',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('ids');
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
