/**
 * Tests for ERIC provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ERICProvider, type IERICClient } from './provider';
import type { TranslatedQuery, SearchOptions } from '../base/types';
import type { QueryAST } from '../../query/types';
import type { ERICSearchResult } from './parser';

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
            field: 'title',
            terms: { keywords: ['education'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };

      const result = provider.translateQuery(ast as unknown as Parameters<typeof provider.translateQuery>[0]);

      expect(result.provider).toBe('eric');
      expect(result.native).toBe('title:education');
    });

    it('should handle complex queries', () => {
      const ast: QueryAST = {
        name: 'test',
        blocks: [
          {
            field: 'title_abstract',
            terms: { keywords: ['special education', 'learning disabilities'] },
            operator: 'OR',
          },
        ],
        filters: {
          yearFrom: 2020,
          yearTo: 2024,
        },
        overrides: {},
      };

      const result = provider.translateQuery(ast as unknown as Parameters<typeof provider.translateQuery>[0]);

      expect(result.native).toContain('title:');
      expect(result.native).toContain('abstract:');
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
        originalAst: { type: 'query' },
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
        originalAst: { type: 'query' },
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
        originalAst: { type: 'query' },
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
        originalAst: { type: 'query' },
        provider: 'eric',
      };

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(0);
    });
  });

  describe('testConnection', () => {
    it('should return true when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: { numFound: 0, start: 0, docs: [] } }),
      });

      const result = await provider.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await provider.testConnection();
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.testConnection();
      expect(result).toBe(false);
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
        originalAst: { type: 'query' },
        provider: 'eric',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // consume
        }
      }).rejects.toThrow('API Error');
    });
  });
});
