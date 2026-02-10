/**
 * Tests for fulltext fetch command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFulltextFetch } from './fetch';
import type { FulltextMeta } from '@ncukondo/academic-fulltext';
import type { ReviewFile } from '../review/types';

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(),
  stringify: vi.fn().mockReturnValue(''),
}));

vi.mock('@ncukondo/academic-fulltext', () => ({
  loadMeta: vi.fn(),
  saveMeta: vi.fn().mockResolvedValue(undefined),
  fetchAllFulltexts: vi.fn(),
}));

vi.mock('./convert', () => ({
  executeFulltextConvert: vi.fn().mockResolvedValue({ success: true, converted: 1, skipped: 0, failed: 0, articles: [] }),
}));

import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { loadMeta, fetchAllFulltexts } from '@ncukondo/academic-fulltext';
import { executeFulltextConvert } from './convert';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockParseYaml = vi.mocked(parseYaml);
const mockStringifyYaml = vi.mocked(stringifyYaml);
const mockLoadMeta = vi.mocked(loadMeta);
const mockFetchAll = vi.mocked(fetchAllFulltexts);
const mockConvert = vi.mocked(executeFulltextConvert);

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
        hasFiles: { pdf: false, xml: false, html: false, markdown: false },
      },
    }]);
    mockReadFile.mockResolvedValue('yaml content');
    mockParseYaml.mockReturnValue(reviewFile);

    // Default: meta.json with OA locations
    mockLoadMeta.mockResolvedValue(createMeta());

    // Default: orchestrator returns success
    mockFetchAll.mockResolvedValue([
      { dirName: 'smith2024-a1b2c3d4', status: 'downloaded', filesDownloaded: ['fulltext.pdf'] },
    ]);

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
      { title: 'Art1', doi: '10.1/a', fulltext: { dirName: 'art1-aaaa', hasFiles: { pdf: false, xml: false, html: false, markdown: false } } },
      { title: 'Art2', doi: '10.1/b', fulltext: { dirName: 'art2-bbbb', hasFiles: { pdf: true, xml: false, html: false, markdown: false } } },
      { title: 'Art3', doi: '10.1/c', fulltext: { dirName: 'art3-cccc', hasFiles: { pdf: false, xml: false, html: false, markdown: false } } },
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

  describe('auto-convert XML to Markdown', () => {
    it('auto-converts PMC XML to Markdown by default', async () => {
      mockFetchAll.mockResolvedValue([
        { dirName: 'smith2024-a1b2c3d4', status: 'downloaded', filesDownloaded: ['fulltext.pdf', 'fulltext.xml'] },
      ]);

      await executeFulltextFetch({
        sessionId: 'test-session',
        sessionsDir: '/sessions',
      });

      expect(mockConvert).toHaveBeenCalledWith(
        { sessionId: 'test-session', article: 'smith2024-a1b2c3d4' },
        '/sessions',
      );
    });

    it('skips conversion when --no-convert-markdown is passed', async () => {
      mockFetchAll.mockResolvedValue([
        { dirName: 'smith2024-a1b2c3d4', status: 'downloaded', filesDownloaded: ['fulltext.pdf', 'fulltext.xml'] },
      ]);

      await executeFulltextFetch({
        sessionId: 'test-session',
        sessionsDir: '/sessions',
        convertMarkdown: false,
      });

      expect(mockConvert).not.toHaveBeenCalled();
    });

    it('only converts articles that downloaded XML', async () => {
      mockFetchAll.mockResolvedValue([
        { dirName: 'smith2024-a1b2c3d4', status: 'downloaded', filesDownloaded: ['fulltext.pdf'] },
      ]);

      await executeFulltextFetch({
        sessionId: 'test-session',
        sessionsDir: '/sessions',
      });

      expect(mockConvert).not.toHaveBeenCalled();
    });
  });

  describe('reviews.yaml integration', () => {
    it('updates reviews.yaml hasFiles after successful fetch', async () => {
      // The updateReviewsAndIndex re-reads reviews.yaml, so mock second read
      const reviewFile = createReviewFile([{
        title: 'Test Article',
        doi: '10.1234/test',
        fulltext: {
          dirName: 'smith2024-a1b2c3d4',
          hasFiles: { pdf: false, xml: false, html: false, markdown: false },
        },
      }]);
      // Both reads return the same review file
      mockParseYaml.mockReturnValue(reviewFile);

      mockFetchAll.mockResolvedValue([
        { dirName: 'smith2024-a1b2c3d4', status: 'downloaded', filesDownloaded: ['fulltext.pdf', 'fulltext.xml'] },
      ]);

      await executeFulltextFetch({
        sessionId: 'test-session',
        sessionsDir: '/sessions',
      });

      // Verify writeFile was called for reviews.yaml
      expect(mockWriteFile).toHaveBeenCalled();
      // Verify stringify was called with updated review file
      expect(mockStringifyYaml).toHaveBeenCalled();
      const writtenReview = mockStringifyYaml.mock.calls[0]![0] as ReviewFile;
      const updatedArticle = writtenReview.articles[0];
      expect(updatedArticle?.fulltext?.hasFiles).toEqual({
        pdf: true,
        xml: true,
        html: false,
        markdown: false,
      });
    });

    it('only updates articles that were fetched, not failed ones', async () => {
      const reviewFile = createReviewFile([
        { title: 'Art1', doi: '10.1/a', fulltext: { dirName: 'art1-aaaa', hasFiles: { pdf: false, xml: false, html: false, markdown: false } } },
        { title: 'Art2', doi: '10.1/b', fulltext: { dirName: 'art2-bbbb', hasFiles: { pdf: false, xml: false, html: false, markdown: false } } },
      ]);
      mockParseYaml.mockReturnValue(reviewFile);

      mockLoadMeta
        .mockResolvedValueOnce(createMeta({ dirName: 'art1-aaaa', oaStatus: 'open', oaLocations: [
          { source: 'pmc', url: 'https://pmc/a', urlType: 'pdf', version: 'published' },
        ] }))
        .mockResolvedValueOnce(createMeta({ dirName: 'art2-bbbb', oaStatus: 'open', oaLocations: [
          { source: 'unpaywall', url: 'https://oa/b', urlType: 'pdf', version: 'published' },
        ] }));

      mockFetchAll.mockResolvedValue([
        { dirName: 'art1-aaaa', status: 'downloaded', filesDownloaded: ['fulltext.pdf'] },
        { dirName: 'art2-bbbb', status: 'failed', error: 'HTTP 403' },
      ]);

      await executeFulltextFetch({
        sessionId: 'test-session',
        sessionsDir: '/sessions',
      });

      expect(mockStringifyYaml).toHaveBeenCalled();
      const writtenReview = mockStringifyYaml.mock.calls[0]![0] as ReviewFile;

      // art1 was downloaded → hasFiles updated
      const art1 = writtenReview.articles.find((a) => a.fulltext?.dirName === 'art1-aaaa');
      expect(art1?.fulltext?.hasFiles.pdf).toBe(true);

      // art2 failed → hasFiles NOT updated
      const art2 = writtenReview.articles.find((a) => a.fulltext?.dirName === 'art2-bbbb');
      expect(art2?.fulltext?.hasFiles.pdf).toBe(false);
    });

    it('does not update reviews.yaml when no articles were downloaded', async () => {
      mockLoadMeta.mockResolvedValue(createMeta({
        oaStatus: 'closed',
        oaLocations: [],
      }));

      mockFetchAll.mockResolvedValue([]);

      await executeFulltextFetch({
        sessionId: 'test-session',
        sessionsDir: '/sessions',
      });

      // writeFile should not be called (only readFile for the initial reviews.yaml read)
      expect(mockStringifyYaml).not.toHaveBeenCalled();
    });
  });
});
