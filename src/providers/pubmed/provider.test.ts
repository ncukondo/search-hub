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
      mockClientInstance.search
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'test[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const p = (async () => {
        for await (const _ of provider.search(query)) {
          // Should throw
        }
      })();
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(p).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('propagates rate limit errors', async () => {
      const rateLimitError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        provider: 'pubmed',
        retryable: true,
        retryAfter: 5000,
      };
      mockClientInstance.search
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError);

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'test[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const p = (async () => {
        for await (const _ of provider.search(query)) {
          // Should throw
        }
      })();
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(p).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    });
  });

  describe('retry behavior', () => {
    const retryQuery: TranslatedQuery = {
      native: 'test[tiab]',
      originalAst: createMockQueryAST(),
      provider: 'pubmed',
    };

    it('retries on RATE_LIMIT_EXCEEDED and succeeds', async () => {
      const rateLimitError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        provider: 'pubmed',
        retryable: true,
        retryAfter: 1000,
      };

      mockClientInstance.search
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          count: 1, retmax: 20, retstart: 0, idlist: ['12345678'],
        });
      mockClientInstance.fetch.mockResolvedValueOnce([createMockArticle('12345678')]);

      const provider = new PubMedProvider(baseConfig);
      const articles: Article[] = [];
      const p = (async () => { for await (const a of provider.search(retryQuery)) articles.push(a); })();
      await vi.advanceTimersByTimeAsync(5000);
      await p;

      expect(articles).toHaveLength(1);
      expect(mockClientInstance.search).toHaveBeenCalledTimes(2);
    });

    it('retries on SERVER_ERROR and succeeds', async () => {
      const serverError = {
        code: 'SERVER_ERROR',
        message: 'Server error: 500',
        provider: 'pubmed',
        retryable: true,
      };

      mockClientInstance.search
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({
          count: 1, retmax: 20, retstart: 0, idlist: ['12345678'],
        });
      mockClientInstance.fetch.mockResolvedValueOnce([createMockArticle('12345678')]);

      const provider = new PubMedProvider(baseConfig);
      const articles: Article[] = [];
      const p = (async () => { for await (const a of provider.search(retryQuery)) articles.push(a); })();
      await vi.advanceTimersByTimeAsync(5000);
      await p;

      expect(articles).toHaveLength(1);
      expect(mockClientInstance.search).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on non-retryable PARSE_ERROR', async () => {
      const parseError = {
        code: 'PARSE_ERROR',
        message: 'Invalid query syntax',
        provider: 'pubmed',
        retryable: false,
      };
      mockClientInstance.search.mockRejectedValueOnce(parseError);
      const provider = new PubMedProvider(baseConfig);

      await expect(async () => {
        for await (const _ of provider.search(retryQuery)) { /* noop */ }
      }).rejects.toMatchObject({ code: 'PARSE_ERROR' });
      expect(mockClientInstance.search).toHaveBeenCalledTimes(1);
    });

    it('fails after exhausting configured retry count', async () => {
      const serverError = {
        code: 'SERVER_ERROR',
        message: 'Server error: 503',
        provider: 'pubmed',
        retryable: true,
      };
      mockClientInstance.search
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);
      const provider = new PubMedProvider({ ...baseConfig, retries: 2 });

      const p = (async () => {
        for await (const _ of provider.search(retryQuery)) { /* noop */ }
      })();
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(p).rejects.toMatchObject({ code: 'SERVER_ERROR' });
      // Initial attempt + 2 retries = 3 total calls
      expect(mockClientInstance.search).toHaveBeenCalledTimes(3);
    });
  });

  describe('session resume (Step 5a)', () => {
    it('getSearchState returns null before any search', () => {
      const provider = new PubMedProvider(baseConfig);
      expect(provider.getSearchState()).toBeNull();
    });

    it('getSearchState returns state after search starts', async () => {
      mockClientInstance.search.mockResolvedValueOnce({
        count: 10,
        retmax: 20,
        retstart: 0,
        idlist: ['12345678'],
      });

      mockClientInstance.fetch.mockResolvedValueOnce([createMockArticle('12345678')]);

      const provider = new PubMedProvider(baseConfig);
      const query: TranslatedQuery = {
        native: 'test[tiab]',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      // Start the search and consume first article
      const iterator = provider.search(query)[Symbol.asyncIterator]();
      await iterator.next();

      const state = provider.getSearchState();
      expect(state).not.toBeNull();
      expect(state!.provider).toBe('pubmed');
      expect(state!.totalResults).toBe(10);
      expect(state!.retrievedCount).toBe(1);
    });

    it('resumeSearch continues from offset without providerState', async () => {
      // Setup mock for resume
      mockClientInstance.search.mockResolvedValueOnce({
        count: 100,
        retmax: 20,
        retstart: 50,
        idlist: ['50', '51', '52'],
      });

      mockClientInstance.fetch.mockResolvedValueOnce([
        createMockArticle('50'),
        createMockArticle('51'),
        createMockArticle('52'),
      ]);

      const provider = new PubMedProvider(baseConfig);
      const savedState = {
        provider: 'pubmed' as const,
        query: {
          native: 'test[tiab]',
          originalAst: createMockQueryAST(),
          provider: 'pubmed' as const,
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
        // No providerState - will use offset pagination
      };

      const articles: Article[] = [];
      for await (const article of provider.resumeSearch(savedState)) {
        articles.push(article);
        if (articles.length >= 3) break; // Stop after first batch
      }

      expect(articles).toHaveLength(3);
      expect(mockClientInstance.search).toHaveBeenCalledWith(
        'test[tiab]',
        expect.objectContaining({ retstart: 50 })
      );
    });

    it('resumeSearch uses webenv/querykey from providerState', async () => {
      mockClientInstance.fetchFromHistory.mockResolvedValueOnce([
        createMockArticle('100'),
        createMockArticle('101'),
      ]);

      const provider = new PubMedProvider(baseConfig);
      const savedState = {
        provider: 'pubmed' as const,
        query: {
          native: 'test[tiab]',
          originalAst: createMockQueryAST(),
          provider: 'pubmed' as const,
        },
        totalResults: 102,
        retrievedCount: 100,
        lastUpdated: new Date(),
        providerState: {
          webenv: 'MCID_test123',
          querykey: '1',
          retstart: 100,
          useHistory: true,
        },
      };

      const articles: Article[] = [];
      for await (const article of provider.resumeSearch(savedState)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(2);
      expect(mockClientInstance.fetchFromHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          webenv: 'MCID_test123',
          querykey: '1',
          retstart: 100,
        })
      );
    });

    it('validateState returns valid for state without providerState', async () => {
      const provider = new PubMedProvider(baseConfig);
      const state = {
        provider: 'pubmed' as const,
        query: {
          native: 'test[tiab]',
          originalAst: createMockQueryAST(),
          provider: 'pubmed' as const,
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
      };

      const result = await provider.validateState(state);
      expect(result.valid).toBe(true);
    });

    it('validateState checks webenv validity', async () => {
      mockClientInstance.fetchFromHistory.mockResolvedValueOnce([createMockArticle('1')]);

      const provider = new PubMedProvider(baseConfig);
      const state = {
        provider: 'pubmed' as const,
        query: {
          native: 'test[tiab]',
          originalAst: createMockQueryAST(),
          provider: 'pubmed' as const,
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
        providerState: {
          webenv: 'MCID_valid123',
          querykey: '1',
          retstart: 50,
          useHistory: true,
        },
      };

      const result = await provider.validateState(state);
      expect(result.valid).toBe(true);
    });

    it('validateState returns invalid for expired webenv', async () => {
      mockClientInstance.fetchFromHistory.mockRejectedValueOnce(
        new Error('WebEnv expired')
      );

      const provider = new PubMedProvider(baseConfig);
      const state = {
        provider: 'pubmed' as const,
        query: {
          native: 'test[tiab]',
          originalAst: createMockQueryAST(),
          provider: 'pubmed' as const,
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
        providerState: {
          webenv: 'MCID_expired456',
          querykey: '1',
          retstart: 50,
          useHistory: true,
        },
      };

      const result = await provider.validateState(state);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Server-side history expired');
    });
  });
});
