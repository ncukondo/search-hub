/**
 * arXiv Provider API Tests
 *
 * These tests call the actual arXiv API and should be run separately:
 *   npm run test:api
 *
 * Requirements:
 * - Network access to arXiv API (export.arxiv.org)
 *
 * Note: Tests are slow due to arXiv's strict rate limiting (1 request per 3 seconds)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ArxivProvider } from './provider.js';
import { translateQuery } from './translator.js';
import type { QueryAST } from '../../query/types.js';
import type { ArxivPaper } from './types.js';

describe('arXiv Provider E2E', () => {
  let provider: ArxivProvider;

  beforeAll(() => {
    provider = new ArxivProvider();
  });

  describe('testConnection', () => {
    it('should connect to arXiv API successfully', async () => {
      const result = await provider.testConnection();
      expect(result).toEqual({ ok: true });
    }, 30000); // 30 second timeout
  });

  describe('search', () => {
    it('should search arXiv with simple query and return results', async () => {
      const ast: QueryAST = {
        name: 'test-query',
        blocks: [
          {
            field: 'title',
            terms: { keywords: ['quantum computing'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };

      const query = translateQuery(ast);
      const articles = [];

      for await (const article of provider.search(query, { maxResults: 3 })) {
        articles.push(article);
      }

      expect(articles.length).toBeGreaterThan(0);
      expect(articles.length).toBeLessThanOrEqual(3);

      // Verify article structure
      const firstArticle = articles[0];
      expect(firstArticle?.arxivId).toBeDefined();
      expect(firstArticle?.title).toBeDefined();
      expect(firstArticle?.source).toBe('arxiv');
      expect(firstArticle?.retrievedAt).toBeDefined();
    }, 60000); // 60 second timeout (rate limiting)

    it('should search with field prefixes', async () => {
      const ast: QueryAST = {
        name: 'test-query',
        blocks: [
          {
            field: 'author',
            terms: { keywords: ['Smith'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };

      const query = translateQuery(ast);
      expect(query.native).toContain('au:');

      const articles = [];
      for await (const article of provider.search(query, { maxResults: 2 })) {
        articles.push(article);
      }

      expect(articles.length).toBeGreaterThan(0);
    }, 60000);

    it('should search with category filter', async () => {
      const ast: QueryAST = {
        name: 'test-query',
        blocks: [
          {
            field: 'all',
            terms: { keywords: ['machine learning'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {
          arxiv: {
            categories: ['cs.AI'],
          },
        },
      };

      const query = translateQuery(ast);
      expect(query.native).toContain('cat:cs.AI');

      const articles = [];
      for await (const article of provider.search(query, { maxResults: 2 })) {
        articles.push(article);
      }

      expect(articles.length).toBeGreaterThan(0);
      // Articles should be in cs.AI category
      const firstArticle = articles[0] as ArxivPaper | undefined;
      if (firstArticle?.categories) {
        expect(firstArticle.categories.some((c: string) => c.startsWith('cs.'))).toBe(true);
      }
    }, 60000);

    it('should extract paper metadata correctly', async () => {
      const ast: QueryAST = {
        name: 'test-query',
        blocks: [
          {
            field: 'title',
            terms: { keywords: ['neural network'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };

      const query = translateQuery(ast);
      const articles = [];

      for await (const article of provider.search(query, { maxResults: 1 })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
      const article = articles[0]!;

      // Check required fields
      expect(article.arxivId).toMatch(/^\d{4}\.\d+$/); // New format: YYMM.NNNNN
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.authors.length).toBeGreaterThan(0);
      expect(article.source).toBe('arxiv');

      // Check that at least some optional fields are present
      const hasOptionalData =
        article.abstract !== undefined ||
        article.publicationDate !== undefined ||
        (article as { primaryCategory?: string }).primaryCategory !== undefined;
      expect(hasOptionalData).toBe(true);
    }, 60000);
  });

  describe('session resume', () => {
    it('should save and report search state', async () => {
      const ast: QueryAST = {
        name: 'test-query',
        blocks: [
          {
            field: 'title',
            terms: { keywords: ['physics'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };

      const query = translateQuery(ast);
      const iterator = provider.search(query, { maxResults: 5 })[Symbol.asyncIterator]();

      // Get first result
      await iterator.next();

      // Check state is available
      const state = provider.getSearchState();
      expect(state).not.toBeNull();
      expect(state?.provider).toBe('arxiv');
      expect(state?.totalResults).toBeGreaterThan(0);
    }, 60000);

    it('should validate offset-based state as always valid', async () => {
      const ast: QueryAST = {
        name: 'test-query',
        blocks: [
          {
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };

      const query = translateQuery(ast);

      // Create a mock state
      const mockState = {
        provider: 'arxiv' as const,
        query,
        totalResults: 100,
        retrievedCount: 10,
        lastUpdated: new Date(),
        providerState: { offset: 10 },
      };

      const result = await provider.validateState(mockState);
      expect(result.valid).toBe(true);
    }, 30000);
  });
});
