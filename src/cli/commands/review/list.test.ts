import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import { executeReviewList, formatListOutput } from './list.js';
import type { ReviewFile, ArticleEntry } from './types.js';

describe('executeReviewList', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-list-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeReviewFile(
    articles: ArticleEntry[],
    reviewFile?: Partial<ReviewFile>,
  ): Promise<void> {
    const sessionDir = join(sessionsDir, sessionId);
    const internalDir = join(sessionDir, '.internal');
    await mkdir(internalDir, { recursive: true });

    const rf: ReviewFile = {
      sessionId,
      articles,
      ...reviewFile,
    };

    const content = stringifyYaml(rf);
    await writeFile(join(internalDir, 'reviews.yaml'), content);
  }

  const sampleArticles: ArticleEntry[] = [
    // pending (no reviews)
    { title: 'Pending Article 1', pmid: '1', reviews: [] },
    { title: 'Pending Article 2', pmid: '2', reviews: [] },
    // agreed-include (all reviewers agree include, no registry)
    {
      title: 'Agreed Include Article',
      pmid: '3',
      reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
    },
    // divided (reviewers disagree)
    {
      title: 'Conflicting Article',
      pmid: '4',
      reviews: [
        { reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
        { reviewer: 'claude', decision: 'exclude', timestamp: '2024-01-01T01:00:00Z' },
      ],
    },
    // finalized
    {
      title: 'Included Article',
      pmid: '5',
      reviews: [{ reviewer: 'human', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
      finalDecision: 'include',
    },
    {
      title: 'Excluded Article',
      pmid: '6',
      reviews: [{ reviewer: 'human', decision: 'exclude', timestamp: '2024-01-01T00:00:00Z' }],
      finalDecision: 'exclude',
    },
  ];

  describe('filtering', () => {
    it('returns all articles when filter is "all"', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'all' }, sessionsDir);

      expect(result.articles).toHaveLength(6);
    });

    it('filters pending articles correctly', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'pending' }, sessionsDir);

      expect(result.articles).toHaveLength(2);
      expect(result.articles.every((a) => a.status === 'pending')).toBe(true);
      expect(result.articles.map((a) => a.title)).toEqual([
        'Pending Article 1',
        'Pending Article 2',
      ]);
    });

    it('filters divided articles correctly', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'divided' }, sessionsDir);

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0]!.title).toBe('Conflicting Article');
      expect(result.articles[0]!.status).toBe('divided');
    });

    it('filters agreed-include articles correctly', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'agreed-include' }, sessionsDir);

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0]!.title).toBe('Agreed Include Article');
      expect(result.articles[0]!.status).toBe('agreed-include');
    });

    it('filters finalized articles correctly', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'finalized' }, sessionsDir);

      expect(result.articles).toHaveLength(2);
      expect(result.articles.every((a) => a.status === 'finalized')).toBe(true);
    });

    it('filters all-uncertain articles correctly', async () => {
      const articles: ArticleEntry[] = [
        {
          title: 'Uncertain Article',
          pmid: '10',
          reviews: [{ reviewer: 'ai:claude', decision: 'uncertain' }],
        },
        { title: 'Pending', pmid: '11', reviews: [] },
      ];
      await writeReviewFile(articles);

      const result = await executeReviewList({ sessionId, filter: 'all-uncertain' }, sessionsDir);

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0]!.status).toBe('all-uncertain');
    });

    it('filters incomplete articles when reviewer registry exists', async () => {
      const articles: ArticleEntry[] = [
        {
          title: 'Incomplete Article',
          pmid: '10',
          reviews: [{ reviewer: 'ai:claude', decision: 'include' }],
        },
      ];
      await writeReviewFile(articles, {
        reviewers: [
          { name: 'ai:claude', basis: 'title' },
          { name: 'ai:gpt-4o', basis: 'title' },
        ],
      });

      const result = await executeReviewList({ sessionId, filter: 'incomplete' }, sessionsDir);

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0]!.status).toBe('incomplete');
    });

    it('defaults to "all" filter when not specified', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId }, sessionsDir);

      expect(result.articles).toHaveLength(6);
    });
  });

  describe('output format', () => {
    it('includes status in each article result', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'all' }, sessionsDir);

      expect(result.articles[0]!.status).toBe('pending');
      expect(result.articles[2]!.status).toBe('agreed-include');
      expect(result.articles[3]!.status).toBe('divided');
      expect(result.articles[4]!.status).toBe('finalized');
    });

    it('includes review count in each article result', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'all' }, sessionsDir);

      expect(result.articles[0]!.reviewCount).toBe(0);
      expect(result.articles[2]!.reviewCount).toBe(1);
      expect(result.articles[3]!.reviewCount).toBe(2);
    });

    it('includes finalDecision when present', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'finalized' }, sessionsDir);

      expect(result.articles[0]!.finalDecision).toBe('include');
      expect(result.articles[1]!.finalDecision).toBe('exclude');
    });
  });

  describe('formatListOutput', () => {
    it('formats human-readable output', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewList({ sessionId, filter: 'pending' }, sessionsDir);
      const output = formatListOutput(result);

      expect(output).toContain('Pending Article 1');
      expect(output).toContain('Pending Article 2');
      expect(output).toContain('pending');
      expect(output).toContain('2 articles');
    });

    it('shows empty message when no articles match filter', async () => {
      await writeReviewFile([]);

      const result = await executeReviewList({ sessionId, filter: 'pending' }, sessionsDir);
      const output = formatListOutput(result);

      expect(output).toContain('No articles');
    });
  });

  it('throws error if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    // Don't create reviews.yaml

    await expect(executeReviewList({ sessionId }, sessionsDir)).rejects.toThrow();
  });
});
