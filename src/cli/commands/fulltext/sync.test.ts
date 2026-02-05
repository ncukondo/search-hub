import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile } from '../review/types.js';
import type { FulltextMeta, FulltextIndex } from '../../../fulltext/types.js';
import { executeFulltextSync } from './sync.js';

describe('executeFulltextSync', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'fulltext-sync-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function setupSessionDir(): Promise<string> {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(join(sessionDir, 'fulltext'), { recursive: true });
    await mkdir(join(sessionDir, '.internal'), { recursive: true });
    return sessionDir;
  }

  async function setupArticleDir(
    sessionDir: string,
    dirName: string,
    meta: FulltextMeta,
  ): Promise<void> {
    const articleDir = join(sessionDir, 'fulltext', dirName);
    await mkdir(articleDir, { recursive: true });
    await writeFile(join(articleDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  }

  async function setupIndex(sessionDir: string, index: FulltextIndex): Promise<void> {
    await writeFile(
      join(sessionDir, 'fulltext', 'fulltext-index.json'),
      JSON.stringify(index, null, 2),
      'utf-8',
    );
  }

  async function setupReviews(sessionDir: string, articles: ReviewFile['articles']): Promise<void> {
    const reviewFile: ReviewFile = { sessionId, articles };
    await writeFile(
      join(sessionDir, '.internal', 'reviews.yaml'),
      stringifyYaml(reviewFile),
      'utf-8',
    );
  }

  function makeMeta(dirName: string, overrides?: Partial<FulltextMeta>): FulltextMeta {
    const parts = dirName.split('-');
    const citationKey = parts.slice(0, -1).join('-');
    return {
      dirName,
      citationKey,
      uuid: parts[parts.length - 1]! + '00000000-0000-0000-000000000000',
      title: `Test Article ${dirName}`,
      oaStatus: 'unchecked',
      files: {},
      ...overrides,
    };
  }

  it('detects new fulltext.pdf in directory', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'smith2024-a1b2c3d4';
    const meta = makeMeta(dirName, { doi: '10.1234/test' });
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'smith2024', doi: '10.1234/test', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });
    await setupReviews(sessionDir, [
      { title: meta.title, doi: '10.1234/test', reviews: [], finalDecision: 'include', fulltext: { dirName, hasFiles: { pdf: false, xml: false, markdown: false } } },
    ]);

    // Add a PDF file
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'fake-pdf-content');

    const result = await executeFulltextSync({ sessionId, sessionsDir });

    expect(result.synced).toBe(1);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]!.files).toContain('fulltext.pdf');
  });

  it('detects new fulltext.md in directory', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'jones2023-e5f6g7h8';
    const meta = makeMeta(dirName, { doi: '10.5678/test' });
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'jones2023', doi: '10.5678/test', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });
    await setupReviews(sessionDir, [
      { title: meta.title, doi: '10.5678/test', reviews: [], finalDecision: 'include', fulltext: { dirName, hasFiles: { pdf: false, xml: false, markdown: false } } },
    ]);

    // Add a markdown file
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.md'), '# Article\nContent');

    const result = await executeFulltextSync({ sessionId, sessionsDir });

    expect(result.synced).toBe(1);
    expect(result.entries[0]!.files).toContain('fulltext.md');
  });

  it('detects new fulltext.xml in directory', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'chen2024-i9j0k1l2';
    const meta = makeMeta(dirName, { doi: '10.9876/test' });
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'chen2024', doi: '10.9876/test', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });
    await setupReviews(sessionDir, [
      { title: meta.title, doi: '10.9876/test', reviews: [], finalDecision: 'include', fulltext: { dirName, hasFiles: { pdf: false, xml: false, markdown: false } } },
    ]);

    // Add an XML file
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.xml'), '<article/>');

    const result = await executeFulltextSync({ sessionId, sessionsDir });

    expect(result.synced).toBe(1);
    expect(result.entries[0]!.files).toContain('fulltext.xml');
  });

  it('updates meta.json with file info (source: "manual")', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'smith2024-a1b2c3d4';
    const meta = makeMeta(dirName);
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'smith2024', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });

    // Add a PDF file
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'pdf-content-here');

    await executeFulltextSync({ sessionId, sessionsDir });

    const updatedMeta = JSON.parse(
      await readFile(join(sessionDir, 'fulltext', dirName, 'meta.json'), 'utf-8'),
    ) as FulltextMeta;

    expect(updatedMeta.files.pdf).toBeDefined();
    expect(updatedMeta.files.pdf!.filename).toBe('fulltext.pdf');
    expect(updatedMeta.files.pdf!.source).toBe('manual');
    expect(updatedMeta.files.pdf!.size).toBe(Buffer.byteLength('pdf-content-here'));
  });

  it('updates fulltext-index.json hasFiles', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'smith2024-a1b2c3d4';
    const meta = makeMeta(dirName);
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'smith2024', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });

    // Add a PDF and markdown file
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'pdf');
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.md'), 'md');

    await executeFulltextSync({ sessionId, sessionsDir });

    const index = JSON.parse(
      await readFile(join(sessionDir, 'fulltext', 'fulltext-index.json'), 'utf-8'),
    ) as FulltextIndex;

    expect(index.entries[dirName]!.hasFiles.pdf).toBe(true);
    expect(index.entries[dirName]!.hasFiles.markdown).toBe(true);
    expect(index.entries[dirName]!.hasFiles.xml).toBe(false);
  });

  it('updates reviews.yaml fulltext.hasFiles', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'smith2024-a1b2c3d4';
    const meta = makeMeta(dirName, { doi: '10.1234/test' });
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'smith2024', doi: '10.1234/test', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });
    await setupReviews(sessionDir, [
      { title: meta.title, doi: '10.1234/test', reviews: [], finalDecision: 'include', fulltext: { dirName, hasFiles: { pdf: false, xml: false, markdown: false } } },
    ]);

    // Add a PDF
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'pdf-data');

    await executeFulltextSync({ sessionId, sessionsDir });

    const reviewFile = parseYaml(
      await readFile(join(sessionDir, '.internal', 'reviews.yaml'), 'utf-8'),
    ) as ReviewFile;

    const article = reviewFile.articles[0]!;
    expect(article.fulltext?.hasFiles.pdf).toBe(true);
    expect(article.fulltext?.hasFiles.markdown).toBe(false);
  });

  it('ignores already-synced files', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'smith2024-a1b2c3d4';
    const meta = makeMeta(dirName, {
      files: {
        pdf: { filename: 'fulltext.pdf', source: 'manual', retrievedAt: '2024-01-01T00:00:00Z', size: 100 },
      },
    });
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'smith2024', hasFiles: { pdf: true, xml: false, markdown: false } } },
    });

    // PDF already exists and is tracked in meta.json
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'old-pdf');

    const result = await executeFulltextSync({ sessionId, sessionsDir });

    expect(result.synced).toBe(0);
    expect(result.entries.length).toBe(0);
  });

  it('--dry-run shows what would be synced without modifying', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'smith2024-a1b2c3d4';
    const meta = makeMeta(dirName);
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'smith2024', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });

    // Add a PDF
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'pdf');

    const result = await executeFulltextSync({ sessionId, sessionsDir, dryRun: true });

    expect(result.synced).toBe(1);
    expect(result.dryRun).toBe(true);

    // Verify meta.json was NOT updated
    const currentMeta = JSON.parse(
      await readFile(join(sessionDir, 'fulltext', dirName, 'meta.json'), 'utf-8'),
    ) as FulltextMeta;
    expect(currentMeta.files.pdf).toBeUndefined();
  });

  it('detects multiple files in same directory', async () => {
    const sessionDir = await setupSessionDir();
    const dirName = 'smith2024-a1b2c3d4';
    const meta = makeMeta(dirName);
    await setupArticleDir(sessionDir, dirName, meta);
    await setupIndex(sessionDir, {
      sessionId,
      updatedAt: new Date().toISOString(),
      entries: { [dirName]: { dirName, citationKey: 'smith2024', hasFiles: { pdf: false, xml: false, markdown: false } } },
    });

    // Add both PDF and markdown
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'pdf-data');
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.md'), '# Markdown');

    const result = await executeFulltextSync({ sessionId, sessionsDir });

    expect(result.synced).toBe(2);
    const files = result.entries.flatMap(e => e.files);
    expect(files).toContain('fulltext.pdf');
    expect(files).toContain('fulltext.md');
  });
});
