import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeSHLookupClient } from './mesh-lookup.js';
import type { RateLimiter } from '../providers/base/rate-limiter.js';

describe('MeSHLookupClient', () => {
  let client: MeSHLookupClient;

  beforeEach(() => {
    client = new MeSHLookupClient();
  });

  describe('lookupTerm', () => {
    it('should return found=true for a valid MeSH term', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            resource: 'http://id.nlm.nih.gov/mesh/T011751',
            label: 'Diabetes Mellitus, Type 2',
          },
        ],
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Diabetes Mellitus, Type 2');

      expect(result.found).toBe(true);
      expect(result.term).toBe('Diabetes Mellitus, Type 2');
      expect(result.suggestions).toBeUndefined();

      vi.unstubAllGlobals();
    });

    it('should return found=false with suggestions for an invalid term', async () => {
      const mockFetch = vi
        .fn()
        // First call: exact match returns empty
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        // Second call: startswith returns suggestions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              resource: 'http://id.nlm.nih.gov/mesh/T011730',
              label: 'Diabetes Mellitus',
            },
            {
              resource: 'http://id.nlm.nih.gov/mesh/T011751',
              label: 'Diabetes Mellitus, Type 2',
            },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Diabetes Mellitis');

      expect(result.found).toBe(false);
      expect(result.term).toBe('Diabetes Mellitis');
      expect(result.suggestions).toEqual([
        'Diabetes Mellitus',
        'Diabetes Mellitus, Type 2',
      ]);

      vi.unstubAllGlobals();
    });

    it('should return found=false with no suggestions when all fallbacks return empty', async () => {
      const mockFetch = vi
        .fn()
        // exact: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (full): no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains (full): no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (first word): no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Xyzzy Not A Term');

      expect(result.found).toBe(false);
      expect(result.term).toBe('Xyzzy Not A Term');
      expect(result.suggestions).toBeUndefined();

      vi.unstubAllGlobals();
    });

    it('should handle network errors gracefully', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await expect(client.lookupTerm('Diabetes')).rejects.toThrow(
        'MeSH lookup failed'
      );

      vi.unstubAllGlobals();
    });

    it('should handle non-OK HTTP responses', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(client.lookupTerm('Diabetes')).rejects.toThrow(
        'MeSH lookup failed'
      );

      vi.unstubAllGlobals();
    });

    it('should construct correct URL for exact match', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [{ resource: 'x', label: 'Test Term' }],
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.lookupTerm('Test Term');

      const url = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(url.origin + url.pathname).toBe(
        'https://id.nlm.nih.gov/mesh/lookup/term'
      );
      expect(url.searchParams.get('label')).toBe('Test Term');
      expect(url.searchParams.get('match')).toBe('exact');
      expect(url.searchParams.get('limit')).toBe('1');

      vi.unstubAllGlobals();
    });
  });

  describe('lookupTerms', () => {
    it('should validate multiple terms and return all results', async () => {
      const mockFetch = vi
        .fn()
        // Term 1: valid
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ resource: 'x', label: 'Diabetes Mellitus' }],
        })
        // Term 2: invalid (exact)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        // Term 2: suggestions (startswith)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'y', label: 'Artificial Intelligence' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const results = await client.lookupTerms([
        'Diabetes Mellitus',
        'Artificial Inteligence',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]!.found).toBe(true);
      expect(results[1]!.found).toBe(false);
      expect(results[1]!.suggestions).toEqual(['Artificial Intelligence']);

      vi.unstubAllGlobals();
    });

    it('should return empty array for empty input', async () => {
      const results = await client.lookupTerms([]);
      expect(results).toEqual([]);
    });
  });

  describe('RateLimiter integration', () => {
    it('should call RateLimiter.acquire() before each lookupTerm', async () => {
      const mockRateLimiter = {
        acquire: vi.fn().mockResolvedValue(undefined),
      } as unknown as RateLimiter;

      const clientWithLimiter = new MeSHLookupClient({ rateLimiter: mockRateLimiter });

      const mockFetch = vi
        .fn()
        // Term 1: valid
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ resource: 'x', label: 'Term A' }],
        })
        // Term 2: valid
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ resource: 'y', label: 'Term B' }],
        });
      vi.stubGlobal('fetch', mockFetch);

      await clientWithLimiter.lookupTerms(['Term A', 'Term B']);

      // acquire() should be called once per lookupTerm call (before fetch)
      expect(mockRateLimiter.acquire).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should work without RateLimiter (backward compatible)', async () => {
      const clientNoLimiter = new MeSHLookupClient();

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [{ resource: 'x', label: 'Test Term' }],
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await clientNoLimiter.lookupTerm('Test Term');
      expect(result.found).toBe(true);

      vi.unstubAllGlobals();
    });
  });

  describe('fuzzy suggestion fallback strategies', () => {
    it('should return suggestions via contains match for typos (e.g. "Artificial Intelligense")', async () => {
      const mockFetch = vi
        .fn()
        // exact: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (full term): no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains (full term): match found
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'http://id.nlm.nih.gov/mesh/T000612', label: 'Artificial Intelligence' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Artificial Intelligense');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Artificial Intelligence']);

      // Verify the contains call was made
      const containsCall = mockFetch.mock.calls[2]!;
      const url = new URL(containsCall[0] as string);
      expect(url.searchParams.get('match')).toBe('contains');

      vi.unstubAllGlobals();
    });

    it('should return suggestions via startsWith first words for plural differences (e.g. "Drug Therapies")', async () => {
      const mockFetch = vi
        .fn()
        // exact: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (full term): no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains (full term): no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (first word "Drug"): match found
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'http://id.nlm.nih.gov/mesh/T000001', label: 'Drug Therapy' },
            { resource: 'http://id.nlm.nih.gov/mesh/T000002', label: 'Drug Interactions' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Drug Therapies');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Drug Therapy', 'Drug Interactions']);

      // Verify the startsWith call with first word
      const startsWithCall = mockFetch.mock.calls[3]!;
      const url = new URL(startsWithCall[0] as string);
      expect(url.searchParams.get('match')).toBe('startswith');
      expect(url.searchParams.get('label')).toBe('Drug');

      vi.unstubAllGlobals();
    });

    it('should return suggestions via contains for spacing differences (e.g. "Cardio Vascular Disease")', async () => {
      const mockFetch = vi
        .fn()
        // exact: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (full term): no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains (full term): no match ("Cardio Vascular Disease" not in any label)
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (first word "Cardio"): finds suggestions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'http://id.nlm.nih.gov/mesh/T000003', label: 'Cardiovascular Diseases' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Cardio Vascular Disease');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Cardiovascular Diseases']);

      vi.unstubAllGlobals();
    });

    it('should still return found=true for exact matches (no extra calls)', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { resource: 'http://id.nlm.nih.gov/mesh/T011730', label: 'Diabetes Mellitus' },
        ],
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Diabetes Mellitus');

      expect(result.found).toBe(true);
      expect(result.suggestions).toBeUndefined();
      // Only one fetch call (exact match)
      expect(mockFetch).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('should still return suggestions from startsWith without trying further fallbacks', async () => {
      const mockFetch = vi
        .fn()
        // exact: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith (full term): match found
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'http://id.nlm.nih.gov/mesh/T011730', label: 'Diabetes Mellitus' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Diabetes Melli');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Diabetes Mellitus']);
      // Only two fetch calls (exact + startsWith), no contains or first-word fallback
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should not try first-word fallback for single-word terms', async () => {
      const mockFetch = vi
        .fn()
        // exact: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startsWith: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains: no match
        .mockResolvedValueOnce({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Xyzzy');

      expect(result.found).toBe(false);
      expect(result.suggestions).toBeUndefined();
      // 3 calls: exact, startsWith, contains — no first-word fallback for single words
      expect(mockFetch).toHaveBeenCalledTimes(3);

      vi.unstubAllGlobals();
    });
  });

  describe('fetch timeout', () => {
    it('should pass AbortSignal.timeout to fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [{ resource: 'x', label: 'Test' }],
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.lookupTerm('Test');

      // Verify signal was passed to fetch
      const fetchOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(fetchOptions).toBeDefined();
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);

      vi.unstubAllGlobals();
    });

    it('should use custom timeout when provided', async () => {
      const clientWithTimeout = new MeSHLookupClient({ timeoutMs: 5000 });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [{ resource: 'x', label: 'Test' }],
      });
      vi.stubGlobal('fetch', mockFetch);

      await clientWithTimeout.lookupTerm('Test');

      const fetchOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);

      vi.unstubAllGlobals();
    });

    it('should throw MeSH lookup failed on timeout', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      const mockFetch = vi.fn().mockRejectedValueOnce(abortError);
      vi.stubGlobal('fetch', mockFetch);

      await expect(client.lookupTerm('Test')).rejects.toThrow(
        'MeSH lookup failed'
      );

      vi.unstubAllGlobals();
    });
  });
});
