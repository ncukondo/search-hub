import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewMerge } from './merge.js';
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

  async function writeExtractedFile(articles: ArticleEntry[], filePath: string): Promise<void> {
    const reviewFile: ReviewFile = {
      sessionId,
      articles,
    };

    const content = stringifyYaml(reviewFile);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, content);
  }

  async function readMainReviewFile(): Promise<ReviewFile> {
    const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');
    return parseYaml(content) as ReviewFile;
  }

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      const result = await executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir);

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
      const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
      await writeExtractedFile(extractedArticles, extractedPath);

      const result = await executeReviewMerge({ sessionId, file: extractedPath, dryRun: true }, sessionsDir);

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
    const extractedPath = join(tempDir, 'extracted', 'batch.yaml');
    await writeExtractedFile([{ title: 'Article', pmid: '1', reviews: [] }], extractedPath);

    await expect(
      executeReviewMerge({ sessionId, file: extractedPath }, sessionsDir)
    ).rejects.toThrow();
  });

  it('throws error if extracted file does not exist', async () => {
    const mainArticles: ArticleEntry[] = [
      { title: 'Article 1', pmid: '1', reviews: [] },
    ];
    await writeMainReviewFile(mainArticles);

    await expect(
      executeReviewMerge({ sessionId, file: '/nonexistent/file.yaml' }, sessionsDir)
    ).rejects.toThrow();
  });

  describe('work file format (with basis/reviewer)', () => {
    async function writeWorkFile(workFile: WorkFile, filePath: string): Promise<void> {
      const content = stringifyYaml(workFile);
      await mkdir(join(filePath, '..'), { recursive: true });
      await writeFile(filePath, content);
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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase2.yaml');
      await writeWorkFile(workFile, workFilePath);

      await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      const result = await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      const result = await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

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
      const workFilePath = join(tempDir, 'phase1.yaml');
      await writeWorkFile(workFile, workFilePath);

      const result = await executeReviewMerge({ sessionId, file: workFilePath }, sessionsDir);

      expect(result.reviewsAdded).toBe(3);
      const merged = await readMainReviewFile();
      expect(merged.articles[0]!.reviews[0]!.decision).toBe('include');
      expect(merged.articles[1]!.reviews[0]!.decision).toBe('exclude');
      expect(merged.articles[2]!.reviews[0]!.decision).toBe('uncertain');
    });
  });
});
