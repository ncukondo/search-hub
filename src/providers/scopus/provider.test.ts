/**
 * Scopus Provider Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScopusProvider } from './provider';
import type { ScopusConfig } from './types';
import type { QueryAST } from '../../query/types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ScopusProvider', () => {
  const config: ScopusConfig = {
    apiKey: 'test-api-key',
    rateLimit: 10, // High limit for tests
    timeout: 30000,
    retries: 3,
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('interface', () => {
    it('should have name "scopus"', () => {
      const provider = new ScopusProvider(config);
      expect(provider.name).toBe('scopus');
    });
  });

  describe('translateQuery', () => {
    it('should translate QueryAST to Scopus syntax', () => {
      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };

      const result = provider.translateQuery(ast);
      expect(result.native).toBe('TITLE(diabetes)');
      expect(result.provider).toBe('scopus');
    });
  });

  describe('search', () => {
    it('should return async iterable of articles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '2',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [
              {
                'dc:identifier': 'SCOPUS_ID:1',
                'dc:title': 'Article 1',
                'dc:creator': 'Smith J.',
              },
              {
                'dc:identifier': 'SCOPUS_ID:2',
                'dc:title': 'Article 2',
                'dc:creator': 'Doe J.',
              },
            ],
          },
        }),
      });

      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        overrides: {},
      };
      const query = provider.translateQuery(ast);

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(2);
      expect(articles[0]).toMatchObject({
        scopusId: 'SCOPUS_ID:1',
        title: 'Article 1',
        source: 'scopus',
      });
    });

    it('should handle pagination for large result sets', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '50',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: Array.from({ length: 25 }, (_, i) => ({
              'dc:identifier': `SCOPUS_ID:${i}`,
              'dc:title': `Article ${i}`,
            })),
          },
        }),
      });

      // Second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '50',
            'opensearch:startIndex': '25',
            'opensearch:itemsPerPage': '25',
            entry: Array.from({ length: 25 }, (_, i) => ({
              'dc:identifier': `SCOPUS_ID:${i + 25}`,
              'dc:title': `Article ${i + 25}`,
            })),
          },
        }),
      });

      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        overrides: {},
      };
      const query = provider.translateQuery(ast);

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(50);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should respect maxResults option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '100',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: Array.from({ length: 25 }, (_, i) => ({
              'dc:identifier': `SCOPUS_ID:${i}`,
              'dc:title': `Article ${i}`,
            })),
          },
        }),
      });

      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        overrides: {},
      };
      const query = provider.translateQuery(ast);

      const articles: unknown[] = [];
      for await (const article of provider.search(query, { maxResults: 10 })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(10);
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '1',
            entry: [],
          },
        }),
      });

      const provider = new ScopusProvider(config);
      const result = await provider.testConnection();
      expect(result).toBe(true);
    });

    it('should return false on 401 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });

      const provider = new ScopusProvider(config);
      const result = await provider.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw on 401 during search', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });

      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        overrides: {},
      };
      const query = provider.translateQuery(ast);

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // consume iterator
        }
      }).rejects.toMatchObject({
        code: 'API_KEY_INVALID',
      });
    });

    it('should retry on 5xx errors', async () => {
      // First call fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
      });

      // Retry succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '1',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [
              {
                'dc:identifier': 'SCOPUS_ID:1',
                'dc:title': 'Article 1',
              },
            ],
          },
        }),
      });

      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        overrides: {},
      };
      const query = provider.translateQuery(ast);

      const articles: unknown[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
