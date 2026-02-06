import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile } from '../review/types.js';
import type { FulltextMeta, FulltextIndex } from '../../../fulltext/types.js';
import { executeFulltextInit } from './init.js';

describe('executeFulltextInit', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'fulltext-init-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function setupReviews(articles: ReviewFile['articles']): Promise<void> {
    const sessionDir = join(sessionsDir, sessionId);
    const internalDir = join(sessionDir, '.internal');
    await mkdir(internalDir, { recursive: true });

    const reviewFile: ReviewFile = {
      sessionId,
      articles,
    };
    await writeFile(join(internalDir, 'reviews.yaml'), stringifyYaml(reviewFile), 'utf-8');
  }

  it('creates directories only for finalDecision=include articles', async () => {
    await setupReviews([
      {
        title: 'Included Article',
        doi: '10.1234/included',
        reviews: [],
        finalDecision: 'include',
      },
      {
        title: 'Excluded Article',
        doi: '10.1234/excluded',
        reviews: [],
        finalDecision: 'exclude',
      },
      {
        title: 'Pending Article',
        doi: '10.1234/pending',
        reviews: [],
      },
    ]);

    const result = await executeFulltextInit({ sessionId, sessionsDir });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]!.doi).toBe('10.1234/included');
  });

  it('creates meta.json with correct identifiers', async () => {
    await setupReviews([
      {
        title: 'Test Article',
        doi: '10.1234/test',
        pmid: '12345678',
        authors: 'Smith, J.',
        year: '2024',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    const result = await executeFulltextInit({ sessionId, sessionsDir });
    const entry = result.entries[0]!;
    const sessionDir = join(sessionsDir, sessionId);
    const metaPath = join(sessionDir, 'fulltext', entry.dirName, 'meta.json');
    const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as FulltextMeta;

    expect(meta.title).toBe('Test Article');
    expect(meta.doi).toBe('10.1234/test');
    expect(meta.pmid).toBe('12345678');
    expect(meta.citationKey).toBe('smith2024');
    expect(meta.dirName).toMatch(/^smith2024-[a-f0-9]{8}$/);
    expect(meta.oaStatus).toBe('unchecked');
    expect(meta.files).toEqual({});
  });

  it('creates README.md with title, DOI, URLs', async () => {
    await setupReviews([
      {
        title: 'Test Article',
        doi: '10.1234/test',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    const result = await executeFulltextInit({ sessionId, sessionsDir });
    const entry = result.entries[0]!;
    const sessionDir = join(sessionsDir, sessionId);
    const readmePath = join(sessionDir, 'fulltext', entry.dirName, 'README.md');
    const readme = await readFile(readmePath, 'utf-8');

    expect(readme).toContain('Test Article');
    expect(readme).toContain('10.1234/test');
    expect(readme).toContain('https://doi.org/10.1234/test');
    expect(readme).toContain('fulltext sync');
  });

  it('skips existing directories (idempotent)', async () => {
    await setupReviews([
      {
        title: 'Test Article',
        doi: '10.1234/test',
        authors: 'Smith, J.',
        year: '2024',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    // First run
    const result1 = await executeFulltextInit({ sessionId, sessionsDir });
    expect(result1.created).toBe(1);

    // Second run - should skip existing
    const result2 = await executeFulltextInit({ sessionId, sessionsDir });
    expect(result2.created).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  it('updates fulltext-index.json', async () => {
    await setupReviews([
      {
        title: 'Article One',
        doi: '10.1234/one',
        reviews: [],
        finalDecision: 'include',
      },
      {
        title: 'Article Two',
        doi: '10.5678/two',
        pmid: '99999999',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    await executeFulltextInit({ sessionId, sessionsDir });

    const sessionDir = join(sessionsDir, sessionId);
    const indexPath = join(sessionDir, 'fulltext', 'fulltext-index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf-8')) as FulltextIndex;

    expect(index.sessionId).toBe(sessionId);
    expect(Object.keys(index.entries)).toHaveLength(2);

    const entries = Object.values(index.entries);
    const doiEntry = entries.find(e => e.doi === '10.1234/one');
    expect(doiEntry).toBeDefined();
    expect(doiEntry!.hasFiles).toEqual({ pdf: false, xml: false, markdown: false });

    const pmidEntry = entries.find(e => e.pmid === '99999999');
    expect(pmidEntry).toBeDefined();
  });

  it('updates reviews.yaml with fulltext references', async () => {
    await setupReviews([
      {
        title: 'Included Article',
        doi: '10.1234/included',
        reviews: [],
        finalDecision: 'include',
      },
      {
        title: 'Excluded Article',
        doi: '10.1234/excluded',
        reviews: [],
        finalDecision: 'exclude',
      },
    ]);

    await executeFulltextInit({ sessionId, sessionsDir });

    const sessionDir = join(sessionsDir, sessionId);
    const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
    const reviewFile = parseYaml(await readFile(reviewsPath, 'utf-8')) as ReviewFile;

    const includedArticle = reviewFile.articles.find(a => a.doi === '10.1234/included');
    expect(includedArticle?.fulltext).toBeDefined();
    expect(includedArticle?.fulltext?.dirName).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/);
    expect(includedArticle?.fulltext?.hasFiles).toEqual({ pdf: false, xml: false, markdown: false });

    // Excluded article should NOT have fulltext reference
    const excludedArticle = reviewFile.articles.find(a => a.doi === '10.1234/excluded');
    expect(excludedArticle?.fulltext).toBeUndefined();
  });

  it('--dry-run shows what would be created without creating', async () => {
    await setupReviews([
      {
        title: 'Test Article',
        doi: '10.1234/test',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    const result = await executeFulltextInit({ sessionId, sessionsDir, dryRun: true });

    expect(result.created).toBe(1);
    expect(result.dryRun).toBe(true);

    // Verify no directories were actually created
    const sessionDir = join(sessionsDir, sessionId);
    const fulltextDir = join(sessionDir, 'fulltext');
    await expect(readdir(fulltextDir)).rejects.toThrow();
  });

  it('handles articles with no identifiers', async () => {
    await setupReviews([
      {
        title: 'Article Without IDs',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    const result = await executeFulltextInit({ sessionId, sessionsDir });

    expect(result.created).toBe(1);
    expect(result.entries[0]!.citationKey).toMatch(/^unknown/);
  });

  it('handles multiple articles with same author/year (collision)', async () => {
    await setupReviews([
      {
        title: 'First Article',
        doi: '10.1234/first',
        authors: 'Smith, J.',
        year: '2024',
        reviews: [],
        finalDecision: 'include',
      },
      {
        title: 'Second Article',
        doi: '10.1234/second',
        authors: 'Smith, J.',
        year: '2024',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    const result = await executeFulltextInit({ sessionId, sessionsDir });

    expect(result.created).toBe(2);
    const keys = result.entries.map(e => e.citationKey);
    expect(keys).toContain('smith2024');
    expect(keys).toContain('smith2024a');
  });

  it('throws if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    await expect(
      executeFulltextInit({ sessionId, sessionsDir }),
    ).rejects.toThrow();
  });
});
