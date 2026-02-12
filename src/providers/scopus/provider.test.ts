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
            id: 'block-1',
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {},
        providers: {},
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
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        providers: {},
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
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        providers: {},
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
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        providers: {},
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
    it('should return { ok: true } on successful connection', async () => {
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
      expect(result).toEqual({ ok: true });
    });

    it('should return { ok: false } on 401 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });

      const provider = new ScopusProvider(config);
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
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
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        providers: {},
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
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        providers: {},
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

  describe('session resume', () => {
    it('should resume from correct offset after multi-page interruption', async () => {
      // Setup: simulate interruption after 30 articles (25 from page 1 + 5 from page 2)
      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        providers: {},
      };
      const query = provider.translateQuery(ast);

      // Create a state simulating interruption after 30 articles
      const savedState = {
        provider: 'scopus' as const,
        query,
        totalResults: 50,
        retrievedCount: 30,
        lastUpdated: new Date(),
        providerState: {
          offset: 25, // Page 2 start position
          totalResults: 50,
          query: query.native,
        },
      };

      // Mock response for resumed search (should start at offset 30, not 55)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '50',
            'opensearch:startIndex': '30',
            'opensearch:itemsPerPage': '20',
            entry: Array.from({ length: 20 }, (_, i) => ({
              'dc:identifier': `SCOPUS_ID:${i + 30}`,
              'dc:title': `Article ${i + 30}`,
            })),
          },
        }),
      });

      const articles: unknown[] = [];
      for await (const article of provider.resumeSearch(savedState)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(20);

      // Verify the API was called with correct start offset (30, not 55)
      const calledUrl = mockFetch.mock.calls[0]![0] as URL;
      expect(calledUrl.searchParams.get('start')).toBe('30');
    });

    it('should get correct state during search for later resume', async () => {
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
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
        filters: {},
        providers: {},
      };
      const query = provider.translateQuery(ast);

      const articles: unknown[] = [];
      let capturedState = null;

      for await (const article of provider.search(query)) {
        articles.push(article);
        // Capture state after 30 articles (into second page)
        if (articles.length === 30) {
          capturedState = provider.getSearchState();
          break;
        }
      }

      expect(articles).toHaveLength(30);
      expect(capturedState).not.toBeNull();
      expect(capturedState!.retrievedCount).toBe(30);
    });
  });

  describe('count', () => {
    it('should return total hit count using minimal search', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '256',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '1',
            entry: [
              {
                'dc:identifier': 'SCOPUS_ID:1',
                'dc:title': 'Article 1',
                'dc:creator': 'Smith J.',
              },
            ],
          },
        }),
      });

      const provider = new ScopusProvider(config);
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['diabetes'] }, operator: 'OR' }],
        filters: {},
        providers: {},
      };
      const query = provider.translateQuery(ast);

      const count = await provider.count(query);
      expect(count).toBe(256);
    });

    it('should return 0 for queries with no results', async () => {
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
      const ast: QueryAST = {
        name: 'test',
        blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['nonexistent'] }, operator: 'OR' }],
        filters: {},
        providers: {},
      };
      const query = provider.translateQuery(ast);

      const count = await provider.count(query);
      expect(count).toBe(0);
    });
  });
});
