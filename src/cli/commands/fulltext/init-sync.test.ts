import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ReviewFile } from '../review/types.js';
import type { FulltextMeta } from '@ncukondo/academic-fulltext';
import { executeFulltextInit } from './init.js';
import { executeFulltextSync } from './sync.js';

describe('Fulltext Init + Sync E2E', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'fulltext-e2e-test-'));
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

    const reviewFile: ReviewFile = { sessionId, articles };
    await writeFile(join(internalDir, 'reviews.yaml'), stringifyYaml(reviewFile), 'utf-8');
  }

  it('full workflow: init → manual file copy → sync', async () => {
    // Setup: 3 articles (2 included, 1 excluded)
    await setupReviews([
      {
        title: 'Machine Learning Review',
        doi: '10.1234/ml-review',
        authors: 'Smith, J.',
        year: '2024',
        reviews: [{ reviewer: 'human:alice', decision: 'include', basis: 'abstract' }],
        finalDecision: 'include',
      },
      {
        title: 'Deep Learning Analysis',
        doi: '10.5678/dl-analysis',
        pmid: '98765432',
        authors: 'Jones, A.',
        year: '2023',
        reviews: [{ reviewer: 'human:alice', decision: 'include', basis: 'abstract' }],
        finalDecision: 'include',
      },
      {
        title: 'Excluded Study',
        doi: '10.9999/excluded',
        reviews: [{ reviewer: 'human:alice', decision: 'exclude', basis: 'title' }],
        finalDecision: 'exclude',
      },
    ]);

    // Step 1: Init
    const initResult = await executeFulltextInit({ sessionId, sessionsDir });

    expect(initResult.created).toBe(2);
    expect(initResult.entries).toHaveLength(2);

    // Verify directories were created
    const sessionDir = join(sessionsDir, sessionId);
    const fulltextDir = join(sessionDir, 'fulltext');
    const dirs = await readdir(fulltextDir, { withFileTypes: true });
    expect(dirs.filter(d => d.isDirectory())).toHaveLength(2);

    // Verify reviews.yaml updated
    const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
    const reviewFile = parseYaml(await readFile(reviewsPath, 'utf-8')) as ReviewFile;
    const includedWithFulltext = reviewFile.articles.filter(a => a.fulltext);
    expect(includedWithFulltext).toHaveLength(2);
    const excludedArticle = reviewFile.articles.find(a => a.doi === '10.9999/excluded');
    expect(excludedArticle?.fulltext).toBeUndefined();

    // Step 2: User manually copies PDFs
    const dir1 = initResult.entries[0]!.dirName;
    const dir2 = initResult.entries[1]!.dirName;
    await writeFile(join(fulltextDir, dir1, 'fulltext.pdf'), 'fake-pdf-content-for-ml-review');
    await writeFile(join(fulltextDir, dir2, 'fulltext.pdf'), 'fake-pdf-content-for-dl');
    await writeFile(join(fulltextDir, dir2, 'fulltext.md'), '# Deep Learning Analysis\n\nContent here...');

    // Step 3: Sync
    const syncResult = await executeFulltextSync({ sessionId, sessionsDir });

    expect(syncResult.synced).toBe(3); // 2 PDFs + 1 markdown
    expect(syncResult.articlesUpdated).toBe(2);

    // Verify meta.json updated for first article
    const meta1 = JSON.parse(
      await readFile(join(fulltextDir, dir1, 'meta.json'), 'utf-8'),
    ) as FulltextMeta;
    expect(meta1.files.pdf).toBeDefined();
    expect(meta1.files.pdf!.source).toBe('manual');
    expect(meta1.files.pdf!.filename).toBe('fulltext.pdf');

    // Verify meta.json updated for second article (both pdf and md)
    const meta2 = JSON.parse(
      await readFile(join(fulltextDir, dir2, 'meta.json'), 'utf-8'),
    ) as FulltextMeta;
    expect(meta2.files.pdf).toBeDefined();
    expect(meta2.files.markdown).toBeDefined();
    expect(meta2.files.markdown!.filename).toBe('fulltext.md');

    // Verify reviews.yaml updated with hasFiles
    const updatedReview = parseYaml(await readFile(reviewsPath, 'utf-8')) as ReviewFile;
    const article1 = updatedReview.articles.find(a => a.fulltext?.dirName === dir1);
    expect(article1?.fulltext?.hasFiles.pdf).toBe(true);
    const article2 = updatedReview.articles.find(a => a.fulltext?.dirName === dir2);
    expect(article2?.fulltext?.hasFiles.pdf).toBe(true);
    expect(article2?.fulltext?.hasFiles.markdown).toBe(true);
  });

  it('idempotent: re-running init/sync is safe', async () => {
    await setupReviews([
      {
        title: 'Test Article',
        doi: '10.1234/test',
        authors: 'Test, A.',
        year: '2024',
        reviews: [],
        finalDecision: 'include',
      },
    ]);

    // First init
    const init1 = await executeFulltextInit({ sessionId, sessionsDir });
    expect(init1.created).toBe(1);

    // Second init (idempotent)
    const init2 = await executeFulltextInit({ sessionId, sessionsDir });
    expect(init2.created).toBe(0);
    expect(init2.skipped).toBe(1);

    // Add a file and sync
    const sessionDir = join(sessionsDir, sessionId);
    const dirName = init1.entries[0]!.dirName;
    await writeFile(join(sessionDir, 'fulltext', dirName, 'fulltext.pdf'), 'content');

    const sync1 = await executeFulltextSync({ sessionId, sessionsDir });
    expect(sync1.synced).toBe(1);

    // Second sync (idempotent - file already tracked)
    const sync2 = await executeFulltextSync({ sessionId, sessionsDir });
    expect(sync2.synced).toBe(0);
  });

  it('reviews.yaml is correctly updated end-to-end', async () => {
    await setupReviews([
      {
        title: 'Article A',
        doi: '10.1234/a',
        authors: 'Alpha, A.',
        year: '2024',
        reviews: [{ reviewer: 'human:x', decision: 'include' }],
        finalDecision: 'include',
      },
      {
        title: 'Article B',
        doi: '10.5678/b',
        authors: 'Beta, B.',
        year: '2023',
        reviews: [{ reviewer: 'human:x', decision: 'include' }],
        finalDecision: 'include',
      },
      {
        title: 'Article C',
        doi: '10.9999/c',
        reviews: [{ reviewer: 'human:x', decision: 'exclude' }],
        finalDecision: 'exclude',
      },
    ]);

    // Init
    const initResult = await executeFulltextInit({ sessionId, sessionsDir });
    expect(initResult.created).toBe(2);

    const sessionDir = join(sessionsDir, sessionId);
    const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');

    // After init: included articles should have fulltext refs
    let review = parseYaml(await readFile(reviewsPath, 'utf-8')) as ReviewFile;
    expect(review.articles[0]!.fulltext).toBeDefined();
    expect(review.articles[1]!.fulltext).toBeDefined();
    expect(review.articles[2]!.fulltext).toBeUndefined(); // excluded

    // Add a PDF to article A only
    const dirA = initResult.entries[0]!.dirName;
    await writeFile(join(sessionDir, 'fulltext', dirA, 'fulltext.pdf'), 'pdf-a');

    // Sync
    await executeFulltextSync({ sessionId, sessionsDir });

    // After sync: article A should have hasFiles.pdf=true
    review = parseYaml(await readFile(reviewsPath, 'utf-8')) as ReviewFile;
    const articleA = review.articles.find(a => a.fulltext?.dirName === dirA);
    expect(articleA?.fulltext?.hasFiles.pdf).toBe(true);
    expect(articleA?.fulltext?.hasFiles.markdown).toBe(false);

    // Article B should still have hasFiles.pdf=false
    const dirB = initResult.entries[1]!.dirName;
    const articleB = review.articles.find(a => a.fulltext?.dirName === dirB);
    expect(articleB?.fulltext?.hasFiles.pdf).toBe(false);
  });
});
