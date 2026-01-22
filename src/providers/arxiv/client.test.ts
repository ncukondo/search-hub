import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArxivClient } from './client.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const SAMPLE_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults>1</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <opensearch:itemsPerPage>10</opensearch:itemsPerPage>
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Test Paper</title>
    <summary>Test abstract</summary>
    <author><name>John Smith</name></author>
    <published>2024-01-15T00:00:00Z</published>
    <arxiv:primary_category term="cs.AI"/>
    <category term="cs.AI"/>
  </entry>
</feed>`;

describe('ArxivClient', () => {
  let client: ArxivClient;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    client = new ArxivClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('search', () => {
    it('should construct correct API URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_RESPONSE),
      });

      await client.search('ti:quantum', { start: 0, maxResults: 10 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(url.origin).toBe('https://export.arxiv.org');
      expect(url.pathname).toBe('/api/query');
    });

    it('should encode search_query parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_RESPONSE),
      });

      await client.search('ti:"machine learning"', { start: 0, maxResults: 10 });

      const url = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(url.searchParams.get('search_query')).toBe('ti:"machine learning"');
    });

    it('should set pagination parameters (start, max_results)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_RESPONSE),
      });

      await client.search('ti:quantum', { start: 100, maxResults: 50 });

      const url = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(url.searchParams.get('start')).toBe('100');
      expect(url.searchParams.get('max_results')).toBe('50');
    });

    it('should set sortBy and sortOrder parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_RESPONSE),
      });

      await client.search('ti:quantum', {
        start: 0,
        maxResults: 10,
        sortBy: 'submittedDate',
        sortOrder: 'descending',
      });

      const url = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(url.searchParams.get('sortBy')).toBe('submittedDate');
      expect(url.searchParams.get('sortOrder')).toBe('descending');
    });

    it('should return parsed search response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_RESPONSE),
      });

      const result = await client.search('ti:quantum', { start: 0, maxResults: 10 });

      expect(result.totalResults).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.title).toBe('Test Paper');
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid query'),
      });

      await expect(client.search('invalid', { start: 0, maxResults: 10 })).rejects.toThrow();
    });

    it('should set retryAfter to 30s on 503 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('Server busy'),
      });

      try {
        await client.search('ti:test', { start: 0, maxResults: 10 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
        expect(error).toHaveProperty('retryAfter', 30000);
      }
    });
  });

  describe('rate limiting', () => {
    it('should enforce minimum 3 second delay between requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_RESPONSE),
      });

      const rateLimitedClient = new ArxivClient({ minRequestInterval: 3000 });

      // First request should go through immediately
      const promise1 = rateLimitedClient.search('ti:test1', { start: 0, maxResults: 10 });
      await vi.advanceTimersByTimeAsync(0);
      await promise1;

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request should be delayed
      const promise2 = rateLimitedClient.search('ti:test2', { start: 0, maxResults: 10 });

      // Should not have made the call yet
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // After 3 seconds, should make the call
      await vi.advanceTimersByTimeAsync(2000);
      await promise2;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
