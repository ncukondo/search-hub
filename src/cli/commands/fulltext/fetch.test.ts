/**
 * Tests for fulltext fetch command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFulltextFetch, type FulltextFetchOptions, type FulltextFetchResult } from './fetch';
import type { FulltextMeta, OALocation } from '../../../fulltext/types';
import type { ReviewFile } from '../review/types';

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(),
  stringify: vi.fn().mockReturnValue(''),
}));

vi.mock('../../../fulltext/meta', () => ({
  loadMeta: vi.fn(),
  saveMeta: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../fulltext/download/orchestrator', () => ({
  fetchAllFulltexts: vi.fn(),
}));

vi.mock('../../../fulltext/index-manager', () => ({
  loadIndex: vi.fn(),
  saveIndex: vi.fn().mockResolvedValue(undefined),
  updateEntry: vi.fn(),
}));

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { loadMeta } from '../../../fulltext/meta';
import { fetchAllFulltexts } from '../../../fulltext/download/orchestrator';
import { loadIndex } from '../../../fulltext/index-manager';

const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);
const mockParseYaml = vi.mocked(parseYaml);
const mockLoadMeta = vi.mocked(loadMeta);
const mockFetchAll = vi.mocked(fetchAllFulltexts);
const mockLoadIndex = vi.mocked(loadIndex);

function createReviewFile(articles: Partial<ReviewFile['articles'][0]>[] = []): ReviewFile {
  return {
    sessionId: 'test-session',
    articles: articles.map((a) => ({
      title: 'Test Article',
      reviews: [],
      finalDecision: 'include' as const,
      ...a,
    })),
  };
}

function createMeta(overrides: Partial<FulltextMeta> = {}): FulltextMeta {
  return {
    dirName: 'smith2024-a1b2c3d4',
    citationKey: 'smith2024',
    uuid: 'a1b2c3d4-0000-0000-0000-000000000000',
    title: 'Test Article',
    oaStatus: 'open',
    files: {},
    oaLocations: [
      { source: 'pmc', url: 'https://pmc.example.com/pdf/', urlType: 'pdf', version: 'published' },
    ],
    pmcid: 'PMC1234567',
    ...overrides,
  };
}

describe('executeFulltextFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: reviews.yaml with one included article that has fulltext dir
    const reviewFile = createReviewFile([{
      title: 'Test Article',
      doi: '10.1234/test',
      fulltext: {
        dirName: 'smith2024-a1b2c3d4',
        hasFiles: { pdf: false, xml: false, markdown: false },
      },
    }]);
    mockReadFile.mockResolvedValue('yaml content');
    mockParseYaml.mockReturnValue(reviewFile);

    // Default: meta.json with OA locations
    mockLoadMeta.mockResolvedValue(createMeta());

    // Default: fulltext directory has article dirs
    mockReaddir.mockResolvedValue(['smith2024-a1b2c3d4'] as unknown as never);

    // Default: orchestrator returns success
    mockFetchAll.mockResolvedValue([
      { dirName: 'smith2024-a1b2c3d4', status: 'downloaded', filesDownloaded: ['fulltext.pdf'] },
    ]);

    // Default: index
    mockLoadIndex.mockResolvedValue({
      sessionId: 'test-session',
      updatedAt: new Date().toISOString(),
      entries: {
        'smith2024-a1b2c3d4': {
          dirName: 'smith2024-a1b2c3d4',
          citationKey: 'smith2024',
          doi: '10.1234/test',
          hasFiles: { pdf: false, xml: false, markdown: false },
        },
      },
    });
  });

  it('fetches all articles with OA locations', async () => {
    const result = await executeFulltextFetch({
      sessionId: 'test-session',
      sessionsDir: '/sessions',
    });

    expect(result.summary.downloaded).toBe(1);
    expect(mockFetchAll).toHaveBeenCalled();
  });

  it('filters by source when --source is specified', async () => {
    await executeFulltextFetch({
      sessionId: 'test-session',
      sessionsDir: '/sessions',
      source: ['pmc', 'arxiv'],
    });

    expect(mockFetchAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        sourceFilter: ['pmc', 'arxiv'],
      }),
    );
  });

  it('dry run shows what would be downloaded without downloading', async () => {
    const result = await executeFulltextFetch({
      sessionId: 'test-session',
      sessionsDir: '/sessions',
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.articles.length).toBeGreaterThan(0);
    expect(mockFetchAll).not.toHaveBeenCalled();
  });

  it('returns summary with downloaded, failed, skipped counts', async () => {
    // Setup: 3 articles
    const reviewFile = createReviewFile([
      { title: 'Art1', doi: '10.1/a', fulltext: { dirName: 'art1-aaaa', hasFiles: { pdf: false, xml: false, markdown: false } } },
      { title: 'Art2', doi: '10.1/b', fulltext: { dirName: 'art2-bbbb', hasFiles: { pdf: true, xml: false, markdown: false } } },
      { title: 'Art3', doi: '10.1/c', fulltext: { dirName: 'art3-cccc', hasFiles: { pdf: false, xml: false, markdown: false } } },
    ]);
    mockParseYaml.mockReturnValue(reviewFile);

    mockLoadMeta
      .mockResolvedValueOnce(createMeta({ dirName: 'art1-aaaa', oaStatus: 'open', oaLocations: [
        { source: 'pmc', url: 'https://pmc/a', urlType: 'pdf', version: 'published' },
      ] }))
      .mockResolvedValueOnce(createMeta({ dirName: 'art2-bbbb', oaStatus: 'open', files: {
        pdf: { filename: 'fulltext.pdf', source: 'pmc', retrievedAt: '2024-01-01' },
      } }))
      .mockResolvedValueOnce(createMeta({ dirName: 'art3-cccc', oaStatus: 'open', oaLocations: [
        { source: 'unpaywall', url: 'https://oa/c', urlType: 'pdf', version: 'published' },
      ] }));

    mockReaddir.mockResolvedValue(['art1-aaaa', 'art2-bbbb', 'art3-cccc'] as unknown as never);

    mockFetchAll.mockResolvedValue([
      { dirName: 'art1-aaaa', status: 'downloaded', filesDownloaded: ['fulltext.pdf'] },
      { dirName: 'art3-cccc', status: 'failed', error: 'HTTP 403' },
    ]);

    const result = await executeFulltextFetch({
      sessionId: 'test-session',
      sessionsDir: '/sessions',
    });

    expect(result.summary.downloaded).toBe(1);
    expect(result.summary.failed).toBe(1);
    // art2 already has PDF so it's skipped
    expect(result.summary.skipped).toBe(1);
  });

  it('skips articles without OA locations', async () => {
    mockLoadMeta.mockResolvedValue(createMeta({
      oaStatus: 'closed',
      oaLocations: [],
    }));

    const result = await executeFulltextFetch({
      sessionId: 'test-session',
      sessionsDir: '/sessions',
    });

    expect(result.summary.skipped).toBe(1);
    expect(mockFetchAll).toHaveBeenCalledWith([], expect.anything(), expect.anything());
  });

  it('skips articles that already have PDF', async () => {
    mockLoadMeta.mockResolvedValue(createMeta({
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01' },
      },
    }));

    const result = await executeFulltextFetch({
      sessionId: 'test-session',
      sessionsDir: '/sessions',
    });

    expect(result.summary.skipped).toBe(1);
    expect(mockFetchAll).toHaveBeenCalledWith([], expect.anything(), expect.anything());
  });
});
