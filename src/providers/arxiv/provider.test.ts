import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArxivProvider } from './provider.js';
import type { QueryAST } from '../../query/types.js';
import type { TranslatedQuery, SearchState } from '../base/types.js';

// Mock the client module
vi.mock('./client.js', () => {
  return {
    ArxivClient: vi.fn().mockImplementation(() => ({
      search: vi.fn(),
    })),
  };
});

const { ArxivClient } = await import('./client.js');

/**
 * Helper to create a minimal QueryAST
 */
function createQueryAST(): QueryAST {
  return {
    name: 'test-query',
    blocks: [
      {
        id: 'block-1',
        field: 'title',
        terms: { keywords: ['quantum'] },
        operator: 'OR',
      },
    ],
    filters: {},
  };
}

/**
 * Helper to create a TranslatedQuery
 */
function createTranslatedQuery(): TranslatedQuery {
  return {
    native: 'ti:quantum',
    originalAst: createQueryAST(),
    provider: 'arxiv',
  };
}

/**
 * Sample search response
 */
const SAMPLE_RESPONSE = {
  totalResults: 2,
  startIndex: 0,
  itemsPerPage: 10,
  entries: [
    {
      arxivId: '2401.12345',
      title: 'Paper 1',
      authors: [{ given: 'John', family: 'Smith' }],
      source: 'arxiv' as const,
      retrievedAt: new Date().toISOString(),
      categories: ['cs.AI'],
      primaryCategory: 'cs.AI',
    },
    {
      arxivId: '2401.12346',
      title: 'Paper 2',
      authors: [{ given: 'Jane', family: 'Doe' }],
      source: 'arxiv' as const,
      retrievedAt: new Date().toISOString(),
      categories: ['cs.LG'],
      primaryCategory: 'cs.LG',
    },
  ],
};

describe('ArxivProvider', () => {
  let provider: ArxivProvider;
  let mockClient: { search: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = { search: vi.fn() };
    (ArxivClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
    provider = new ArxivProvider();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('interface implementation', () => {
    it('should have name "arxiv"', () => {
      expect(provider.name).toBe('arxiv');
    });

    it('should implement Provider interface', () => {
      expect(typeof provider.search).toBe('function');
      expect(typeof provider.translateQuery).toBe('function');
      expect(typeof provider.testConnection).toBe('function');
    });
  });

  describe('translateQuery', () => {
    it('should translate QueryAST to arXiv query', () => {
      const ast = createQueryAST();
      const result = provider.translateQuery(ast);

      expect(result.native).toBe('ti:quantum');
      expect(result.provider).toBe('arxiv');
    });
  });

  describe('search', () => {
    it('should return async iterable of articles', async () => {
      mockClient.search.mockResolvedValueOnce(SAMPLE_RESPONSE);

      const query = createTranslatedQuery();
      const articles = [];

      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(2);
      expect(articles[0]?.arxivId).toBe('2401.12345');
      expect(articles[1]?.arxivId).toBe('2401.12346');
    });

    it('should handle pagination across multiple pages', async () => {
      const page1 = {
        totalResults: 25,
        startIndex: 0,
        itemsPerPage: 10,
        entries: Array.from({ length: 10 }, (_, i) => ({
          arxivId: `2401.0000${i}`,
          title: `Paper ${i}`,
          authors: [],
          source: 'arxiv' as const,
          retrievedAt: new Date().toISOString(),
          categories: ['cs.AI'],
          primaryCategory: 'cs.AI',
        })),
      };
      const page2 = {
        totalResults: 25,
        startIndex: 10,
        itemsPerPage: 10,
        entries: Array.from({ length: 10 }, (_, i) => ({
          arxivId: `2401.0001${i}`,
          title: `Paper ${i + 10}`,
          authors: [],
          source: 'arxiv' as const,
          retrievedAt: new Date().toISOString(),
          categories: ['cs.AI'],
          primaryCategory: 'cs.AI',
        })),
      };
      const page3 = {
        totalResults: 25,
        startIndex: 20,
        itemsPerPage: 10,
        entries: Array.from({ length: 5 }, (_, i) => ({
          arxivId: `2401.0002${i}`,
          title: `Paper ${i + 20}`,
          authors: [],
          source: 'arxiv' as const,
          retrievedAt: new Date().toISOString(),
          categories: ['cs.AI'],
          primaryCategory: 'cs.AI',
        })),
      };

      mockClient.search
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2)
        .mockResolvedValueOnce(page3);

      const query = createTranslatedQuery();
      const articles = [];

      for await (const article of provider.search(query, { pageSize: 10 })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(25);
      expect(mockClient.search).toHaveBeenCalledTimes(3);
    });

    it('should respect maxResults option', async () => {
      mockClient.search.mockResolvedValueOnce(SAMPLE_RESPONSE);

      const query = createTranslatedQuery();
      const articles = [];

      for await (const article of provider.search(query, { maxResults: 1 })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
    });
  });

  describe('testConnection', () => {
    it('should return { ok: true } on successful connection', async () => {
      mockClient.search.mockResolvedValueOnce({
        totalResults: 1,
        startIndex: 0,
        itemsPerPage: 1,
        entries: [],
      });

      const result = await provider.testConnection();
      expect(result).toEqual({ ok: true });
    });

    it('should return { ok: false } on connection failure', async () => {
      mockClient.search.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getSearchState', () => {
    it('should return null when no search is in progress', () => {
      expect(provider.getSearchState()).toBeNull();
    });

    it('should return offset-based state during search', async () => {
      mockClient.search.mockResolvedValueOnce({
        ...SAMPLE_RESPONSE,
        totalResults: 100,
      });

      const query = createTranslatedQuery();
      const iterator = provider.search(query)[Symbol.asyncIterator]();

      // Start iteration to trigger search
      await iterator.next();

      const state = provider.getSearchState();
      expect(state).not.toBeNull();
      expect(state?.provider).toBe('arxiv');
      expect(state?.totalResults).toBe(100);
      expect(state?.retrievedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resumeSearch', () => {
    it('should resume from saved offset', async () => {
      const page2 = {
        totalResults: 20,
        startIndex: 10,
        itemsPerPage: 10,
        entries: Array.from({ length: 10 }, (_, i) => ({
          arxivId: `2401.0001${i}`,
          title: `Paper ${i + 10}`,
          authors: [],
          source: 'arxiv' as const,
          retrievedAt: new Date().toISOString(),
          categories: ['cs.AI'],
          primaryCategory: 'cs.AI',
        })),
      };

      mockClient.search.mockResolvedValueOnce(page2);

      const savedState: SearchState = {
        provider: 'arxiv',
        query: createTranslatedQuery(),
        totalResults: 20,
        retrievedCount: 10,
        lastUpdated: new Date(),
        providerState: { offset: 10 },
      };

      const articles = [];
      for await (const article of provider.resumeSearch(savedState)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(10);
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ start: 10 })
      );
    });
  });

  describe('validateState', () => {
    it('should always return valid for offset-based state', async () => {
      const state: SearchState = {
        provider: 'arxiv',
        query: createTranslatedQuery(),
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
        providerState: { offset: 50 },
      };

      const result = await provider.validateState(state);
      expect(result.valid).toBe(true);
    });
  });

  describe('count', () => {
    it('should return total hit count using minimal search', async () => {
      const mockClientInstance = vi.mocked(ArxivClient).mock.results[0]?.value as { search: ReturnType<typeof vi.fn> };
      mockClientInstance.search.mockResolvedValueOnce({
        totalResults: 150,
        startIndex: 0,
        itemsPerPage: 1,
        entries: [],
      });

      const query = createTranslatedQuery();
      const count = await provider.count(query);

      expect(count).toBe(150);
      expect(mockClientInstance.search).toHaveBeenCalledWith(
        query.native,
        { start: 0, maxResults: 1 }
      );
    });

    it('should return 0 for queries with no results', async () => {
      const mockClientInstance = vi.mocked(ArxivClient).mock.results[0]?.value as { search: ReturnType<typeof vi.fn> };
      mockClientInstance.search.mockResolvedValueOnce({
        totalResults: 0,
        startIndex: 0,
        itemsPerPage: 1,
        entries: [],
      });

      const query = createTranslatedQuery();
      const count = await provider.count(query);

      expect(count).toBe(0);
    });
  });
});
