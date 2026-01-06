import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockProvider } from './mock-provider';
import { BaseProvider } from './provider';
import type { TranslatedQuery, Article, ProviderError, QueryAST } from './types';
import { createProviderError } from './types';

/**
 * Helper to create a minimal QueryAST for testing.
 */
function createMockQueryAST(name = 'test-query'): QueryAST {
  return {
    name,
    blocks: [],
    filters: {},
    overrides: {},
  };
}

describe('MockProvider', () => {
  describe('interface implementation', () => {
    it('extends BaseProvider', () => {
      const provider = new MockProvider();
      expect(provider).toBeInstanceOf(BaseProvider);
    });

    it('has mock name by default', () => {
      const provider = new MockProvider();
      expect(provider.name).toBe('pubmed'); // Default mock uses pubmed
    });

    it('can override name', () => {
      const provider = new MockProvider({ name: 'eric' });
      expect(provider.name).toBe('eric');
    });

    it('implements testConnection', async () => {
      const provider = new MockProvider();
      const result = await provider.testConnection();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('configurable results', () => {
    it('returns default articles', async () => {
      const provider = new MockProvider();
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles.length).toBeGreaterThan(0);
      expect(articles[0]).toHaveProperty('title');
      expect(articles[0]).toHaveProperty('authors');
    });

    it('returns configured articles', async () => {
      const customArticles: Article[] = [
        {
          doi: '10.1234/custom1',
          title: 'Custom Article 1',
          authors: [{ family: 'Custom' }],
          source: 'pubmed',
          retrievedAt: '2024-01-01T00:00:00Z',
        },
        {
          doi: '10.1234/custom2',
          title: 'Custom Article 2',
          authors: [{ family: 'Custom' }],
          source: 'pubmed',
          retrievedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const provider = new MockProvider({ articles: customArticles });
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(2);
      expect(articles[0]?.title).toBe('Custom Article 1');
      expect(articles[1]?.title).toBe('Custom Article 2');
    });

    it('respects maxResults in options', async () => {
      const customArticles: Article[] = Array.from({ length: 10 }, (_, i) => ({
        doi: `10.1234/article${i}`,
        title: `Article ${i}`,
        authors: [{ family: 'Test' }],
        source: 'pubmed' as const,
        retrievedAt: '2024-01-01T00:00:00Z',
      }));

      const provider = new MockProvider({ articles: customArticles });
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query, { maxResults: 3 })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(3);
    });

    it('translateQuery returns configured response', () => {
      const provider = new MockProvider({
        translatedQuery: {
          native: 'custom translated query',
          originalAst: createMockQueryAST('custom-query'),
          provider: 'pubmed',
        },
      });

      const result = provider.translateQuery(createMockQueryAST());

      expect(result.native).toBe('custom translated query');
    });

    it('testConnection returns configured value', async () => {
      const providerConnected = new MockProvider({ connectionStatus: true });
      const providerDisconnected = new MockProvider({ connectionStatus: false });

      expect(await providerConnected.testConnection()).toBe(true);
      expect(await providerDisconnected.testConnection()).toBe(false);
    });
  });

  describe('simulates rate limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('can delay responses', async () => {
      const provider = new MockProvider({ searchDelay: 100 });
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      const articlesPromise = (async () => {
        const articles: Article[] = [];
        for await (const article of provider.search(query)) {
          articles.push(article);
        }
        return articles;
      })();

      // Advance time
      await vi.advanceTimersByTimeAsync(100);

      const articles = await articlesPromise;
      expect(articles.length).toBeGreaterThan(0);
    });
  });

  describe('simulates errors', () => {
    it('throws configured error on search', async () => {
      const error = createProviderError(
        'NETWORK_ERROR',
        'Simulated network error',
        'pubmed',
        { retryable: true }
      );

      const provider = new MockProvider({ searchError: error });
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // Should throw before yielding
        }
      }).rejects.toEqual(error);
    });

    it('throws rate limit error', async () => {
      const rateLimitError: ProviderError & { retryAfter: number } = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        provider: 'pubmed',
        retryable: true,
        retryAfter: 5000,
      };

      const provider = new MockProvider({ searchError: rateLimitError });
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // Should throw
        }
      }).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    });

    it('throws auth error', async () => {
      const authError = createProviderError(
        'API_KEY_INVALID',
        'Invalid API key',
        'scopus',
        { retryable: false }
      );

      const provider = new MockProvider({
        name: 'scopus',
        searchError: authError,
      });
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'scopus',
      };

      await expect(async () => {
        for await (const _ of provider.search(query)) {
          // Should throw
        }
      }).rejects.toMatchObject({ code: 'API_KEY_INVALID' });
    });
  });
});
