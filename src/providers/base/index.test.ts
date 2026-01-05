import { describe, it, expect } from 'vitest';
import {
  // Types
  type ProviderName,
  type Author,
  type Article,
  type TranslatedQuery,
  type SearchOptions,
  type ProviderError,
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
} from './index';

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
        originalAst: { type: 'term' },
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

      const query = provider.translateQuery({ type: 'term', value: 'test' });
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
