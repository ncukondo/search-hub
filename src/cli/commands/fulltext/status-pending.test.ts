/**
 * Integration tests for fulltext status and pending commands.
 * Tests that status reflects actual fulltext state and pending excludes articles with fulltext.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFulltextStatus } from './status';
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

import { readFile } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockLoadMeta = vi.mocked(loadMeta);
const mockGetMetaPath = vi.mocked(getMetaPath);

// Shared review data: 4 articles in various fulltext states
const reviewFileYaml = `
sessionId: integration-test
articles:
  - doi: "10.1234/with-pdf"
    title: "Article With PDF"
    authors: "Alpha A"
    year: "2024"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: alpha2024-aaaa1111
      hasFiles: { pdf: true, xml: false, html: false, markdown: false }
  - doi: "10.1234/with-both"
    title: "Article With Both"
    authors: "Beta B"
    year: "2024"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: beta2024-bbbb2222
      hasFiles: { pdf: true, xml: false, html: false, markdown: true }
  - doi: "10.1234/pending"
    title: "Article Pending"
    authors: "Gamma G"
    year: "2024"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: gamma2024-cccc3333
      hasFiles: { pdf: false, xml: false, html: false, markdown: false }
  - doi: "10.1234/not-init"
    title: "Article Not Initialized"
    authors: "Delta D"
    year: "2024"
    reviews: []
    finalDecision: include
`;

const metaAlpha: FulltextMeta = {
  dirName: 'alpha2024-aaaa1111',
  citationKey: 'alpha2024',
  uuid: 'aaaa1111-0000-0000-0000-000000000000',
  doi: '10.1234/with-pdf',
  title: 'Article With PDF',
  oaStatus: 'open',
  files: { pdf: { filename: 'fulltext.pdf', source: 'unpaywall', retrievedAt: '2024-01-01T00:00:00Z' } },
};

const metaBeta: FulltextMeta = {
  dirName: 'beta2024-bbbb2222',
  citationKey: 'beta2024',
  uuid: 'bbbb2222-0000-0000-0000-000000000000',
  doi: '10.1234/with-both',
  title: 'Article With Both',
  oaStatus: 'open',
  files: {
    pdf: { filename: 'fulltext.pdf', source: 'pmc', retrievedAt: '2024-01-01T00:00:00Z' },
    markdown: { filename: 'fulltext.md', source: 'converted', retrievedAt: '2024-01-02T00:00:00Z' },
  },
};

const metaGamma: FulltextMeta = {
  dirName: 'gamma2024-cccc3333',
  citationKey: 'gamma2024',
  uuid: 'cccc3333-0000-0000-0000-000000000000',
  doi: '10.1234/pending',
  title: 'Article Pending',
  oaStatus: 'closed',
  files: {},
};

describe('fulltext status + pending integration', () => {
  const sessionDir = '/sessions/integration-test';

  beforeEach(() => {
    vi.resetAllMocks();

    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('reviews.yaml')) return reviewFileYaml;
      throw new Error(`File not found: ${p}`);
    });

    mockGetMetaPath.mockImplementation((sessionDir: string, dirName: string) =>
      `${sessionDir}/fulltext/${dirName}/meta.json`
    );

    const metaMap: Record<string, FulltextMeta> = {
      'alpha2024-aaaa1111': metaAlpha,
      'beta2024-bbbb2222': metaBeta,
      'gamma2024-cccc3333': metaGamma,
    };
    mockLoadMeta.mockImplementation(async (path: string) => {
      for (const [dirName, meta] of Object.entries(metaMap)) {
        if (path.includes(dirName)) return meta;
      }
      throw new Error(`File not found: ${path}`);
    });
  });

  it('status reflects actual fulltext state', async () => {
    const status = await executeFulltextStatus({ sessionDir });

    expect(status.totalIncluded).toBe(4);
    expect(status.withFulltext).toBe(2); // alpha (pdf) + beta (both)
    expect(status.pdfOnly).toBe(1);      // alpha
    expect(status.both).toBe(1);          // beta
    expect(status.pending).toBe(1);       // gamma (dir, no files)
    expect(status.notInitialized).toBe(1); // delta (no dir)
  });

  it('pending excludes articles with fulltext', async () => {
    const pending = await executeFulltextPending({ sessionDir });

    expect(pending.totalPending).toBe(2); // gamma + delta
    const titles = pending.articles.map((a) => a.title);
    expect(titles).toContain('Article Pending');
    expect(titles).toContain('Article Not Initialized');
    expect(titles).not.toContain('Article With PDF');
    expect(titles).not.toContain('Article With Both');
  });

  it('status and pending counts are consistent', async () => {
    const status = await executeFulltextStatus({ sessionDir });
    const pending = await executeFulltextPending({ sessionDir });

    // pending = status.pending + status.notInitialized
    expect(pending.totalPending).toBe(status.pending + status.notInitialized);

    // total = withFulltext + pending + notInitialized
    expect(status.totalIncluded).toBe(
      status.withFulltext + status.pending + status.notInitialized,
    );
  });
});
