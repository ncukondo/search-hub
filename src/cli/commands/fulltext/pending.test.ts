/**
 * Tests for fulltext pending command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFulltextPending } from './pending';
import type { FulltextMeta } from '@ncukondo/academic-fulltext';
import { loadMeta, getMetaPath } from '@ncukondo/academic-fulltext';

// Mock fs operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  access: vi.fn(),
}));

// Mock package functions
vi.mock('@ncukondo/academic-fulltext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ncukondo/academic-fulltext')>();
  return { ...actual, loadMeta: vi.fn(), getMetaPath: vi.fn() };
});

import { readFile, writeFile } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockLoadMeta = vi.mocked(loadMeta);
const mockGetMetaPath = vi.mocked(getMetaPath);

// Review YAML with articles in various fulltext states
const reviewFileYaml = `
sessionId: test-session
articles:
  - doi: "10.1234/no-fulltext"
    title: "Article Without Fulltext"
    authors: "Smith J"
    year: "2024"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: smith2024-aaaa1111
      hasFiles: { pdf: false, xml: false, html: false, markdown: false }
  - doi: "10.5678/has-pdf"
    title: "Article With PDF"
    authors: "Jones B"
    year: "2023"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: jones2023-bbbb2222
      hasFiles: { pdf: true, xml: false, html: false, markdown: false }
  - doi: "10.9999/no-dir"
    title: "Article Not Initialized"
    authors: "Lee C"
    year: "2024"
    reviews: []
    finalDecision: include
  - doi: "10.1111/with-oa"
    pmid: "33333333"
    title: "Article With OA Location"
    authors: "Chen D"
    year: "2024"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: chen2024-cccc3333
      hasFiles: { pdf: false, xml: false, html: false, markdown: false }
  - doi: "10.2222/excluded"
    title: "Excluded Article"
    reviews: []
    finalDecision: exclude
`;

// Meta for article without files (pending)
const metaNoPdf: FulltextMeta = {
  dirName: 'smith2024-aaaa1111',
  citationKey: 'smith2024',
  uuid: 'aaaa1111-0000-0000-0000-000000000000',
  doi: '10.1234/no-fulltext',
  title: 'Article Without Fulltext',
  authors: 'Smith J',
  year: '2024',
  oaStatus: 'closed',
  files: {},
};

// Meta for article with PDF
const metaWithPdf: FulltextMeta = {
  dirName: 'jones2023-bbbb2222',
  citationKey: 'jones2023',
  uuid: 'bbbb2222-0000-0000-0000-000000000000',
  doi: '10.5678/has-pdf',
  title: 'Article With PDF',
  authors: 'Jones B',
  year: '2023',
  oaStatus: 'open',
  files: { pdf: { filename: 'fulltext.pdf', source: 'unpaywall', retrievedAt: '2024-01-01T00:00:00Z' } },
};

// Meta for article with OA locations
const metaWithOA: FulltextMeta = {
  dirName: 'chen2024-cccc3333',
  citationKey: 'chen2024',
  uuid: 'cccc3333-0000-0000-0000-000000000000',
  doi: '10.1111/with-oa',
  pmid: '33333333',
  title: 'Article With OA Location',
  authors: 'Chen D',
  year: '2024',
  oaStatus: 'open',
  oaLocations: [
    { source: 'unpaywall', url: 'https://repository.edu/paper.pdf', urlType: 'pdf', version: 'published' },
    { source: 'pmc', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12345/', urlType: 'html', version: 'published' },
  ],
  files: {},
};

describe('executeFulltextPending', () => {
  const sessionDir = '/sessions/test-session';

  beforeEach(() => {
    vi.resetAllMocks();

    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('reviews.yaml')) return reviewFileYaml;
      throw new Error(`File not found: ${p}`);
    });

    // Mock getMetaPath to return predictable paths
    mockGetMetaPath.mockImplementation((sessionDir: string, dirName: string) =>
      `${sessionDir}/fulltext/${dirName}/meta.json`
    );

    // Mock loadMeta to return meta based on path
    const metaMap: Record<string, FulltextMeta> = {
      'smith2024-aaaa1111': metaNoPdf,
      'jones2023-bbbb2222': metaWithPdf,
      'chen2024-cccc3333': metaWithOA,
    };
    mockLoadMeta.mockImplementation(async (path: string) => {
      for (const [dirName, meta] of Object.entries(metaMap)) {
        if (path.includes(dirName)) return meta;
      }
      throw new Error(`File not found: ${path}`);
    });
  });

  it('lists articles without fulltext', async () => {
    const result = await executeFulltextPending({ sessionDir });
    // Should include: smith2024 (no files), lee (no dir), chen (no files but has OA)
    // Should exclude: jones (has PDF), excluded article
    expect(result.articles).toHaveLength(3);
    const dirNames = result.articles.map((a) => a.dirName);
    expect(dirNames).toContain('smith2024-aaaa1111');
    expect(dirNames).toContain('chen2024-cccc3333');
    // lee2024 has no dirName (not initialized)
    const leeArticle = result.articles.find((a) => a.doi === '10.9999/no-dir');
    expect(leeArticle).toBeDefined();
    expect(leeArticle?.dirName).toBeUndefined();
  });

  it('shows DOI and suggested URLs from OA check', async () => {
    const result = await executeFulltextPending({ sessionDir });
    const chen = result.articles.find((a) => a.doi === '10.1111/with-oa');
    expect(chen).toBeDefined();
    expect(chen?.oaLocations).toHaveLength(2);
    expect(chen?.oaLocations?.[0]?.url).toBe('https://repository.edu/paper.pdf');
  });

  it('shows publisher URL (doi.org link)', async () => {
    const result = await executeFulltextPending({ sessionDir });
    const smith = result.articles.find((a) => a.doi === '10.1234/no-fulltext');
    expect(smith).toBeDefined();
    expect(smith?.publisherUrl).toBe('https://doi.org/10.1234/no-fulltext');
  });

  it('--format json outputs structured data', async () => {
    const result = await executeFulltextPending({ sessionDir, format: 'json' });
    expect(result.totalPending).toBe(3);
    expect(Array.isArray(result.articles)).toBe(true);
    for (const article of result.articles) {
      expect(article).toHaveProperty('title');
      expect(article).toHaveProperty('doi');
    }
  });

  it('handles session with no pending articles', async () => {
    const allDoneYaml = `
sessionId: test-session
articles:
  - doi: "10.5678/has-pdf"
    title: "Article With PDF"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: jones2023-bbbb2222
      hasFiles: { pdf: true, xml: false, html: false, markdown: false }
`;
    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('reviews.yaml')) return allDoneYaml;
      throw new Error(`File not found: ${p}`);
    });
    mockLoadMeta.mockResolvedValue(metaWithPdf);

    const result = await executeFulltextPending({ sessionDir });
    expect(result.totalPending).toBe(0);
    expect(result.articles).toHaveLength(0);
  });

  it('handles missing reviews.yaml', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await expect(
      executeFulltextPending({ sessionDir }),
    ).rejects.toThrow();
  });

  describe('--export', () => {
    it('--export writes URLs to file', async () => {
      await executeFulltextPending({
        sessionDir,
        exportPath: '/tmp/urls.txt',
      });

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [path, content] = mockWriteFile.mock.calls[0]!;
      expect(String(path)).toBe('/tmp/urls.txt');
      expect(String(content)).toContain('https://doi.org/');
    });

    it('format: one URL per line with article identifier', async () => {
      await executeFulltextPending({
        sessionDir,
        exportPath: '/tmp/urls.txt',
      });

      const content = String(mockWriteFile.mock.calls[0]![1]);
      const lines = content.split('\n');

      // Should have comment lines with article identifiers
      const commentLines = lines.filter((l) => l.startsWith('# '));
      expect(commentLines.length).toBeGreaterThanOrEqual(3);

      // Should have URL lines
      const urlLines = lines.filter((l) => l.startsWith('https://'));
      expect(urlLines.length).toBeGreaterThanOrEqual(3);
    });

    it('includes DOI link for all articles with DOI', async () => {
      await executeFulltextPending({
        sessionDir,
        exportPath: '/tmp/urls.txt',
      });

      const content = String(mockWriteFile.mock.calls[0]![1]);
      // All 3 pending articles have DOIs
      expect(content).toContain('https://doi.org/10.1234/no-fulltext');
      expect(content).toContain('https://doi.org/10.9999/no-dir');
      expect(content).toContain('https://doi.org/10.1111/with-oa');
    });

    it('includes OA repository URLs when available', async () => {
      await executeFulltextPending({
        sessionDir,
        exportPath: '/tmp/urls.txt',
      });

      const content = String(mockWriteFile.mock.calls[0]![1]);
      expect(content).toContain('https://repository.edu/paper.pdf');
      expect(content).toContain('https://pmc.ncbi.nlm.nih.gov/articles/PMC12345/');
    });
  });
});
