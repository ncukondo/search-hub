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
      // words[1] = "Intelligense" (12 chars) → step 2c tries: N=8,7,6
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
        // step 2c: multi-word prefix N=8 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: multi-word prefix N=7 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: multi-word prefix N=6 miss
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
      // Verify contains was called with correct match type (9th call)
      const containsCallUrl = new URL(mockFetch.mock.calls[8]![0] as string);
      expect(containsCallUrl.searchParams.get('match')).toBe('contains');

      vi.unstubAllGlobals();
    });

    it('should return suggestions via first-word startswith for multi-word terms', async () => {
      // "Drug Therapies" (14 chars) → truncated tries: 13, 12, 11 chars
      // words[1] = "Therapies" (9 chars) → step 2c tries: N=5,4,3
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
        // step 2c: multi-word prefix N=5 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: multi-word prefix N=4 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: multi-word prefix N=3 miss
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
      // Verify first-word startswith was called with first word only (10th call)
      const firstWordCallUrl = new URL(mockFetch.mock.calls[9]![0] as string);
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

    it('should return suggestions via multi-word progressive prefix (step 2c)', async () => {
      // "Artificial Inteligence" → words[1] = "Inteligence" (11 chars)
      // startN = min(11-4, 11-1) = min(7, 10) = 7
      // N=7: "Artificial Intelig" → miss, N=6: "Artificial Inteli" → miss, N=5: "Artificial Intel" → hit
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
        // step 2c: N=7 "Artificial Intelig" miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: N=6 "Artificial Inteli" miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: N=5 "Artificial Intel" hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Artificial Intelligence' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Artificial Inteligence');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Artificial Intelligence']);
      // Verify step 2c call at N=5 (8th call)
      const step2cCallUrl = new URL(mockFetch.mock.calls[7]![0] as string);
      expect(step2cCallUrl.searchParams.get('label')).toBe('Artificial Intel');
      expect(step2cCallUrl.searchParams.get('match')).toBe('startswith');
      // Should not proceed to contains
      expect(mockFetch).toHaveBeenCalledTimes(8);

      vi.unstubAllGlobals();
    });

    it('should skip step 2c when full startsWith succeeds', async () => {
      const mockFetch = vi
        .fn()
        // exact miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // startswith full hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Artificial Intelligence' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Artificial Intelligen');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Artificial Intelligence']);
      // Only 2 calls: exact + startswith (no step 2c)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should skip step 2c for single-word terms', async () => {
      // "Diabetis" (8 chars) → truncated tries: 7, 6, 5 chars
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
        // contains hit (no step 2c for single word)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Diabetes Mellitus' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Diabetis');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Diabetes Mellitus']);
      // 6 calls: exact, startswith, 3x truncated, contains (no step 2c)
      expect(mockFetch).toHaveBeenCalledTimes(6);

      vi.unstubAllGlobals();
    });

    it('should skip step 2c when second word is 3 chars or less', async () => {
      // "Drug Of" → words[1] = "Of" (2 chars) → step 2c skipped
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
        // contains miss (no step 2c)
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // first-word startswith hit
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Drug Therapy' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Drug Of');

      expect(result.found).toBe(false);
      expect(result.suggestions).toEqual(['Drug Therapy']);
      // 7 calls: no step 2c because words[1].length <= 3
      expect(mockFetch).toHaveBeenCalledTimes(7);

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
      // words[1] = "Intelligense" (12 chars) → step 2c tries: N=8,7,6
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
        // step 2c: multi-word prefix N=8 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: multi-word prefix N=7 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: multi-word prefix N=6 miss
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
      // Verify contains was reached after truncated and step 2c attempts (9th call)
      const containsCallUrl = new URL(mockFetch.mock.calls[8]![0] as string);
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
      // words[1] = "Not" (3 chars) → step 2c skipped
      // step 4b: "Xyzzy" (5 chars) → len=4 "Xyzz", len=3 "Xyz" (2 iterations)
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
        // step 4: first-word startswith miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 4b: startsWith("Xyzz") miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 4b: startsWith("Xyz") miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Xyzzy Not A Term');

      expect(result.found).toBe(false);
      expect(result.term).toBe('Xyzzy Not A Term');
      expect(result.suggestions).toBeUndefined();

      vi.unstubAllGlobals();
    });

    it('should re-rank step 4 results by Levenshtein distance', async () => {
      // "Artificial Inteligence" → all steps 1-3 miss, step 4 hits with limit=25
      // words[1] = "Inteligence" (11 chars) → step 2c: 3 iterations all miss
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
        // step 2c: N=7 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: N=6 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: N=5 miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 4: first-word startswith with limit=25
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Artificial Arm' },
            { resource: 'x', label: 'Artificial Eye' },
            { resource: 'x', label: 'Artificial Intelligence' },
            { resource: 'x', label: 'Artificial Limbs' },
            { resource: 'x', label: 'Artificial Organs' },
            { resource: 'x', label: 'Artificial Cells' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Artificial Inteligence');

      expect(result.found).toBe(false);
      // "Artificial Intelligence" (distance 1) should be first
      expect(result.suggestions![0]).toBe('Artificial Intelligence');
      // Should return at most 5 suggestions
      expect(result.suggestions!.length).toBeLessThanOrEqual(5);
      // Verify step 4 was called with limit=25
      const step4CallUrl = new URL(mockFetch.mock.calls[9]![0] as string);
      expect(step4CallUrl.searchParams.get('limit')).toBe('25');
      expect(step4CallUrl.searchParams.get('label')).toBe('Artificial');

      vi.unstubAllGlobals();
    });

    it('should suggest correct term via step 4b when first word has typo (Brest Neoplasms)', async () => {
      // "Brest Neoplasms" (15 chars) → truncated tries: 14, 13, 12
      // words[1] = "Neoplasms" (9 chars) → step 2c tries: N=5,4,3
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
        // step 2c: N=5 "Brest Neopl" miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: N=4 "Brest Neop" miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 2c: N=3 "Brest Neo" miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 4: startsWith("Brest", 25) → "Brestan" (no "neop" match → filtered out)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Brestan' },
          ],
        })
        // step 4b: startsWith("Bres", 25) → includes "Breast Neoplasms"
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Breast Neoplasms' },
            { resource: 'x', label: 'Breslow Thickness' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Brest Neoplasms');

      expect(result.found).toBe(false);
      expect(result.suggestions).toContain('Breast Neoplasms');
      // step 4b call should use truncated first word
      const step4bCallUrl = new URL(mockFetch.mock.calls[10]![0] as string);
      expect(step4bCallUrl.searchParams.get('label')).toBe('Bres');
      expect(step4bCallUrl.searchParams.get('match')).toBe('startswith');

      vi.unstubAllGlobals();
    });

    it('should suggest correct term via step 4b for another first-word typo (Breat Neoplasms)', async () => {
      // "Breat Neoplasms" → words[1] = "Neoplasms" (9 chars) → step 2c: 3 iterations
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
        // step 2c: 3 misses
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 4: startsWith("Breat", 25) → empty
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 4b: startsWith("Brea", 25) → hit with "Breast Neoplasms"
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Breast Neoplasms' },
            { resource: 'x', label: 'Breast Feeding' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Breat Neoplasms');

      expect(result.found).toBe(false);
      expect(result.suggestions).toContain('Breast Neoplasms');
      expect(result.suggestions).not.toContain('Breast Feeding');

      vi.unstubAllGlobals();
    });

    it('should not reach step 4b when step 4 returns relevant filtered results', async () => {
      // "Breast Neoplasmz" → step 4 returns filtered results → no step 4b
      // words[1] = "Neoplasmz" (9 chars) → step 2c: 3 iterations
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
        // step 2c: 3 misses
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // contains miss
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        // step 4: startsWith("Breast", 25) → includes "Breast Neoplasms" (passes "neop" filter)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { resource: 'x', label: 'Breast Neoplasms' },
            { resource: 'x', label: 'Breast Feeding' },
          ],
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.lookupTerm('Breast Neoplasmz');

      expect(result.found).toBe(false);
      expect(result.suggestions).toContain('Breast Neoplasms');
      // Only 10 calls - step 4b not reached
      expect(mockFetch).toHaveBeenCalledTimes(10);

      vi.unstubAllGlobals();
    });

    it('should skip step 4b for single-word terms', async () => {
      // Single-word terms should never reach step 4b
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
      // 5 calls only - no step 4, 4b, or 4c for single word
      expect(mockFetch).toHaveBeenCalledTimes(5);

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
