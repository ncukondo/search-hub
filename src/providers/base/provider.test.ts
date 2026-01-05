import { describe, it, expect } from 'vitest';
import { BaseProvider } from './provider';
import type { BaseProviderConfig } from './provider';
import type {
  ProviderName,
  Article,
  TranslatedQuery,
  SearchOptions,
  QueryAstNode,
} from './types';

// Concrete implementation for testing
class TestProvider extends BaseProvider {
  readonly name: ProviderName = 'pubmed';

  constructor(config: BaseProviderConfig = {}) {
    super(config);
  }

  async *search(
    _query: TranslatedQuery,
    _options?: SearchOptions
  ): AsyncIterable<Article> {
    // Test implementation
    yield {
      doi: '10.1234/test',
      title: 'Test Article',
      authors: [{ family: 'Test' }],
      source: 'pubmed',
      retrievedAt: new Date().toISOString(),
    };
  }

  translateQuery(ast: QueryAstNode): TranslatedQuery {
    return {
      native: 'test query',
      originalAst: ast,
      provider: 'pubmed',
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  // Expose protected members for testing
  getRateLimiter() {
    return this.rateLimiter;
  }

  getConfig() {
    return this.config;
  }
}

describe('BaseProvider', () => {
  describe('constructor', () => {
    it('creates provider with default config', () => {
      const provider = new TestProvider();
      expect(provider).toBeInstanceOf(BaseProvider);
    });

    it('accepts custom config', () => {
      const provider = new TestProvider({
        rateLimit: 10,
        timeout: 60000,
        retries: 5,
      });
      expect(provider).toBeInstanceOf(BaseProvider);
    });
  });

  describe('name property', () => {
    it('returns provider name', () => {
      const provider = new TestProvider();
      expect(provider.name).toBe('pubmed');
    });
  });

  describe('rate limiter initialization', () => {
    it('initializes rate limiter from config', () => {
      const provider = new TestProvider({ rateLimit: 5 });
      const rateLimiter = provider.getRateLimiter();
      expect(rateLimiter).toBeDefined();
    });

    it('uses default rate limit when not specified', () => {
      const provider = new TestProvider();
      const rateLimiter = provider.getRateLimiter();
      expect(rateLimiter).toBeDefined();
    });
  });

  describe('config merging', () => {
    it('merges user config with defaults', () => {
      const provider = new TestProvider({
        timeout: 45000,
      });
      const config = provider.getConfig();

      // User-specified value
      expect(config.timeout).toBe(45000);
      // Default values
      expect(config.retries).toBe(3);
      expect(config.rateLimit).toBe(3);
    });

    it('allows overriding all defaults', () => {
      const provider = new TestProvider({
        rateLimit: 10,
        timeout: 120000,
        retries: 10,
        maxBackoff: 120000,
        initialBackoff: 2000,
      });
      const config = provider.getConfig();

      expect(config.rateLimit).toBe(10);
      expect(config.timeout).toBe(120000);
      expect(config.retries).toBe(10);
      expect(config.maxBackoff).toBe(120000);
      expect(config.initialBackoff).toBe(2000);
    });
  });

  describe('abstract methods', () => {
    it('search is implemented by subclass', async () => {
      const provider = new TestProvider();
      const query: TranslatedQuery = {
        native: 'test',
        originalAst: { type: 'term' },
        provider: 'pubmed',
      };

      const articles: Article[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
      expect(articles[0]?.title).toBe('Test Article');
    });

    it('translateQuery is implemented by subclass', () => {
      const provider = new TestProvider();
      const result = provider.translateQuery({ type: 'term', value: 'test' });

      expect(result.native).toBe('test query');
      expect(result.provider).toBe('pubmed');
    });

    it('testConnection is implemented by subclass', async () => {
      const provider = new TestProvider();
      const result = await provider.testConnection();

      expect(result).toBe(true);
    });
  });
});
