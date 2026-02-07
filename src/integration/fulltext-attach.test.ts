/**
 * Tests for fulltext attach logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { FulltextMeta } from '../fulltext/types.js';

// Mock ref-cli module
vi.mock('./ref-cli.js', () => ({
  refFulltextAttach: vi.fn(),
}));

import { refFulltextAttach } from './ref-cli.js';
import { attachFulltexts, type AttachFulltextsOptions } from './fulltext-attach.js';

const mockRefFulltextAttach = vi.mocked(refFulltextAttach);

// Helper: create a fulltext directory with meta.json and optional files
async function createFulltextDir(
  sessionDir: string,
  dirName: string,
  meta: FulltextMeta,
  files: string[] = [],
): Promise<void> {
  const dir = path.join(sessionDir, 'fulltext', dirName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  for (const file of files) {
    await fs.writeFile(path.join(dir, file), `dummy content for ${file}`);
  }
}

// Helper: create a FulltextMeta
function createMeta(overrides: Partial<FulltextMeta> = {}): FulltextMeta {
  return {
    dirName: 'smith2024-a1b2c3d4',
    citationKey: 'smith2024',
    uuid: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
    title: 'Test Article',
    oaStatus: 'unchecked',
    files: {},
    ...overrides,
  };
}

describe('attachFulltexts', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-attach-test-'));
    await fs.mkdir(path.join(tempDir, 'fulltext'), { recursive: true });
    mockRefFulltextAttach.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  const createOptions = (
    addedRefs: Array<{ id: string; source: string }> = [],
  ): AttachFulltextsOptions => ({
    sessionDir: tempDir,
    libraryPath: path.join(tempDir, 'references.json'),
    addedRefs,
  });

  it('attaches PDF when available', async () => {
    const meta = createMeta({
      dirName: 'smith2024-a1b2c3d4',
      doi: '10.1234/test',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'smith2024-a1b2c3d4', meta, ['fulltext.pdf']);

    const result = await attachFulltexts(
      createOptions([{ id: 'smith2024', source: '10.1234/test' }]),
    );

    expect(result.summary.attached).toBe(1);
    expect(result.attached).toHaveLength(1);
    expect(result.attached[0]!.refId).toBe('smith2024');
    expect(result.attached[0]!.files).toContain('fulltext.pdf');
    expect(mockRefFulltextAttach).toHaveBeenCalled();
  });

  it('attaches Markdown when available', async () => {
    const meta = createMeta({
      dirName: 'jones2023-e5f6g7h8',
      doi: '10.1234/jones',
      files: {
        markdown: { filename: 'fulltext.md', source: 'pmc', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'jones2023-e5f6g7h8', meta, ['fulltext.md']);

    const result = await attachFulltexts(
      createOptions([{ id: 'jones2023', source: '10.1234/jones' }]),
    );

    expect(result.summary.attached).toBe(1);
    expect(result.attached[0]!.files).toContain('fulltext.md');
  });

  it('attaches both PDF and Markdown when both available', async () => {
    const meta = createMeta({
      dirName: 'both2024-11223344',
      doi: '10.1234/both',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
        markdown: { filename: 'fulltext.md', source: 'pmc', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'both2024-11223344', meta, ['fulltext.pdf', 'fulltext.md']);

    const result = await attachFulltexts(
      createOptions([{ id: 'both2024', source: '10.1234/both' }]),
    );

    expect(result.summary.attached).toBe(1);
    expect(result.attached[0]!.files).toHaveLength(2);
    expect(result.attached[0]!.files).toContain('fulltext.pdf');
    expect(result.attached[0]!.files).toContain('fulltext.md');
    expect(mockRefFulltextAttach).toHaveBeenCalledTimes(2);
  });

  it('matches fulltext directory to ref entry by DOI', async () => {
    const meta = createMeta({
      dirName: 'doi2024-aabbccdd',
      doi: '10.1234/match-by-doi',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'doi2024-aabbccdd', meta, ['fulltext.pdf']);

    const result = await attachFulltexts(
      createOptions([{ id: 'doi2024', source: '10.1234/match-by-doi' }]),
    );

    expect(result.summary.attached).toBe(1);
    expect(result.attached[0]!.refId).toBe('doi2024');
  });

  it('matches fulltext directory to ref entry by PMID', async () => {
    const meta = createMeta({
      dirName: 'pmid2024-aabbccdd',
      pmid: '12345678',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'pmid2024-aabbccdd', meta, ['fulltext.pdf']);

    const result = await attachFulltexts(
      createOptions([{ id: 'pmid2024', source: 'pmid:12345678' }]),
    );

    expect(result.summary.attached).toBe(1);
    expect(result.attached[0]!.refId).toBe('pmid2024');
  });

  it('skips articles not in ref library', async () => {
    const meta = createMeta({
      dirName: 'orphan2024-aabbccdd',
      doi: '10.1234/orphan',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'orphan2024-aabbccdd', meta, ['fulltext.pdf']);

    // No matching ref entry in addedRefs
    const result = await attachFulltexts(createOptions([]));

    expect(result.summary.skipped).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.dirName).toBe('orphan2024-aabbccdd');
    expect(result.skipped[0]!.reason).toBe('not_in_ref');
    expect(mockRefFulltextAttach).not.toHaveBeenCalled();
  });

  it('skips directories with no fulltext files', async () => {
    const meta = createMeta({
      dirName: 'nofiles2024-aabbccdd',
      doi: '10.1234/nofiles',
      files: {},
    });
    await createFulltextDir(tempDir, 'nofiles2024-aabbccdd', meta);

    const result = await attachFulltexts(
      createOptions([{ id: 'nofiles2024', source: '10.1234/nofiles' }]),
    );

    expect(result.summary.skipped).toBe(1);
    expect(result.skipped[0]!.dirName).toBe('nofiles2024-aabbccdd');
    expect(result.skipped[0]!.reason).toBe('no_files');
  });

  it('records results correctly (attached, skipped, failed)', async () => {
    // Article with PDF - will be attached
    const metaA = createMeta({
      dirName: 'a2024-11111111',
      doi: '10.1234/a',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'a2024-11111111', metaA, ['fulltext.pdf']);

    // Article without matching ref - will be skipped
    const metaB = createMeta({
      dirName: 'b2024-22222222',
      doi: '10.1234/b',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'b2024-22222222', metaB, ['fulltext.pdf']);

    // Article where attach will fail
    const metaC = createMeta({
      dirName: 'c2024-33333333',
      doi: '10.1234/c',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'c2024-33333333', metaC, ['fulltext.pdf']);

    // Make attach fail for article C
    mockRefFulltextAttach.mockImplementation(async (refId: string) => {
      if (refId === 'c2024') {
        throw new Error('Attach failed for c2024');
      }
    });

    const result = await attachFulltexts(
      createOptions([
        { id: 'a2024', source: '10.1234/a' },
        { id: 'c2024', source: '10.1234/c' },
      ]),
    );

    expect(result.summary.total).toBe(3);
    expect(result.summary.attached).toBe(1);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.attached).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.dirName).toBe('c2024-33333333');
  });

  it('returns empty result when no fulltext directory exists', async () => {
    // Remove the fulltext directory
    await fs.rm(path.join(tempDir, 'fulltext'), { recursive: true });

    const result = await attachFulltexts(createOptions([]));

    expect(result.summary.total).toBe(0);
    expect(result.summary.attached).toBe(0);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.failed).toBe(0);
  });

  it('handles fulltext directory with no subdirectories', async () => {
    // fulltext/ exists but has no article dirs
    const result = await attachFulltexts(createOptions([]));

    expect(result.summary.total).toBe(0);
  });
});
