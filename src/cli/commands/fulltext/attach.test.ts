/**
 * Tests for standalone fulltext attach command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { FulltextMeta } from '@ncukondo/academic-fulltext';

// Mock ref-cli module
vi.mock('../../../integration/ref-cli.js', () => ({
  refFulltextAttach: vi.fn(),
  refExport: vi.fn(),
}));

import { refFulltextAttach, refExport } from '../../../integration/ref-cli.js';
import { executeFulltextAttach } from './attach.js';

const mockRefFulltextAttach = vi.mocked(refFulltextAttach);
const mockRefExport = vi.mocked(refExport);

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

// Helper to create a references.json library file with entries
async function createLibraryFile(
  sessionDir: string,
  entries: Array<{ id: string; doi?: string; pmid?: string }>,
): Promise<void> {
  const library = entries.map((e) => ({
    id: e.id,
    type: 'article-journal',
    ...(e.doi ? { DOI: e.doi } : {}),
    ...(e.pmid ? { PMID: e.pmid } : {}),
  }));
  await fs.writeFile(path.join(sessionDir, 'references.json'), JSON.stringify(library, null, 2));
}

describe('executeFulltextAttach', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-ft-attach-test-'));
    await fs.mkdir(path.join(tempDir, 'fulltext'), { recursive: true });
    mockRefFulltextAttach.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('attaches fulltexts to existing ref entries', async () => {
    const meta = createMeta({
      dirName: 'smith2024-a1b2c3d4',
      doi: '10.1234/test',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'smith2024-a1b2c3d4', meta, ['fulltext.pdf']);
    await createLibraryFile(tempDir, [{ id: 'smith2024', doi: '10.1234/test' }]);

    // Mock refExport to return the library entries
    mockRefExport.mockResolvedValueOnce([
      { id: 'smith2024', DOI: '10.1234/test', type: 'article-journal' },
    ]);

    const result = await executeFulltextAttach({
      sessionDir: tempDir,
      dryRun: false,
    });

    expect(result.summary.attached).toBe(1);
    expect(result.attached).toHaveLength(1);
    expect(mockRefFulltextAttach).toHaveBeenCalled();
  });

  it('shows what would be attached in dry-run mode', async () => {
    const meta = createMeta({
      dirName: 'smith2024-a1b2c3d4',
      doi: '10.1234/test',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'smith2024-a1b2c3d4', meta, ['fulltext.pdf']);
    await createLibraryFile(tempDir, [{ id: 'smith2024', doi: '10.1234/test' }]);

    mockRefExport.mockResolvedValueOnce([
      { id: 'smith2024', DOI: '10.1234/test', type: 'article-journal' },
    ]);

    const result = await executeFulltextAttach({
      sessionDir: tempDir,
      dryRun: true,
    });

    // dry-run should not actually call refFulltextAttach
    expect(mockRefFulltextAttach).not.toHaveBeenCalled();
    // But should report what would be attached
    expect(result.summary.attached).toBe(1);
  });

  it('shows summary of attached, skipped, and failed', async () => {
    // Article with fulltext and matching ref
    const metaA = createMeta({
      dirName: 'a2024-11111111',
      doi: '10.1234/a',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'a2024-11111111', metaA, ['fulltext.pdf']);

    // Article without matching ref
    const metaB = createMeta({
      dirName: 'b2024-22222222',
      doi: '10.1234/b',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'b2024-22222222', metaB, ['fulltext.pdf']);

    await createLibraryFile(tempDir, [{ id: 'a2024', doi: '10.1234/a' }]);

    mockRefExport.mockResolvedValueOnce([
      { id: 'a2024', DOI: '10.1234/a', type: 'article-journal' },
    ]);

    const result = await executeFulltextAttach({
      sessionDir: tempDir,
      dryRun: false,
    });

    expect(result.summary.attached).toBe(1);
    expect(result.summary.skipped).toBe(1);
    expect(result.attached).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('works without running register first (reads library file)', async () => {
    const meta = createMeta({
      dirName: 'direct2024-aabbccdd',
      doi: '10.1234/direct',
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00.000Z' },
      },
    });
    await createFulltextDir(tempDir, 'direct2024-aabbccdd', meta, ['fulltext.pdf']);
    await createLibraryFile(tempDir, [{ id: 'direct2024', doi: '10.1234/direct' }]);

    mockRefExport.mockResolvedValueOnce([
      { id: 'direct2024', DOI: '10.1234/direct', type: 'article-journal' },
    ]);

    const result = await executeFulltextAttach({
      sessionDir: tempDir,
      dryRun: false,
    });

    expect(result.summary.attached).toBe(1);
  });
});
