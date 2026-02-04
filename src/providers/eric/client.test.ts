/**
 * Tests for ERIC HTTP client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ERICClient, ERIC_API_BASE_URL, DEFAULT_FIELDS } from './client';
import type { ERICSearchResponse } from './types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ERIC Client', () => {
  let client: ERICClient;

  beforeEach(() => {
    client = new ERICClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search', () => {
    it('should call ERIC API with correct URL', async () => {
      const mockResponse: ERICSearchResponse = {
        response: {
          numFound: 1,
          start: 0,
          docs: [{ id: 'EJ123456', title: 'Test' }],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.search('title:education');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain(ERIC_API_BASE_URL);
    });

    it('should include query in search parameter', async () => {
      const mockResponse: ERICSearchResponse = {
        response: { numFound: 0, start: 0, docs: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.search('title:education AND author:Smith');

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('search=');
      expect(calledUrl).toContain('education');
    });

    it('should include format=json parameter', async () => {
      const mockResponse: ERICSearchResponse = {
        response: { numFound: 0, start: 0, docs: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.search('test');

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('format=json');
    });

    it('should include pagination parameters (start, rows)', async () => {
      const mockResponse: ERICSearchResponse = {
        response: { numFound: 100, start: 20, docs: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.search('test', { start: 20, rows: 50 });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('start=20');
      expect(calledUrl).toContain('rows=50');
    });

    it('should include fields parameter', async () => {
      const mockResponse: ERICSearchResponse = {
        response: { numFound: 0, start: 0, docs: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.search('test');

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('fields=');
      // Should include common fields
      expect(calledUrl).toContain('id');
      expect(calledUrl).toContain('title');
    });

    it('should use default page size when not specified', async () => {
      const mockResponse: ERICSearchResponse = {
        response: { numFound: 0, start: 0, docs: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.search('test');

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('rows=');
    });

    it('should return parsed response', async () => {
      const mockResponse: ERICSearchResponse = {
        response: {
          numFound: 100,
          start: 0,
          docs: [
            { id: 'EJ123456', title: 'Test Article' },
            { id: 'ED654321', title: 'Another Article' },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.search('test');

      expect(result.totalResults).toBe(100);
      expect(result.start).toBe(0);
      expect(result.documents).toHaveLength(2);
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(client.search('invalid query')).rejects.toThrow();
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.search('test')).rejects.toThrow('Failed to connect to ERIC API');
    });

    it('should respect AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockImplementationOnce(() => {
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(
        client.search('test', { signal: controller.signal })
      ).rejects.toThrow();
    });

    it('should accept timeout option', () => {
      // Timeout is difficult to test in unit tests due to AbortController behavior
      // This test verifies the timeout option is accepted
      const timeoutClient = new ERICClient({ timeout: 100 });
      expect(timeoutClient).toBeInstanceOf(ERICClient);
    });
  });

  describe('DEFAULT_FIELDS', () => {
    it('should include required fields', () => {
      expect(DEFAULT_FIELDS).toContain('id');
      expect(DEFAULT_FIELDS).toContain('title');
      expect(DEFAULT_FIELDS).toContain('author');
      expect(DEFAULT_FIELDS).toContain('description');
    });

    it('should include metadata fields', () => {
      expect(DEFAULT_FIELDS).toContain('publicationdateyear');
      expect(DEFAULT_FIELDS).toContain('source');
      expect(DEFAULT_FIELDS).toContain('peerreviewed');
    });
  });

  describe('malformed response handling', () => {
    it('should throw descriptive error when response is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      });

      await expect(client.search('test')).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        message: expect.stringContaining('Unexpected response format'),
        provider: 'eric',
      });
    });

    it('should throw descriptive error when response is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(undefined),
      });

      await expect(client.search('test')).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        message: expect.stringContaining('Unexpected response format'),
        provider: 'eric',
      });
    });

    it('should throw descriptive error when response.response is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await expect(client.search('test')).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        message: expect.stringContaining("missing 'response'"),
        provider: 'eric',
      });
    });

    it('should throw descriptive error when numFound is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: { start: 0, docs: [] } }),
      });

      await expect(client.search('test')).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        message: expect.stringContaining("missing 'numFound'"),
        provider: 'eric',
      });
    });

    it('should throw descriptive error when docs is not an array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: { numFound: 10, start: 0, docs: 'invalid' } }),
      });

      await expect(client.search('test')).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        message: expect.stringContaining("'docs' is not an array"),
        provider: 'eric',
      });
    });

    it('should include truncated response in error message', async () => {
      const malformedResponse = { error: 'Something went wrong', details: 'a'.repeat(500) };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(malformedResponse),
      });

      await expect(client.search('test')).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        message: expect.stringMatching(/Response received:/),
      });
    });
  });
});
