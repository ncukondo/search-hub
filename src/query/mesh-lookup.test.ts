import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeSHLookupClient } from './mesh-lookup.js';
import type { RateLimiter } from '../providers/base/rate-limiter.js';
import type { VocabCache } from './vocab-cache.js';

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

    it('should return suggestions via contains when startswith fails (typo)', async () => {
      // "Artificial Intelligense" (24 chars) → truncated tries: 23, 22, 21 chars
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-1 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-2 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-3 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Artificial Intelligence' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Artificial Intelligense');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Artificial Intelligence']);
      // Verify contains was called with correct match type (6th call)
      const containsCallUrl = new URL(mockFetch.mock.calls[5]![0] as string);
      expect(containsCallUrl.searchParams.get('match')).toBe('contains');

      vi.unstubAllGlobals();
    });

    it('should return suggestions via first-word startswith for multi-word terms', async () => {
      // "Drug Therapies" (14 chars) → truncated tries: 13, 12, 11 chars
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith miss (full term)
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-1 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-2 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-3 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith first word hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Drug Therapy' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Drug Therapies');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Drug Therapy']);
      // Verify first-word startswith was called with first word only (7th call)
      const firstWordCallUrl = new URL(mockFetch.mock.calls[6]![0] as string);
      expect(firstWordCallUrl.searchParams.get('label')).toBe('Drug');
      expect(firstWordCallUrl.searchParams.get('match')).toBe('startswith');

      vi.unstubAllGlobals();
    });

    it('should not try first-word startswith for single-word terms', async () => {
      // "Xyzzy" (5 chars) → truncated tries: 4, 3 chars (2 iterations)
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-1 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-2 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Xyzzy');

      expect(result.found).toBe(false);
      expect(result.suggestions).toBeUndefined();
      // 5 calls: exact, startswith, 2x truncated, contains (no first-word for single word)
      expect(mockFetch).toHaveBeenCalledTimes(5);

      vi.unstubAllGlobals();
    });

    it('should return suggestions via truncated startswith for suffix typos', async () => {
      // "Artificial Intelligencee" (24 chars) → first truncation: slice(0,23) = "Artificial Intelligence"
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith full miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith "Artificial Intelligence" (len-1) hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Artificial Intelligence' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Artificial Intelligencee');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Artificial Intelligence']);
      // Verify truncated startswith was called with 1 char removed (3rd call)
      const thirdCallUrl = new URL(mockFetch.mock.calls[2]![0] as string);
      expect(thirdCallUrl.searchParams.get('label')).toBe('Artificial Intelligence');
      expect(thirdCallUrl.searchParams.get('match')).toBe('startswith');
      // Should not proceed to contains
      expect(mockFetch).toHaveBeenCalledTimes(3);

      vi.unstubAllGlobals();
    });

    it('should not try truncated startswith when full startswith succeeds', async () => {
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith full hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Diabetes Mellitus' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Diabetes Mell');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Diabetes Mellitus']);
      // Only 2 calls: exact + startswith (no truncated, no contains)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should fall back to contains when truncated startswith also fails', async () => {
      // "Artificial Intelligense" (24 chars) - truncated tries: 23, 22, 21 chars
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith full miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-1 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-2 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-3 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Artificial Intelligence' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Artificial Intelligense');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Artificial Intelligence']);
      // Verify contains was reached after truncated attempts
      const containsCallUrl = new URL(mockFetch.mock.calls[5]![0] as string);
      expect(containsCallUrl.searchParams.get('match')).toBe('contains');

      vi.unstubAllGlobals();
    });

    it('should not try truncated startswith for short terms (<=3 chars)', async () => {
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith full miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss (no truncation attempted)
        .mockResolvedValueOnce({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('ABC');

      expect(result.found).toBe(false);
      expect(result.suggestions).toBeUndefined();
      // Only 3 calls: exact, startswith, contains (no truncated for short term)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      vi.unstubAllGlobals();
    });

    it('should not call contains if startswith succeeds', async () => {
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Diabetes Mellitus' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Diabetes Mell');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Diabetes Mellitus']);
      // Only 2 calls: exact + startswith (no contains)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should return found=false with no suggestions when all fallbacks fail', async () => {
      // "Xyzzy Not A Term" (16 chars) → truncated tries: 15, 14, 13 chars (3 iterations)
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-1 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-2 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // truncated startswith len-3 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // first-word startswith miss
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
    it('should call acquire() once per fetchLookup when term is found (exact hit)', async () => {
      const mockRateLimiter = {
        acquire: vi.fn().mockResolvedValue(undefined),
      } as unknown as RateLimiter;

      const clientWithLimiter = new MeSHLookupClient({ rateLimiter: mockRateLimiter });

      const mockFetch = vi
        .fn()
        // Term 1: exact hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ resource: 'x', label: 'Term A' }],
        })
        // Term 2: exact hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ resource: 'y', label: 'Term B' }],
        });
      vi.stubGlobal('fetch', mockFetch);

      await clientWithLimiter.lookupTerms(['Term A', 'Term B']);

      // 1 acquire per exact fetch = 2 total
      expect(mockRateLimiter.acquire).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should call acquire() twice when term not found (exact miss + startswith)', async () => {
      const mockRateLimiter = {
        acquire: vi.fn().mockResolvedValue(undefined),
      } as unknown as RateLimiter;

      const clientWithLimiter = new MeSHLookupClient({ rateLimiter: mockRateLimiter });

      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        // startswith hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ resource: 'x', label: 'Suggestion' }],
        });
      vi.stubGlobal('fetch', mockFetch);

      await clientWithLimiter.lookupTerm('Misspeled');

      // 1 acquire for exact + 1 acquire for startswith = 2
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

  describe('VocabCache integration', () => {
    it('should skip fetchLookup when cache hits', async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue({ term: 'Diabetes Mellitus', found: true }),
        set: vi.fn(),
      } as unknown as VocabCache;

      const clientWithCache = new MeSHLookupClient({ cache: mockCache });

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const result = await clientWithCache.lookupTerm('Diabetes Mellitus');

      expect(result.found).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockCache.get).toHaveBeenCalledWith('mesh', 'Diabetes Mellitus');

      vi.unstubAllGlobals();
    });

    it('should call API and write to cache on cache miss', async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      } as unknown as VocabCache;

      const clientWithCache = new MeSHLookupClient({ cache: mockCache });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [{ resource: 'x', label: 'Diabetes Mellitus' }],
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await clientWithCache.lookupTerm('Diabetes Mellitus');

      expect(result.found).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockCache.set).toHaveBeenCalledWith(
        'mesh',
        'Diabetes Mellitus',
        { term: 'Diabetes Mellitus', found: true }
      );

      vi.unstubAllGlobals();
    });

    it('should work without cache (undefined)', async () => {
      const clientNoCache = new MeSHLookupClient();

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [{ resource: 'x', label: 'Test' }],
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await clientNoCache.lookupTerm('Test');
      expect(result.found).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });
  });
});
