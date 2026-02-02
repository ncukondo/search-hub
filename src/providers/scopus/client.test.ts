/**
 * Scopus HTTP Client Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScopusClient } from './client';
import type { ScopusConfig } from './types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ScopusClient', () => {
  const config: ScopusConfig = {
    apiKey: 'test-api-key',
    rateLimit: 2,
    timeout: 30000,
    retries: 3,
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search', () => {
    it('should construct correct API URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      await client.search('TITLE(diabetes)');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0]![0] as URL;
      expect(calledUrl.origin).toBe('https://api.elsevier.com');
      expect(calledUrl.pathname).toBe('/content/search/scopus');
    });

    it('should include X-ELS-APIKey header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      await client.search('TITLE(diabetes)');

      const calledOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(calledOptions.headers).toBeDefined();
      const headers = calledOptions.headers as Record<string, string>;
      expect(headers['X-ELS-APIKey']).toBe('test-api-key');
    });

    it('should include X-ELS-Insttoken header when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const configWithToken: ScopusConfig = {
        ...config,
        instToken: 'institutional-token',
      };
      const client = new ScopusClient(configWithToken);
      await client.search('TITLE(diabetes)');

      const calledOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = calledOptions.headers as Record<string, string>;
      expect(headers['X-ELS-Insttoken']).toBe('institutional-token');
    });

    it('should include Accept: application/json header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      await client.search('TITLE(diabetes)');

      const calledOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = calledOptions.headers as Record<string, string>;
      expect(headers['Accept']).toBe('application/json');
    });

    it('should encode query parameter correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      await client.search('TITLE("machine learning")');

      const calledUrl = mockFetch.mock.calls[0]![0] as URL;
      expect(calledUrl.searchParams.get('query')).toBe('TITLE("machine learning")');
    });

    it('should include pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '100',
            'opensearch:startIndex': '25',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      await client.search('TITLE(test)', { start: 25, count: 25 });

      const calledUrl = mockFetch.mock.calls[0]![0] as URL;
      expect(calledUrl.searchParams.get('start')).toBe('25');
      expect(calledUrl.searchParams.get('count')).toBe('25');
    });

    it('should use COMPLETE view by default for abstracts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      await client.search('TITLE(test)');

      const calledUrl = mockFetch.mock.calls[0]![0] as URL;
      expect(calledUrl.searchParams.get('view')).toBe('COMPLETE');
    });

    it('should parse rate limit headers', async () => {
      const headers = new Headers({
        'X-RateLimit-Limit': '9',
        'X-RateLimit-Remaining': '5',
        'X-RateLimit-Reset': '1234567890',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers,
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      const result = await client.search('TITLE(test)');

      expect(result.rateLimit).toBeDefined();
      expect(result.rateLimit!.limit).toBe(9);
      expect(result.rateLimit!.remaining).toBe(5);
      expect(result.rateLimit!.reset).toBe(1234567890);
    });

    it('should return parsed search response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '42',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [
              {
                'dc:identifier': 'SCOPUS_ID:12345',
                'dc:title': 'Test Article',
              },
            ],
          },
        }),
      });

      const client = new ScopusClient(config);
      const result = await client.search('TITLE(test)');

      expect(result.totalResults).toBe(42);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!['dc:identifier']).toBe('SCOPUS_ID:12345');
    });
  });

  describe('error handling', () => {
    it('should throw on 401 with message containing "invalid" and HTTP status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });

      const client = new ScopusClient(config);
      await expect(client.search('TITLE(test)')).rejects.toMatchObject({
        code: 'API_KEY_INVALID',
        retryable: false,
      });
      await expect(client.search('TITLE(test)')).rejects.toThrow();
      // Re-mock for message check
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });
      try {
        await new ScopusClient(config).search('TITLE(test)');
      } catch (e: unknown) {
        const error = e as { message: string };
        expect(error.message).toContain('401');
        expect(error.message).toMatch(/invalid|expired/i);
        expect(error.message).toContain('dev.elsevier.com');
      }
    });

    it('should throw on 403 with message containing "access denied" and HTTP status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
      });

      const client = new ScopusClient(config);
      await expect(client.search('TITLE(test)')).rejects.toMatchObject({
        code: 'API_KEY_INVALID',
        retryable: false,
      });
      // Re-mock for message check
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
      });
      try {
        await new ScopusClient(config).search('TITLE(test)');
      } catch (e: unknown) {
        const error = e as { message: string };
        expect(error.message).toContain('403');
        expect(error.message).toMatch(/access denied|permissions/i);
      }
    });

    it('should throw on 429 rate limited with retryAfter', async () => {
      const headers = new Headers({
        'Retry-After': '60',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers,
      });

      const client = new ScopusClient(config);
      await expect(client.search('TITLE(test)')).rejects.toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        retryable: true,
        retryAfter: 60000,
      });
    });

    it('should throw retryable error on 5xx', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
      });

      const client = new ScopusClient(config);
      await expect(client.search('TITLE(test)')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        retryable: true,
      });
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

      const client = new ScopusClient(config);
      const result = await client.testConnection();
      expect(result).toEqual({ ok: true });
    });

    it('should return { ok: false, error: ... } on 401 auth error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });

      const client = new ScopusClient(config);
      const result = await client.testConnection();
      expect(result).toMatchObject({ ok: false });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('401');
      expect(result.error).toMatch(/invalid|expired/i);
    });

    it('should return { ok: false, error: ... } on 403 forbidden', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
      });

      const client = new ScopusClient(config);
      const result = await client.testConnection();
      expect(result).toMatchObject({ ok: false });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('403');
      expect(result.error).toMatch(/access denied|permissions/i);
    });

    it('should return { ok: false, error: ... } on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const client = new ScopusClient(config);
      const result = await client.testConnection();
      expect(result).toMatchObject({ ok: false });
      expect(result.error).toBeDefined();
    });
  });

  describe('timeout', () => {
    it('should throw TIMEOUT error when request times out', async () => {
      // Mock fetch to respect AbortSignal
      mockFetch.mockImplementationOnce((_url: URL, options: RequestInit) => {
        return new Promise((resolve, reject) => {
          const signal = options.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
          // Never resolves naturally - will be aborted by timeout
        });
      });

      const shortTimeoutConfig: ScopusConfig = {
        ...config,
        timeout: 100, // 100ms timeout
      };
      const client = new ScopusClient(shortTimeoutConfig);

      await expect(client.search('TITLE(test)')).rejects.toMatchObject({
        code: 'TIMEOUT',
        retryable: true,
      });
    });

    it('should use default timeout when not configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const configWithoutTimeout: ScopusConfig = {
        apiKey: 'test-api-key',
        rateLimit: 2,
        // timeout not specified
      };
      const client = new ScopusClient(configWithoutTimeout);

      // Should succeed without error (uses default 30s timeout)
      await expect(client.search('TITLE(test)')).resolves.toBeDefined();
    });

    it('should clear timeout after successful response', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          'search-results': {
            'opensearch:totalResults': '0',
            'opensearch:startIndex': '0',
            'opensearch:itemsPerPage': '25',
            entry: [],
          },
        }),
      });

      const client = new ScopusClient(config);
      const promise = client.search('TITLE(test)');

      // Advance timers and resolve
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBeDefined();

      vi.useRealTimers();
    });
  });
});
