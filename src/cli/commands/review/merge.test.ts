import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewMerge, registerReviewer } from './merge.js';
import type { ReviewFile, ArticleEntry, WorkFile } from './types.js';

describe('executeReviewMerge', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-merge-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeMainReviewFile(articles: ArticleEntry[]): Promise<void> {
    const sessionDir = join(sessionsDir, sessionId);
    const internalDir = join(sessionDir, '.internal');
    await mkdir(internalDir, { recursive: true });

    const reviewFile: ReviewFile = {
      sessionId,
      articles,
    };

    const content = stringifyYaml(reviewFile);
    await writeFile(join(internalDir, 'reviews.yaml'), content);
  }

  async function writeExtractedFile(articles: ArticleEntry[], name: string): Promise<void> {
    const reviewFile: ReviewFile = {
      sessionId,
      articles,
    };

    const content = stringifyYaml(reviewFile);
    const dir = join(sessionsDir, sessionId, 'for-review', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'review.yaml'), content);
  }

  async function readMainReviewFile(): Promise<ReviewFile> {
    const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');
    return parseYaml(content) as ReviewFile;
  }

  describe('--name option', () => {
    it('reads from for-review/<name>/review.yaml when --name is specified', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeExtractedFile(extractedArticles, 'title-screening');

      await executeReviewMerge({ sessionId, name: 'title-screening' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[0]!.reviews[0]!.reviewer).toBe('gpt-4o');
    });

    it('rejects name with path separators', async () => {
      await expect(
        executeReviewMerge({ sessionId, name: 'foo/bar' }, sessionsDir)
      ).rejects.toThrow('must not contain path separators');
    });

    it('rejects name with ".."', async () => {
      await expect(
        executeReviewMerge({ sessionId, name: 'foo..bar' }, sessionsDir)
      ).rejects.toThrow('must not contain ".."');
    });

    it('rejects empty name', async () => {
      await expect(
        executeReviewMerge({ sessionId, name: '' }, sessionsDir)
      ).rejects.toThrow('must not be empty');
    });

    it('throws error when file does not exist for given name', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      await expect(
        executeReviewMerge({ sessionId, name: 'nonexistent' }, sessionsDir)
      ).rejects.toThrow();
    });
  });

  describe('appending reviews', () => {
    it('appends new reviews to matching articles', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[0]!.reviews[0]!.reviewer).toBe('gpt-4o');
    });

    it('appends multiple reviews from different reviewers', async () => {
      const mainArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'human:alice', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [
            { reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-02T00:00:00Z' },
            { reviewer: 'claude', decision: 'exclude', timestamp: '2024-01-02T01:00:00Z' },
          ],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(3);
    });

    it('auto-assigns timestamp when not provided', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'human:alice', decision: 'include' }], // No timestamp
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[0]!.reviews[0]!.timestamp).toBeDefined();
      // Should be a valid ISO timestamp
      expect(new Date(merged.articles[0]!.reviews[0]!.timestamp!).toISOString()).toBe(
        merged.articles[0]!.reviews[0]!.timestamp
      );
    });

    it('skips duplicate reviews (same reviewer+timestamp)', async () => {
      const mainArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [
            { reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }, // duplicate
            { reviewer: 'gpt-4o', decision: 'exclude', timestamp: '2024-01-02T00:00:00Z' }, // new
          ],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(2);
    });
  });

  describe('overwriting finalDecision', () => {
    it('overwrites finalDecision with value from extracted file', async () => {
      const mainArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [],
          finalDecision: 'include',
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.finalDecision).toBe('include');
    });

    it('overwrites existing finalDecision', async () => {
      const mainArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [],
          finalDecision: 'include',
        },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [],
          finalDecision: 'exclude',
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.finalDecision).toBe('exclude');
    });

    it('does not clear finalDecision if extracted has none', async () => {
      const mainArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [],
          finalDecision: 'include',
        },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'claude', decision: 'exclude', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.finalDecision).toBe('include');
    });
  });

  describe('article matching', () => {
    it('matches articles by pmid', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Different Title',
          pmid: '1',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
    });

    it('matches articles by doi', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          doi: '10.1234/test',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
    });

    it('warns about articles not in main file', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Unknown Article',
          pmid: '999',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      const result = await executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Unknown Article');
    });
  });

  describe('dry-run mode', () => {
    it('shows changes without applying', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
          finalDecision: 'include',
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch');

      const result = await executeReviewMerge({ sessionId, name: 'batch', dryRun: true }, sessionsDir);

      expect(result.reviewsAdded).toBe(1);
      expect(result.decisionsSet).toBe(1);

      // Verify no changes were made
      const afterMerge = await readMainReviewFile();
      expect(afterMerge.articles[0]!.reviews).toHaveLength(0);
      expect(afterMerge.articles[0]!.finalDecision).toBeUndefined();
    });
  });

  it('throws error if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    await writeExtractedFile([{ title: 'Article', pmid: '1', reviews: [] }], 'batch');

    await expect(
      executeReviewMerge({ sessionId, name: 'batch' }, sessionsDir)
    ).rejects.toThrow();
  });

  it('throws error if extracted file does not exist', async () => {
    const mainArticles: ArticleEntry[] = [
      { title: 'Article 1', pmid: '1', reviews: [] },
    ];
    await writeMainReviewFile(mainArticles);

    await expect(
      executeReviewMerge({ sessionId, name: 'nonexistent' }, sessionsDir)
    ).rejects.toThrow();
  });

  describe('registerReviewer', () => {
    it('adds a reviewer record to the reviewers array', () => {
      const reviewFile: ReviewFile = { sessionId, articles: [] };
      registerReviewer(reviewFile, 'alice', 'title');
      expect(reviewFile.reviewers).toEqual([{ name: 'alice', basis: 'title' }]);
    });

    it('does not create a duplicate for the same name+basis', () => {
      const reviewFile: ReviewFile = { sessionId, articles: [] };
      registerReviewer(reviewFile, 'alice', 'title');
      registerReviewer(reviewFile, 'alice', 'title');
      expect(reviewFile.reviewers).toHaveLength(1);
    });

    it('records multiple distinct name+basis pairs', () => {
      const reviewFile: ReviewFile = { sessionId, articles: [] };
      registerReviewer(reviewFile, 'alice', 'title');
      registerReviewer(reviewFile, 'bob', 'title');
      registerReviewer(reviewFile, 'alice', 'abstract');
      expect(reviewFile.reviewers).toHaveLength(3);
      expect(reviewFile.reviewers).toEqual([
        { name: 'alice', basis: 'title' },
        { name: 'bob', basis: 'title' },
        { name: 'alice', basis: 'abstract' },
      ]);
    });

    it('initializes reviewers array if undefined', () => {
      const reviewFile: ReviewFile = { sessionId, articles: [] };
      expect(reviewFile.reviewers).toBeUndefined();
      registerReviewer(reviewFile, 'alice', 'title');
      expect(reviewFile.reviewers).toBeDefined();
    });
  });

  describe('reviewer registration during merge', () => {
    async function writeWorkFile(workFile: WorkFile, name: string): Promise<void> {
      const content = stringifyYaml(workFile);
      const dir = join(sessionsDir, sessionId, 'for-review', name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'review.yaml'), content);
    }

    it('registers reviewer from work file after merge', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test', title: 'Article 1', decision: 'include', comment: '' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.reviewers).toEqual([{ name: 'ai:claude', basis: 'title' }]);
    });

    it('registers reviewers from review file after merge', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const extractedArticles: ArticleEntry[] = [
        {
          title: 'Article 1',
          pmid: '1',
          reviews: [
            { reviewer: 'gpt-4o', decision: 'include', basis: 'abstract', timestamp: '2024-01-01T00:00:00Z' },
          ],
        },
      ];
      await writeExtractedFile(extractedArticles, 'batch1');

      await executeReviewMerge({ sessionId, name: 'batch1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.reviewers).toEqual([{ name: 'gpt-4o', basis: 'abstract' }]);
    });

    it('does not duplicate reviewer on same name+basis merge', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test1', reviews: [] },
        { title: 'Article 2', doi: '10.1234/test2', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test1', title: 'Article 1', decision: 'include', comment: '' },
          { id: '10.1234/test2', title: 'Article 2', decision: 'exclude', comment: '' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      // Same reviewer+basis should appear only once
      expect(merged.reviewers).toHaveLength(1);
    });
  });

  describe('work file format (with basis/reviewer)', () => {
    async function writeWorkFile(workFile: WorkFile, name: string): Promise<void> {
      const content = stringifyYaml(workFile);
      const dir = join(sessionsDir, sessionId, 'for-review', name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'review.yaml'), content);
    }

    it('merges work file with basis attached to each review', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test', title: 'Article 1', decision: 'include', comment: 'Relevant' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[0]!.reviews[0]!.basis).toBe('title');
    });

    it('merges work file with reviewer attached to each review', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test', title: 'Article 1', decision: 'include', comment: 'Relevant' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[0]!.reviews[0]!.reviewer).toBe('ai:claude');
    });

    it('merges work file with timestamp attached to each review', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test', title: 'Article 1', decision: 'include', comment: 'Relevant' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[0]!.reviews[0]!.timestamp).toBeDefined();
      // Should be a valid ISO timestamp
      expect(new Date(merged.articles[0]!.reviews[0]!.timestamp!).toISOString()).toBe(
        merged.articles[0]!.reviews[0]!.timestamp
      );
    });

    it('merges work file with decision and comment', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'abstract',
        reviewer: 'ai:gpt-4o',
        articles: [
          { id: '10.1234/test', title: 'Article 1', decision: 'exclude', comment: 'Not relevant' },
        ],
      };
      await writeWorkFile(workFile, 'phase2');

      await executeReviewMerge({ sessionId, name: 'phase2' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[0]!.reviews[0]!.decision).toBe('exclude');
      expect(merged.articles[0]!.reviews[0]!.comment).toBe('Not relevant');
    });

    it('matches work file articles by id (doi)', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Original Title', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test', title: 'Different Title', decision: 'include', comment: '' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
    });

    it('matches work file articles by id (pmid)', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '12345', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '12345', title: 'Article 1', decision: 'include', comment: '' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
    });

    it('skips articles with null decision', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test1', reviews: [] },
        { title: 'Article 2', doi: '10.1234/test2', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test1', title: 'Article 1', decision: 'include', comment: 'Yes' },
          { id: '10.1234/test2', title: 'Article 2', decision: null, comment: '' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      const result = await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews).toHaveLength(1);
      expect(merged.articles[1]!.reviews).toHaveLength(0);
      expect(result.reviewsAdded).toBe(1);
    });

    it('warns about unknown article ids', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.9999/unknown', title: 'Unknown Article', decision: 'include', comment: '' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      const result = await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('10.9999/unknown');
    });

    it('merges multiple articles from work file', async () => {
      const mainArticles: ArticleEntry[] = [
        { title: 'Article 1', doi: '10.1234/test1', reviews: [] },
        { title: 'Article 2', doi: '10.1234/test2', reviews: [] },
        { title: 'Article 3', pmid: '999', reviews: [] },
      ];
      await writeMainReviewFile(mainArticles);

      const workFile: WorkFile = {
        sessionId,
        basis: 'title',
        reviewer: 'ai:claude',
        articles: [
          { id: '10.1234/test1', title: 'Article 1', decision: 'include', comment: 'Good' },
          { id: '10.1234/test2', title: 'Article 2', decision: 'exclude', comment: 'Bad' },
          { id: '999', title: 'Article 3', decision: 'uncertain', comment: 'Maybe' },
        ],
      };
      await writeWorkFile(workFile, 'phase1');

      const result = await executeReviewMerge({ sessionId, name: 'phase1' }, sessionsDir);

      expect(result.reviewsAdded).toBe(3);
      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews[0]!.decision).toBe('include');
      expect(merged.articles[1]!.reviews[0]!.decision).toBe('exclude');
      expect(merged.articles[2]!.reviews[0]!.decision).toBe('uncertain');
    });
  });
});
