/**
 * File-based cache for vocabulary lookup results.
 *
 * Stores MeSH (and future vocabulary) lookup results on disk to avoid
 * redundant API calls. TTL defaults to 30 days.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getConfigDir } from '../config/paths.js';
import type { MeSHLookupResult } from './mesh-lookup.js';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface VocabCacheEntry {
  result: MeSHLookupResult;
  cachedAt: number; // Unix ms
}

type VocabCacheStore = Record<string, VocabCacheEntry>;

export class VocabCache {
  private store: VocabCacheStore = {};
  private readonly cachePath: string;
  private readonly ttlMs: number;

  constructor(options?: { cachePath?: string; ttlMs?: number }) {
    this.cachePath =
      options?.cachePath ??
      join(getConfigDir(), 'cache', 'vocab-lookup.json');
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, 'utf-8');
      this.store = JSON.parse(raw) as VocabCacheStore;
    } catch {
      // File missing or corrupted JSON — start with empty cache
      this.store = {};
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify(this.store), 'utf-8');
  }

  get(vocabulary: string, term: string): MeSHLookupResult | undefined {
    const key = `${vocabulary}:${term}`;
    const entry = this.store[key];
    if (!entry) return undefined;

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      return undefined;
    }

    return entry.result;
  }

  set(vocabulary: string, term: string, result: MeSHLookupResult): void {
    const key = `${vocabulary}:${term}`;
    this.store[key] = { result, cachedAt: Date.now() };
  }
}
