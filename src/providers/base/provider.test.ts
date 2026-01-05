import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseProvider } from './provider';
import type { BaseProviderConfig } from './provider';
import type {
  ProviderName,
  Article,
  TranslatedQuery,
  SearchOptions,
  QueryAstNode,
  ProviderError,
} from './types';
import { createProviderError } from './types';

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

  // Expose withRetry for testing
  async testWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    return this.withRetry(fn);
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

  describe('withRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns result on success', async () => {
      const provider = new TestProvider();
      const fn = vi.fn().mockResolvedValue('success');

      const result = await provider.testWithRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on network error', async () => {
      const provider = new TestProvider({ retries: 3, initialBackoff: 100 });
      const networkError = createProviderError(
        'NETWORK_ERROR',
        'Connection failed',
        'pubmed',
        { retryable: true }
      );

      const fn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');

      const resultPromise = provider.testWithRetry(fn);

      // Wait for retries
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('retries on 5xx server error', async () => {
      const provider = new TestProvider({ retries: 3, initialBackoff: 100 });
      const serverError = createProviderError(
        'SERVER_ERROR',
        'Internal server error',
        'pubmed',
        { retryable: true }
      );

      const fn = vi
        .fn()
        .mockRejectedValueOnce(serverError)
        .mockResolvedValue('success');

      const resultPromise = provider.testWithRetry(fn);
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 401/403 auth error', async () => {
      const provider = new TestProvider({ retries: 3 });
      const authError = createProviderError(
        'API_KEY_INVALID',
        'Invalid API key',
        'pubmed',
        { retryable: false }
      );

      const fn = vi.fn().mockRejectedValue(authError);

      await expect(provider.testWithRetry(fn)).rejects.toEqual(authError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('uses exponential backoff between retries', async () => {
      const provider = new TestProvider({ retries: 3, initialBackoff: 100 });
      const error = createProviderError(
        'NETWORK_ERROR',
        'Timeout',
        'pubmed',
        { retryable: true }
      );

      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const resultPromise = provider.testWithRetry(fn);

      // First retry after 100ms
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Second retry after 200ms (exponential)
      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);

      await resultPromise;
    });

    it('throws after max retries exceeded', async () => {
      const provider = new TestProvider({ retries: 2, initialBackoff: 100 });
      const error = createProviderError(
        'NETWORK_ERROR',
        'Timeout',
        'pubmed',
        { retryable: true }
      );

      const fn = vi.fn().mockRejectedValue(error);

      // Catch the promise to prevent unhandled rejection
      let caughtError: unknown;
      const resultPromise = provider.testWithRetry(fn).catch((e) => {
        caughtError = e;
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(100); // First retry
      await vi.advanceTimersByTimeAsync(200); // Second retry

      await resultPromise;

      expect(caughtError).toEqual(error);
      // Initial call + 2 retries = 3 calls
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('handles rate limit error with retryAfter', async () => {
      const provider = new TestProvider({ retries: 3 });
      const rateLimitError: ProviderError & { retryAfter: number } = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        provider: 'pubmed',
        retryable: true,
        retryAfter: 5000,
      };

      const fn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('success');

      const resultPromise = provider.testWithRetry(fn);

      // Should wait for retryAfter time
      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
