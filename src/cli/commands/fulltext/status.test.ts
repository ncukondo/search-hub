/**
 * Tests for fulltext status command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFulltextStatus } from './status';
import type { FulltextMeta } from '../../../fulltext/types';

// Mock fs operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  access: vi.fn(),
}));

import { readFile, readdir, access } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);
const mockAccess = vi.mocked(access);

/** Helper: create a FulltextMeta object for testing */
function makeMeta(
  overrides: Partial<FulltextMeta> & { dirName: string },
): FulltextMeta {
  return {
    citationKey: 'test2024',
    uuid: '00000000-0000-0000-0000-000000000000',
    title: 'Test Article',
    oaStatus: 'unchecked',
    files: {},
    ...overrides,
  };
}

// Review YAML with 5 included articles, each in a different fulltext state
const reviewFileYaml = `
sessionId: test-session
articles:
  - doi: "10.1234/a1"
    title: "Article with PDF only"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: smith2024-aaaa1111
      hasFiles: { pdf: true, xml: false, markdown: false }
  - doi: "10.1234/a2"
    title: "Article with Markdown only"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: jones2024-bbbb2222
      hasFiles: { pdf: false, xml: false, markdown: true }
  - doi: "10.1234/a3"
    title: "Article with both PDF and Markdown"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: lee2024-cccc3333
      hasFiles: { pdf: true, xml: false, markdown: true }
  - doi: "10.1234/a4"
    title: "Article pending (directory, no files)"
    reviews: []
    finalDecision: include
    fulltext:
      dirName: chen2024-dddd4444
      hasFiles: { pdf: false, xml: false, markdown: false }
  - doi: "10.1234/a5"
    title: "Article not initialized"
    reviews: []
    finalDecision: include
  - doi: "10.1234/excluded"
    title: "Excluded Article"
    reviews: []
    finalDecision: exclude
`;

// Meta files for each article
const metaA1 = makeMeta({
  dirName: 'smith2024-aaaa1111',
  doi: '10.1234/a1',
  title: 'Article with PDF only',
  files: { pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00Z', size: 1000 } },
});
const metaA2 = makeMeta({
  dirName: 'jones2024-bbbb2222',
  doi: '10.1234/a2',
  title: 'Article with Markdown only',
  files: { markdown: { filename: 'fulltext.md', source: 'converted', retrievedAt: '2024-01-01T00:00:00Z', size: 500 } },
});
const metaA3 = makeMeta({
  dirName: 'lee2024-cccc3333',
  doi: '10.1234/a3',
  title: 'Article with both PDF and Markdown',
  files: {
    pdf: { filename: 'fulltext.pdf', source: 'unpaywall', retrievedAt: '2024-01-01T00:00:00Z', size: 2000 },
    markdown: { filename: 'fulltext.md', source: 'converted', retrievedAt: '2024-01-01T00:00:00Z', size: 800 },
  },
});
const metaA4 = makeMeta({
  dirName: 'chen2024-dddd4444',
  doi: '10.1234/a4',
  title: 'Article pending (directory, no files)',
  files: {},
});

describe('executeFulltextStatus', () => {
  const sessionDir = '/sessions/test-session';

  beforeEach(() => {
    vi.resetAllMocks();

    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('reviews.yaml')) return reviewFileYaml;
      if (p.includes('smith2024-aaaa1111/meta.json')) return JSON.stringify(metaA1);
      if (p.includes('jones2024-bbbb2222/meta.json')) return JSON.stringify(metaA2);
      if (p.includes('lee2024-cccc3333/meta.json')) return JSON.stringify(metaA3);
      if (p.includes('chen2024-dddd4444/meta.json')) return JSON.stringify(metaA4);
      throw new Error(`File not found: ${p}`);
    });

    // Fulltext directories exist
    mockReaddir.mockResolvedValue(
      ['smith2024-aaaa1111', 'jones2024-bbbb2222', 'lee2024-cccc3333', 'chen2024-dddd4444'] as unknown as Awaited<ReturnType<typeof readdir>>,
    );

    mockAccess.mockResolvedValue(undefined);
  });

  it('shows total included articles count', async () => {
    const result = await executeFulltextStatus({ sessionDir });
    expect(result.totalIncluded).toBe(5);
  });

  it('shows articles with fulltext (PDF only, Markdown only, both)', async () => {
    const result = await executeFulltextStatus({ sessionDir });
    expect(result.withFulltext).toBe(3);
    expect(result.pdfOnly).toBe(1);
    expect(result.markdownOnly).toBe(1);
    expect(result.both).toBe(1);
  });

  it('shows pending count (directory exists, no files)', async () => {
    const result = await executeFulltextStatus({ sessionDir });
    expect(result.pending).toBe(1);
  });

  it('shows not initialized count (no directory)', async () => {
    const result = await executeFulltextStatus({ sessionDir });
    expect(result.notInitialized).toBe(1);
  });

  it('--format json outputs structured data', async () => {
    const result = await executeFulltextStatus({ sessionDir, format: 'json' });
    // The result itself is the structured data; verify shape
    expect(result).toEqual({
      totalIncluded: 5,
      withFulltext: 3,
      pdfOnly: 1,
      markdownOnly: 1,
      both: 1,
      pending: 1,
      notInitialized: 1,
    });
  });

  it('handles session with no included articles', async () => {
    const emptyReviewYaml = `
sessionId: test-session
articles:
  - doi: "10.1234/excluded"
    title: "Excluded Article"
    reviews: []
    finalDecision: exclude
`;
    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('reviews.yaml')) return emptyReviewYaml;
      throw new Error(`File not found: ${p}`);
    });

    const result = await executeFulltextStatus({ sessionDir });
    expect(result.totalIncluded).toBe(0);
    expect(result.withFulltext).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.notInitialized).toBe(0);
  });

  it('handles missing fulltext directory gracefully', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await executeFulltextStatus({ sessionDir });
    // All articles with fulltext refs become "pending" since we can't read their meta
    // Article without fulltext ref is "not initialized"
    expect(result.totalIncluded).toBe(5);
    expect(result.notInitialized).toBe(1);
  });

  it('handles missing reviews.yaml', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await expect(
      executeFulltextStatus({ sessionDir }),
    ).rejects.toThrow();
  });
});
