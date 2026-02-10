import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VocabCache } from './vocab-cache.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { MeSHLookupResult } from './mesh-lookup.js';

vi.mock('node:fs/promises');

describe('VocabCache', () => {
  const testCachePath = '/tmp/test-cache/vocab-lookup.json';
  let cache: VocabCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new VocabCache({ cachePath: testCachePath, ttlMs: 1000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('should return cached result on hit', () => {
      const result: MeSHLookupResult = { term: 'Diabetes Mellitus', found: true };
      cache.set('mesh', 'Diabetes Mellitus', result);

      const cached = cache.get('mesh', 'Diabetes Mellitus');
      expect(cached).toEqual(result);
    });

    it('should return undefined on cache miss', () => {
      const cached = cache.get('mesh', 'Unknown Term');
      expect(cached).toBeUndefined();
    });

    it('should return undefined when TTL has expired', () => {
      const result: MeSHLookupResult = { term: 'Expired', found: true };
      cache.set('mesh', 'Expired', result);

      // Advance time past TTL
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);

      const cached = cache.get('mesh', 'Expired');
      expect(cached).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should store result in cache', () => {
      const result: MeSHLookupResult = {
        term: 'Test',
        found: false,
        suggestions: ['Test Suggestion'],
      };
      cache.set('mesh', 'Test', result);

      expect(cache.get('mesh', 'Test')).toEqual(result);
    });
  });

  describe('load', () => {
    it('should load cache from file', async () => {
      const stored: MeSHLookupResult = { term: 'Diabetes Mellitus', found: true };
      const cacheData = {
        'mesh:Diabetes Mellitus': {
          result: stored,
          cachedAt: Date.now(),
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      await cache.load();

      expect(cache.get('mesh', 'Diabetes Mellitus')).toEqual(stored);
    });

    it('should initialize empty cache when file does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await cache.load();

      expect(cache.get('mesh', 'anything')).toBeUndefined();
    });

    it('should initialize empty cache on corrupted JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('not valid json {{{');

      await cache.load();

      expect(cache.get('mesh', 'anything')).toBeUndefined();
    });
  });

  describe('save', () => {
    it('should write cache to file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result: MeSHLookupResult = { term: 'Test', found: true };
      cache.set('mesh', 'Test', result);

      await cache.save();

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.dirname(testCachePath),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        testCachePath,
        expect.any(String),
        'utf-8'
      );

      // Verify the written JSON is valid and contains the entry
      const writtenJson = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      const parsed = JSON.parse(writtenJson) as Record<string, unknown>;
      expect(parsed).toHaveProperty('mesh:Test');
    });

    it('should create parent directories if needed', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await cache.save();

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.dirname(testCachePath),
        { recursive: true }
      );
    });
  });
});
