/**
 * Tests for ERIC provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ERICProvider, type IERICClient } from './provider';
import type { TranslatedQuery, SearchOptions, QueryAST } from '../base/types';
import type { ERICSearchResult } from './parser';

/**
 * Helper to create a minimal QueryAST for testing.
 */
function createMockQueryAST(name = 'test-query'): QueryAST {
  return {
    name,
    blocks: [],
    filters: {},
    providers: {},
  };
}

// Mock fetch globally for testConnection
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ERIC Provider', () => {
  let provider: ERICProvider;
  let mockClient: IERICClient;
  let mockSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch.mockReset();
    mockSearch = vi.fn();
    mockClient = { search: mockSearch };
    provider = new ERICProvider({ client: mockClient });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provider interface', () => {
    it('should have name "eric"', () => {
      expect(provider.name).toBe('eric');
    });

    it('should implement Provider interface', () => {
      expect(typeof provider.search).toBe('function');
      expect(typeof provider.translateQuery).toBe('function');
      expect(typeof provider.testConnection).toBe('function');
    });
  });

  describe('translateQuery', () => {
    it('should translate QueryAST to ERIC native syntax', () => {
      const ast: QueryAST = {
        name: 'test',
        blocks: [
          {
            id: 'block-1',
            field: 'title',
            terms: { keywords: ['education'] },
            operator: 'OR',
          },
        ],
        filters: {},
        providers: {},
      };

      const result = provider.translateQuery(ast);

      expect(result.provider).toBe('eric');
      expect(result.native).toBe('title:education');
    });

    it('should handle complex queries', () => {
      const ast: QueryAST = {
        name: 'test',
        blocks: [
          {
            id: 'block-1',
            field: 'title_abstract',
            terms: { keywords: ['special education', 'learning disabilities'] },
            operator: 'OR',
          },
        ],
        filters: {
          yearFrom: 2020,
          yearTo: 2024,
        },
        providers: {},
      };

      const result = provider.translateQuery(ast);

      expect(result.native).toContain('title:');
      expect(result.native).toContain('description:');
      expect(result.native).toContain('publicationdateyear:[2020 TO 2024]');
    });
  });

  describe('search', () => {
    it('should return async iterable of articles', async () => {
      const mockResult: ERICSearchResult = {
        totalResults: 2,
        start: 0,
        documents: [
          {
            ericId: 'EJ123456',
            title: 'Test Article 1',
            authors: [],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          },
          {
            ericId: 'EJ123457',
            title: 'Test Article 2',
            authors: [],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          },
        ],
      };
      mockSearch.mockResolvedValueOnce(mockResult);

      const query: TranslatedQuery = {
        native: 'title:education',

        provider: 'eric',
      };

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(2);
    });

    it('should handle pagination (streams all results)', async () => {
      // First page
      mockSearch.mockResolvedValueOnce({
        totalResults: 150,
        start: 0,
        documents: Array(100)
          .fill(null)
          .map((_, i) => ({
            ericId: `EJ${100000 + i}`,
            title: `Article ${i}`,
            authors: [],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          })),
      } as ERICSearchResult);

      // Second page
      mockSearch.mockResolvedValueOnce({
        totalResults: 150,
        start: 100,
        documents: Array(50)
          .fill(null)
          .map((_, i) => ({
            ericId: `EJ${100100 + i}`,
            title: `Article ${100 + i}`,
            authors: [],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          })),
      } as ERICSearchResult);

      const query: TranslatedQuery = {
        native: 'title:education',

        provider: 'eric',
      };

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(150);
      expect(mockSearch).toHaveBeenCalledTimes(2);
    });

    it('should respect maxResults option', async () => {
      mockSearch.mockResolvedValueOnce({
        totalResults: 1000,
        start: 0,
        documents: Array(50)
          .fill(null)
          .map((_, i) => ({
            ericId: `EJ${100000 + i}`,
            title: `Article ${i}`,
            authors: [],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          })),
      } as ERICSearchResult);

      const query: TranslatedQuery = {
        native: 'title:education',

        provider: 'eric',
      };

      const options: SearchOptions = { maxResults: 50 };

      const articles: unknown[] = [];
      for await (const article of provider.search(query, options)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(50);
    });

    it('should handle empty results', async () => {
      mockSearch.mockResolvedValueOnce({
        totalResults: 0,
        start: 0,
        documents: [],
      } as ERICSearchResult);

      const query: TranslatedQuery = {
        native: 'title:nonexistent',

        provider: 'eric',
      };

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(0);
    });

    it('should emit warning when sort option is specified', async () => {
      const mockResult: ERICSearchResult = {
        totalResults: 1,
        start: 0,
        documents: [
          {
            ericId: 'ED123456',
            title: 'Test Education Article',
            authors: [{ family: 'Smith' }],
            source: 'eric',
            retrievedAt: expect.any(String) as unknown as string,
          },
        ],
      };
      mockSearch.mockResolvedValueOnce(mockResult);

      const query: TranslatedQuery = {
        native: 'title:education',
        provider: 'eric',
      };

      const articles: unknown[] = [];
      for await (const article of provider.search(query, { sort: 'relevance' })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
      const warnings = provider.getWarnings();
      expect(warnings).toContainEqual(expect.stringContaining('sort'));
    });

    it('should not emit warning when sort is not specified', async () => {
      const mockResult: ERICSearchResult = {
        totalResults: 1,
        start: 0,
        documents: [
          {
            ericId: 'ED123456',
            title: 'Test Education Article',
            authors: [{ family: 'Smith' }],
            source: 'eric',
            retrievedAt: expect.any(String) as unknown as string,
          },
        ],
      };
      mockSearch.mockResolvedValueOnce(mockResult);

      const query: TranslatedQuery = {
        native: 'title:education',
        provider: 'eric',
      };

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
      const warnings = provider.getWarnings();
      expect(warnings).toHaveLength(0);
    });
  });

  describe('testConnection', () => {
    it('should return { ok: true } when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: { numFound: 0, start: 0, docs: [] } }),
      });

      const result = await provider.testConnection();
      expect(result).toEqual({ ok: true });
    });

    it('should return { ok: false } when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return { ok: false } on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('should have rate limiter from BaseProvider', () => {
      // Provider should have rate limiter from BaseProvider
      expect(provider['rateLimiter']).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should propagate errors from client', async () => {
      mockSearch.mockRejectedValueOnce(new Error('API Error'));

      const query: TranslatedQuery = {
        native: 'title:test',

        provider: 'eric',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // consume
        }
      }).rejects.toThrow('API Error');
    });

    it('should propagate network errors with ERIC context', async () => {
      // Create provider with retries disabled for fast test
      const noRetryProvider = new ERICProvider({ client: mockClient, retries: 0 });
      const networkError = {
        code: 'NETWORK_ERROR',
        message: 'Failed to connect to ERIC API. This may be due to network issues.',
        provider: 'eric',
        retryable: true,
      };
      mockSearch.mockRejectedValueOnce(networkError);

      const query: TranslatedQuery = {
        native: 'title:test',

        provider: 'eric',
      };

      await expect(async () => {
        for await (const _ of noRetryProvider.search(query)) {
          // consume
        }
      }).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        provider: 'eric',
        retryable: true,
      });
    });

    it('should propagate timeout errors with ERIC context', async () => {
      // Create provider with retries disabled for fast test
      const noRetryProvider = new ERICProvider({ client: mockClient, retries: 0 });
      const timeoutError = {
        code: 'TIMEOUT',
        message: 'ERIC API request timed out or was aborted.',
        provider: 'eric',
        retryable: true,
      };
      mockSearch.mockRejectedValueOnce(timeoutError);

      const query: TranslatedQuery = {
        native: 'title:test',

        provider: 'eric',
      };

      await expect(async () => {
        for await (const _ of noRetryProvider.search(query)) {
          // consume
        }
      }).rejects.toMatchObject({
        code: 'TIMEOUT',
        provider: 'eric',
        retryable: true,
      });
    });

    it('should propagate parse errors for malformed responses', async () => {
      const parseError = {
        code: 'PARSE_ERROR',
        message: "ERIC API error: Unexpected response format (missing 'numFound').",
        provider: 'eric',
        retryable: false,
      };
      mockSearch.mockRejectedValueOnce(parseError);

      const query: TranslatedQuery = {
        native: 'title:test',

        provider: 'eric',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // consume
        }
      }).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        provider: 'eric',
        retryable: false,
      });
    });
  });

  describe('Session Resume (Step 5a)', () => {
    it('should return null when no search in progress', () => {
      const state = provider.getSearchState();
      expect(state).toBeNull();
    });

    it('should return offset-based state after search starts', async () => {
      mockSearch.mockResolvedValueOnce({
        totalResults: 100,
        start: 0,
        documents: Array(50)
          .fill(null)
          .map((_, i) => ({
            ericId: `EJ${100000 + i}`,
            title: `Article ${i}`,
            authors: [],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          })),
      } as ERICSearchResult);

      const query: TranslatedQuery = {
        native: 'title:education',

        provider: 'eric',
      };

      // Start search and consume some results
      let count = 0;
      for await (const _ of provider.search(query, { maxResults: 50 })) {
        count++;
      }
      expect(count).toBe(50);

      // Get search state
      const state = provider.getSearchState();
      expect(state).not.toBeNull();
      expect(state!.provider).toBe('eric');
      expect(state!.totalResults).toBe(100);
      expect(state!.retrievedCount).toBe(50);
      expect(state!.providerState).toEqual({
        offset: 50,
        pageSize: 100,
      });
    });

    it('should validate state always returns true (offset-based)', async () => {
      const state = {
        provider: 'eric' as const,
        query: {
          native: 'title:test',
  
          provider: 'eric' as const,
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
        providerState: { offset: 50, pageSize: 100 },
      };

      const result = await provider.validateState(state);
      expect(result.valid).toBe(true);
    });

    it('should resume search from saved offset', async () => {
      // Set up mock for resumed search
      mockSearch.mockResolvedValueOnce({
        totalResults: 100,
        start: 50,
        documents: Array(50)
          .fill(null)
          .map((_, i) => ({
            ericId: `EJ${100050 + i}`,
            title: `Article ${50 + i}`,
            authors: [],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          })),
      } as ERICSearchResult);

      const state = {
        provider: 'eric' as const,
        query: {
          native: 'title:education',
  
          provider: 'eric' as const,
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
        providerState: { offset: 50, pageSize: 100 },
      };

      const articles: unknown[] = [];
      for await (const article of provider.resumeSearch(state)) {
        articles.push(article);
      }

      // Should get remaining 50 articles
      expect(articles).toHaveLength(50);
    });
  });

  describe('count', () => {
    it('should return total hit count without fetching results', async () => {
      mockSearch.mockResolvedValueOnce({
        totalResults: 42,
        documents: [],
      });

      const query: TranslatedQuery = {
        native: 'education AND technology',
        provider: 'eric',
      };

      const count = await provider.count(query);

      expect(count).toBe(42);
      expect(mockSearch).toHaveBeenCalledWith('education AND technology', { start: 0, rows: 0 });
    });

    it('should return 0 for queries with no results', async () => {
      mockSearch.mockResolvedValueOnce({
        totalResults: 0,
        documents: [],
      });

      const query: TranslatedQuery = {
        native: 'nonexistent_xyz',
        provider: 'eric',
      };

      const count = await provider.count(query);
      expect(count).toBe(0);
    });
  });
});
