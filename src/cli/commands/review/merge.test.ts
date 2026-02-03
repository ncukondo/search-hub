import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewMerge } from './merge.js';
import type { ReviewFile, ArticleEntry } from './types.js';

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
    await mkdir(sessionDir, { recursive: true });

    const reviewFile: ReviewFile = {
      sessionId,
      articles,
    };

    const content = stringifyYaml(reviewFile);
    await writeFile(join(sessionDir, 'reviews.yaml'), content);
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
    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
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
});
