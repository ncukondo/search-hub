import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeSHLookupClient } from './mesh-lookup.js';

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

    it('should return found=false with no suggestions when startswith also returns empty', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });
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
});
