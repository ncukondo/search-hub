/**
 * Tests for fulltext check command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFulltextCheck } from './check';
import * as academicFulltext from '@ncukondo/academic-fulltext';
import type { FulltextMeta } from '@ncukondo/academic-fulltext';

// Mock the package
vi.mock('@ncukondo/academic-fulltext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ncukondo/academic-fulltext')>();
  return { ...actual, discoverOA: vi.fn(), loadMeta: vi.fn(), saveMeta: vi.fn() };
});
const mockDiscoverOA = vi.mocked(academicFulltext.discoverOA);
const mockLoadMeta = vi.mocked(academicFulltext.loadMeta);
const mockSaveMeta = vi.mocked(academicFulltext.saveMeta);

// Mock fs operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}));

import { readFile, writeFile, readdir, access } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockReaddir = vi.mocked(readdir);
const mockAccess = vi.mocked(access);

describe('executeFulltextCheck', () => {
  const sessionDir = '/sessions/test-session';

  // Sample review file with included articles
  const reviewFileYaml = `
sessionId: test-session
criteria:
  include: []
  exclude: []
articles:
  - doi: "10.1234/open"
    pmid: "11111111"
    title: "Open Access Article"
    authors: "Smith J"
    year: "2024"
    reviews: []
    finalDecision: include
  - doi: "10.1234/closed"
    title: "Closed Access Article"
    reviews: []
    finalDecision: include
  - doi: "10.1234/excluded"
    title: "Excluded Article"
    reviews: []
    finalDecision: exclude
`;

  const sampleMeta: FulltextMeta = {
    dirName: 'smith2024-abcd1234',
    citationKey: 'smith2024',
    uuid: 'abcd1234-5678-9012-3456-789012345678',
    doi: '10.1234/open',
    pmid: '11111111',
    title: 'Open Access Article',
    authors: 'Smith J',
    year: '2024',
    oaStatus: 'unchecked',
    files: {},
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Default: reviews.yaml exists
    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('reviews.yaml')) return reviewFileYaml;
      throw new Error(`File not found: ${p}`);
    });

    // Default: loadMeta returns sample meta
    mockLoadMeta.mockResolvedValue(sampleMeta);

    // Default: fulltext directory with one entry
    mockReaddir.mockResolvedValue(
      ['smith2024-abcd1234'] as unknown as Awaited<ReturnType<typeof readdir>>
    );

    // Default: access succeeds
    mockAccess.mockResolvedValue(undefined);

    // Default: discovery returns open for first article, closed for second
    mockDiscoverOA.mockImplementation(async (article) => {
      if (article.doi === '10.1234/open') {
        return {
          oaStatus: 'open' as const,
          locations: [
            { source: 'unpaywall' as const, url: 'https://example.com/paper.pdf', urlType: 'pdf' as const, version: 'published' as const },
          ],
          errors: [],
          skipped: [],
          checkedSources: [],
          discoveredIds: {},
        };
      }
      return {
        oaStatus: 'closed' as const,
        locations: [],
        errors: [],
        skipped: [],
        checkedSources: [],
        discoveredIds: {},
      };
    });
  });

  it('checks OA for all included articles', async () => {
    const result = await executeFulltextCheck({
      sessionDir,
      config: { unpaywallEmail: 'test@example.com', coreApiKey: '', preferSources: [] },
    });

    // Should check 2 included articles (not the excluded one)
    expect(mockDiscoverOA).toHaveBeenCalledTimes(2);
    expect(result.summary.total).toBe(2);
  });

  it('updates meta.json with OA results', async () => {
    await executeFulltextCheck({
      sessionDir,
      config: { unpaywallEmail: 'test@example.com', coreApiKey: '', preferSources: [] },
    });

    // Should save updated meta via the package's saveMeta
    expect(mockSaveMeta).toHaveBeenCalled();
  });

  it('returns correct summary (open, closed, unknown)', async () => {
    const result = await executeFulltextCheck({
      sessionDir,
      config: { unpaywallEmail: 'test@example.com', coreApiKey: '', preferSources: [] },
    });

    expect(result.summary.open).toBe(1);
    expect(result.summary.closed).toBe(1);
    expect(result.summary.unknown).toBe(0);
  });

  it('returns structured data for --format json', async () => {
    const result = await executeFulltextCheck({
      sessionDir,
      config: { unpaywallEmail: 'test@example.com', coreApiKey: '', preferSources: [] },
    });

    // Should have articles array with OA info
    expect(result.articles).toHaveLength(2);
    const openArticle = result.articles.find((a) => a.doi === '10.1234/open');
    expect(openArticle).toBeDefined();
    expect(openArticle?.oaStatus).toBe('open');
  });

  it('handles missing fulltext directory gracefully', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await executeFulltextCheck({
      sessionDir,
      config: { unpaywallEmail: 'test@example.com', coreApiKey: '', preferSources: [] },
    });

    // Should still check articles but not update meta
    expect(result.summary.total).toBe(2);
  });

  it('processes articles concurrently with limited parallelism', async () => {
    // Create a review file with 5 included articles
    const manyArticlesYaml = `
sessionId: test-session
criteria:
  include: []
  exclude: []
articles:
  - doi: "10.1234/a1"
    title: "Article 1"
    reviews: []
    finalDecision: include
  - doi: "10.1234/a2"
    title: "Article 2"
    reviews: []
    finalDecision: include
  - doi: "10.1234/a3"
    title: "Article 3"
    reviews: []
    finalDecision: include
  - doi: "10.1234/a4"
    title: "Article 4"
    reviews: []
    finalDecision: include
  - doi: "10.1234/a5"
    title: "Article 5"
    reviews: []
    finalDecision: include
`;
    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('reviews.yaml')) return manyArticlesYaml;
      throw new Error(`File not found: ${p}`);
    });
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    mockDiscoverOA.mockImplementation(async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return { oaStatus: 'closed' as const, locations: [], errors: [], skipped: [], checkedSources: [], discoveredIds: {} };
    });

    const result = await executeFulltextCheck({
      sessionDir,
      config: { unpaywallEmail: 'test@example.com', coreApiKey: '', preferSources: [] },
      concurrency: 2,
    });

    expect(result.summary.total).toBe(5);
    // Verify concurrency was limited to 2
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    // Verify concurrency was actually used (> 1 concurrent)
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it('handles missing reviews.yaml', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await expect(
      executeFulltextCheck({
        sessionDir,
        config: { unpaywallEmail: 'test@example.com', coreApiKey: '', preferSources: [] },
      })
    ).rejects.toThrow();
  });
});
