import { describe, it, expect } from 'vitest';
import {
  // Types
  type ProviderName,
  type Author,
  type Article,
  type TranslatedQuery,
  type SearchOptions,
  type ProviderError,
  type SearchState,
  type SearchResumeResult,
  type QueryAST,
  // Type guards
  createProviderError,
  isProviderError,
  isRateLimitError,
  isAuthError,
  // Classes
  BaseProvider,
  RateLimiter,
  ProviderRegistry,
  MockProvider,
  // Registry helpers
  createProviderRegistry,
  globalRegistry,
  // Serialization helpers
  serializeState,
  deserializeState,
} from './index';

/**
 * Helper to create a minimal QueryAST for testing.
 */
function createMockQueryAST(name = 'test-query'): QueryAST {
  return {
    name,
    blocks: [],
    filters: {},
  };
}

describe('Module exports', () => {
  describe('types', () => {
    it('exports ProviderName type', () => {
      const name: ProviderName = 'pubmed';
      expect(name).toBe('pubmed');
    });

    it('exports Author type', () => {
      const author: Author = { family: 'Test' };
      expect(author.family).toBe('Test');
    });

    it('exports Article type', () => {
      const article: Article = {
        doi: '10.1234/test',
        title: 'Test',
        authors: [],
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
      };
      expect(article.title).toBe('Test');
    });

    it('exports TranslatedQuery type', () => {
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: createMockQueryAST(),
        provider: 'pubmed',
      };
      expect(query.native).toBe('test');
    });

    it('exports SearchOptions type', () => {
      const options: SearchOptions = { maxResults: 100 };
      expect(options.maxResults).toBe(100);
    });

    it('exports ProviderError type', () => {
      const error: ProviderError = {
        code: 'NETWORK_ERROR',
        message: 'Test',
        provider: 'pubmed',
        retryable: true,
      };
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('exports SearchState type', () => {
      const state: SearchState = {
        provider: 'pubmed',
        query: {
          native: 'test',
          originalAst: createMockQueryAST(),
          provider: 'pubmed',
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
      };
      expect(state.provider).toBe('pubmed');
    });

    it('exports SearchResumeResult type', () => {
      const result: SearchResumeResult = {
        valid: true,
      };
      expect(result.valid).toBe(true);
    });
  });

  describe('type guards', () => {
    it('exports createProviderError', () => {
      const error = createProviderError('NETWORK_ERROR', 'Test', 'pubmed');
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('exports isProviderError', () => {
      const error = createProviderError('NETWORK_ERROR', 'Test', 'pubmed');
      expect(isProviderError(error)).toBe(true);
    });

    it('exports isRateLimitError', () => {
      expect(typeof isRateLimitError).toBe('function');
    });

    it('exports isAuthError', () => {
      expect(typeof isAuthError).toBe('function');
    });
  });

  describe('classes', () => {
    it('exports BaseProvider', () => {
      expect(BaseProvider).toBeDefined();
    });

    it('exports RateLimiter', () => {
      const limiter = new RateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('exports ProviderRegistry', () => {
      const registry = new ProviderRegistry();
      expect(registry).toBeInstanceOf(ProviderRegistry);
    });

    it('exports MockProvider', () => {
      const mock = new MockProvider();
      expect(mock).toBeInstanceOf(BaseProvider);
    });
  });

  describe('registry helpers', () => {
    it('exports createProviderRegistry', () => {
      const registry = createProviderRegistry();
      expect(registry).toBeInstanceOf(ProviderRegistry);
    });

    it('exports globalRegistry', () => {
      expect(globalRegistry).toBeInstanceOf(ProviderRegistry);
    });
  });

  describe('serialization helpers', () => {
    it('exports serializeState', () => {
      const state: SearchState = {
        provider: 'pubmed',
        query: {
          native: 'test',
          originalAst: createMockQueryAST(),
          provider: 'pubmed',
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date('2025-01-15T12:00:00Z'),
      };
      const json = serializeState(state);
      expect(typeof json).toBe('string');
      expect(JSON.parse(json).provider).toBe('pubmed');
    });

    it('exports deserializeState', () => {
      const json = JSON.stringify({
        provider: 'pubmed',
        query: {
          native: 'test',
          originalAst: createMockQueryAST(),
          provider: 'pubmed',
        },
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: '2025-01-15T12:00:00.000Z',
      });
      const state = deserializeState(json);
      expect(state.provider).toBe('pubmed');
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('integration', () => {
    it('can create and use mock provider', async () => {
      const provider = new MockProvider({
        name: 'eric',
        articles: [
          {
            ericId: 'ED123456',
            title: 'Test ERIC Article',
            authors: [{ family: 'Researcher' }],
            source: 'eric',
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      expect(provider.name).toBe('eric');

      const query = provider.translateQuery(createMockQueryAST());
      expect(query.provider).toBe('eric');

      const articles = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
      expect(articles[0]?.title).toBe('Test ERIC Article');
    });

    it('can register and retrieve provider from registry', () => {
      const registry = createProviderRegistry();

      registry.register('pubmed', (config) => new MockProvider({
        ...config,
        name: 'pubmed',
      }));

      expect(registry.has('pubmed')).toBe(true);
      expect(registry.list()).toContain('pubmed');

      const provider = registry.get('pubmed');
      expect(provider.name).toBe('pubmed');
    });
  });
});
