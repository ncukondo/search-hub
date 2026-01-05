/**
 * Tests for PubMed Provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PubMedProvider } from './provider';
import { BaseProvider } from '../base/provider';
import type { QueryAST, TranslatedQuery, Article } from '../base/types';
import type { PubMedConfig, PubMedArticle } from './types';

// Mock the client module
vi.mock('./client', () => ({
  PubMedClient: vi.fn().mockImplementation(() => ({
    search: vi.fn(),
    fetch: vi.fn(),
    fetchFromHistory: vi.fn(),
  })),
}));

import { PubMedClient } from './client';

const MockPubMedClient = vi.mocked(PubMedClient);

/**
 * Helper to create a minimal QueryAST for testing.
 */
function createMockQueryAST(name = 'test-query'): QueryAST {
  return {
    name,
    blocks: [
      {
        field: 'title_abstract',
        operator: 'OR',
        terms: {
          keywords: ['diabetes'],
        },
      },
    ],
    filters: {},
    overrides: {},
  };
}

/**
 * Create mock PubMed article.
 */
function createMockArticle(pmid: string): PubMedArticle {
  return {
    pmid,
    source: 'pubmed',
    title: `Test Article ${pmid}`,
    authors: [{ family: 'Test' }],
    retrievedAt: new Date().toISOString(),
  };
}

describe('PubMedProvider', () => {
  const baseConfig: PubMedConfig = {
    email: 'test@example.com',
  };

  let mockClientInstance: {
    search: ReturnType<typeof vi.fn>;
    fetch: ReturnType<typeof vi.fn>;
    fetchFromHistory: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockClientInstance = {
      search: vi.fn(),
      fetch: vi.fn(),
      fetchFromHistory: vi.fn(),
    };

    MockPubMedClient.mockImplementation(() => mockClientInstance as unknown as InstanceType<typeof PubMedClient>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('interface implementation', () => {
    it('extends BaseProvider', () => {
      const provider = new PubMedProvider(baseConfig);
      expect(provider).toBeInstanceOf(BaseProvider);
    });

    it('has name "pubmed"', () => {
      const provider = new PubMedProvider(baseConfig);
      expect(provider.name).toBe('pubmed');
    });

    it('implements testConnection', async () => {
      mockClientInstance.search.mockResolvedValueOnce({
        count: 0,
        retmax: 1,
        retstart: 0,
        idlist: [],
      });

      const provider = new PubMedProvider(baseConfig);
      const result = await provider.testConnection();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('translateQuery', () => {
    it('converts QueryAST to PubMed native syntax', () => {
      const provider = new PubMedProvider(baseConfig);
      const ast = createMockQueryAST();
      const result = provider.translateQuery(ast);

      expect(result.provider).toBe('pubmed');
      expect(result.native).toContain('diabetes');
      expect(result.native).toContain('[tiab]');
      expect(result.originalAst).toBe(ast);
    });

    it('handles complex queries with MeSH terms', () => {
      const provider = new PubMedProvider(baseConfig);
      const ast: QueryAST = {
        name: 'complex-query',
        blocks: [
          {
            field: 'title_abstract',
            operator: 'OR',
            terms: {
              keywords: ['diabetes'],
              mesh: ['Diabetes Mellitus, Type 2'],
            },
          },
        ],
        filters: {},
        overrides: {},
      };
      const result = provider.translateQuery(ast);

      expect(result.native).toContain('[tiab]');
      expect(result.native).toContain('[mh]');
    });
  });

  describe('search', () => {
    it('returns async iterable of articles', async () => {
      mockClientInstance.search.mockResolvedValueOnce({
        count: 2,
        retmax: 20,
        retstart: 0,
        idlist: ['12345678', '23456789'],
      });

      mockClientInstance.fetch.mockResolvedValueOnce([
        createMockArticle('12345678'),
        createMockArticle('23456789'),
      ]);

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'diabetes[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(2);
      expect(articles[0]!.title).toContain('12345678');
    });

    it('handles empty search results', async () => {
      mockClientInstance.search.mockResolvedValueOnce({
        count: 0,
        retmax: 20,
        retstart: 0,
        idlist: [],
      });

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'nonexistent[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(0);
      expect(mockClientInstance.fetch).not.toHaveBeenCalled();
    });

    it('paginates through large result sets', async () => {
      // First page
      mockClientInstance.search.mockResolvedValueOnce({
        count: 25,
        retmax: 20,
        retstart: 0,
        idlist: Array.from({ length: 20 }, (_, i) => String(i + 1)),
      });

      // Second page
      mockClientInstance.search.mockResolvedValueOnce({
        count: 25,
        retmax: 20,
        retstart: 20,
        idlist: Array.from({ length: 5 }, (_, i) => String(i + 21)),
      });

      // Fetch responses
      mockClientInstance.fetch.mockImplementation((pmids: string[]) =>
        Promise.resolve(pmids.map((pmid: string) => createMockArticle(pmid)))
      );

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'test[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(25);
      expect(mockClientInstance.search).toHaveBeenCalledTimes(2);
      expect(mockClientInstance.fetch).toHaveBeenCalledTimes(2);
    });

    it('respects maxResults option', async () => {
      mockClientInstance.search.mockResolvedValueOnce({
        count: 100,
        retmax: 20,
        retstart: 0,
        idlist: Array.from({ length: 20 }, (_, i) => String(i + 1)),
      });

      mockClientInstance.fetch.mockImplementation((pmids: string[]) =>
        Promise.resolve(pmids.map((pmid: string) => createMockArticle(pmid)))
      );

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'test[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query, { maxResults: 10 })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(10);
    });
  });

  describe('testConnection', () => {
    it('returns true on successful API call', async () => {
      mockClientInstance.search.mockResolvedValueOnce({
        count: 0,
        retmax: 1,
        retstart: 0,
        idlist: [],
      });

      const provider = new PubMedProvider(baseConfig);
      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(mockClientInstance.search).toHaveBeenCalledWith('test', { retmax: 1 });
    });

    it('returns false on API error', async () => {
      mockClientInstance.search.mockRejectedValueOnce(new Error('API Error'));

      const provider = new PubMedProvider(baseConfig);
      const result = await provider.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('propagates network errors', async () => {
      const networkError = {
        code: 'NETWORK_ERROR',
        message: 'Network failed',
        provider: 'pubmed',
        retryable: true,
      };
      mockClientInstance.search.mockRejectedValueOnce(networkError);

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'test[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // Should throw
        }
      }).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('propagates rate limit errors', async () => {
      const rateLimitError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        provider: 'pubmed',
        retryable: true,
        retryAfter: 5000,
      };
      mockClientInstance.search.mockRejectedValueOnce(rateLimitError);

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'test[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // Should throw
        }
      }).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    });
  });
});
