import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestVersion } from './check.js';

function makeFetchOk(tag: string, url: string): typeof globalThis.fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ tag_name: tag, html_url: url }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
  ) as unknown as typeof globalThis.fetch;
}

function makeFetchStatus(status: number): typeof globalThis.fetch {
  return vi.fn(
    async () =>
      new Response('rate limit', {
        status,
        headers: { 'content-type': 'text/plain' },
      })
  ) as unknown as typeof globalThis.fetch;
}

function makeFetchThrow(): typeof globalThis.fetch {
  return vi.fn(async () => {
    throw new Error('network down');
  }) as unknown as typeof globalThis.fetch;
}

describe('getLatestVersion', () => {
  let testDir: string;
  let cachePath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `upgrade-check-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    cachePath = join(testDir, 'update-check.json');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('returns cached value without HTTP when cache is fresh (< 24h)', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const checkedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({
        checkedAt,
        latest: '0.24.0',
        url: 'https://github.com/ncukondo/search-hub/releases/tag/v0.24.0',
      })
    );
    const fetchFn = vi.fn();

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      now: () => now,
    });

    expect(result).toEqual({
      checkedAt,
      latest: '0.24.0',
      url: 'https://github.com/ncukondo/search-hub/releases/tag/v0.24.0',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('triggers HTTP fetch and writes cache when cache is stale (> 24h)', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const checkedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({
        checkedAt,
        latest: '0.23.0',
        url: 'https://example.com/old',
      })
    );
    const fetchFn = makeFetchOk(
      'v0.24.0',
      'https://github.com/ncukondo/search-hub/releases/tag/v0.24.0'
    );

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn,
      now: () => now,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result?.latest).toBe('0.24.0');
    expect(result?.url).toBe('https://github.com/ncukondo/search-hub/releases/tag/v0.24.0');
    expect(result?.checkedAt).toBe(now.toISOString());

    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cached.latest).toBe('0.24.0');
    expect(cached.checkedAt).toBe(now.toISOString());
  });

  it('triggers HTTP fetch and writes cache when no cache exists', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const fetchFn = makeFetchOk(
      'v1.0.0',
      'https://github.com/ncukondo/search-hub/releases/tag/v1.0.0'
    );

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn,
      now: () => now,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result?.latest).toBe('1.0.0');
    expect(existsSync(cachePath)).toBe(true);
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cached.latest).toBe('1.0.0');
  });

  it('creates missing parent directories for the cache file', async () => {
    const nestedCachePath = join(testDir, 'data', 'search-hub', 'update-check.json');
    const now = new Date('2026-07-12T12:00:00Z');
    const fetchFn = makeFetchOk(
      'v1.0.0',
      'https://github.com/ncukondo/search-hub/releases/tag/v1.0.0'
    );

    const result = await getLatestVersion({
      cachePath: nestedCachePath,
      fetch: fetchFn,
      now: () => now,
    });

    expect(result?.latest).toBe('1.0.0');
    expect(existsSync(nestedCachePath)).toBe(true);
  });

  it('sends the search-hub user-agent and GitHub accept header', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const fetchFn = makeFetchOk(
      'v1.0.0',
      'https://github.com/ncukondo/search-hub/releases/tag/v1.0.0'
    );

    await getLatestVersion({ cachePath, fetch: fetchFn, now: () => now });

    const mock = fetchFn as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/ncukondo/search-hub/releases/latest');
    expect(init.headers).toMatchObject({
      accept: 'application/vnd.github+json',
      'user-agent': 'search-hub-update-check',
    });
  });

  it('force=true bypasses fresh cache and re-fetches', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const checkedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({
        checkedAt,
        latest: '0.23.0',
        url: 'https://example.com/old',
      })
    );
    const fetchFn = makeFetchOk(
      'v0.24.0',
      'https://github.com/ncukondo/search-hub/releases/tag/v0.24.0'
    );

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn,
      now: () => now,
      force: true,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result?.latest).toBe('0.24.0');
  });

  it('returns null and does not write cache on network failure', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const fetchFn = makeFetchThrow();

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn,
      now: () => now,
    });

    expect(result).toBeNull();
    expect(existsSync(cachePath)).toBe(false);
  });

  it('falls back to existing cache on GitHub 403 (rate limit)', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const checkedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const existingCache = {
      checkedAt,
      latest: '0.23.0',
      url: 'https://example.com/old',
    };
    writeFileSync(cachePath, JSON.stringify(existingCache));
    const fetchFn = makeFetchStatus(403);

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn,
      now: () => now,
    });

    expect(result).toEqual(existingCache);
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cached).toEqual(existingCache);
  });

  it('returns null on GitHub 403 (rate limit) when no cache exists', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const fetchFn = makeFetchStatus(403);

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn,
      now: () => now,
    });

    expect(result).toBeNull();
    expect(existsSync(cachePath)).toBe(false);
  });

  it('falls back to existing cache on GitHub 429 (secondary rate limit)', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const checkedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const existingCache = {
      checkedAt,
      latest: '0.23.0',
      url: 'https://example.com/old',
    };
    writeFileSync(cachePath, JSON.stringify(existingCache));
    const fetchFn = makeFetchStatus(429);

    const result = await getLatestVersion({
      cachePath,
      fetch: fetchFn,
      now: () => now,
    });

    expect(result).toEqual(existingCache);
  });

  it("strips a leading 'v' from tag_name", async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const fetchFn = makeFetchOk(
      'v2.5.1',
      'https://github.com/ncukondo/search-hub/releases/tag/v2.5.1'
    );

    const result = await getLatestVersion({ cachePath, fetch: fetchFn, now: () => now });

    expect(result?.latest).toBe('2.5.1');
  });

  it("accepts tag_name without leading 'v'", async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const fetchFn = makeFetchOk(
      '2.5.1',
      'https://github.com/ncukondo/search-hub/releases/tag/2.5.1'
    );

    const result = await getLatestVersion({ cachePath, fetch: fetchFn, now: () => now });

    expect(result?.latest).toBe('2.5.1');
  });

  it('returns null and preserves cache when fetched JSON is malformed', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const existingCache = {
      checkedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
      latest: '0.23.0',
      url: 'https://example.com/old',
    };
    writeFileSync(cachePath, JSON.stringify(existingCache));
    const fetchFn = vi.fn(
      async () =>
        new Response('not json at all', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
    ) as unknown as typeof globalThis.fetch;

    const result = await getLatestVersion({ cachePath, fetch: fetchFn, now: () => now });

    expect(result).toBeNull();
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cached).toEqual(existingCache);
  });

  it('ignores corrupt cache file and re-fetches', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    writeFileSync(cachePath, '{not valid json');
    const fetchFn = makeFetchOk(
      'v0.24.0',
      'https://github.com/ncukondo/search-hub/releases/tag/v0.24.0'
    );

    const result = await getLatestVersion({ cachePath, fetch: fetchFn, now: () => now });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result?.latest).toBe('0.24.0');
  });
});
