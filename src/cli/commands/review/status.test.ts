import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import { executeReviewStatus, formatStatusOutput } from './status.js';
import type { ReviewFile, ArticleEntry } from './types.js';

describe('executeReviewStatus', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-status-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeReviewFile(articles: ArticleEntry[], reviewFile?: Partial<ReviewFile>): Promise<void> {
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

  it('counts articles by status correctly (no reviewer registry)', async () => {
    const articles: ArticleEntry[] = [
      // pending (no reviews)
      { title: 'Article 1', pmid: '1', reviews: [] },
      { title: 'Article 2', pmid: '2', reviews: [] },
      // agreed-include (has reviews, all include, no registry)
      {
        title: 'Article 3', pmid: '3',
        reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
      },
      // divided (reviewers disagree)
      {
        title: 'Article 4', pmid: '4',
        reviews: [
          { reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
          { reviewer: 'claude', decision: 'exclude', timestamp: '2024-01-01T01:00:00Z' },
        ],
      },
      // finalized
      {
        title: 'Article 5', pmid: '5',
        reviews: [{ reviewer: 'human', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
        finalDecision: 'include',
      },
      {
        title: 'Article 6', pmid: '6',
        reviews: [{ reviewer: 'human', decision: 'exclude', timestamp: '2024-01-01T00:00:00Z' }],
        finalDecision: 'exclude',
      },
    ];

    await writeReviewFile(articles);

    const result = await executeReviewStatus({ sessionId }, sessionsDir);

    expect(result.total).toBe(6);
    expect(result.pending).toBe(2);
    expect(result.incomplete).toBe(0);
    expect(result.allUncertain).toBe(0);
    expect(result.agreedInclude).toBe(1);
    expect(result.agreedExclude).toBe(0);
    expect(result.divided).toBe(1);
    expect(result.finalized).toBe(2);
    expect(result.included).toBe(1);
    expect(result.excluded).toBe(1);
  });

  it('counts incomplete and divided with reviewer registry', async () => {
    const articles: ArticleEntry[] = [
      // incomplete: only claude reviewed, gpt-4o missing
      {
        title: 'Article 1', pmid: '1',
        reviews: [{ reviewer: 'ai:claude', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
      },
      // divided: both reviewed, include + uncertain = mixed decisions
      {
        title: 'Article 2', pmid: '2',
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
          { reviewer: 'ai:gpt-4o', decision: 'uncertain', timestamp: '2024-01-01T01:00:00Z' },
        ],
      },
      // agreed-include: both include
      {
        title: 'Article 3', pmid: '3',
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
          { reviewer: 'ai:gpt-4o', decision: 'include', timestamp: '2024-01-01T01:00:00Z' },
        ],
      },
      // agreed-exclude: both exclude
      {
        title: 'Article 4', pmid: '4',
        reviews: [
          { reviewer: 'ai:claude', decision: 'exclude', timestamp: '2024-01-01T00:00:00Z' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', timestamp: '2024-01-01T01:00:00Z' },
        ],
      },
    ];

    await writeReviewFile(articles, {
      reviewers: [
        { name: 'ai:claude', basis: 'title' },
        { name: 'ai:gpt-4o', basis: 'title' },
      ],
    });

    const result = await executeReviewStatus({ sessionId }, sessionsDir);

    expect(result.total).toBe(4);
    expect(result.incomplete).toBe(1);
    expect(result.divided).toBe(1);
    expect(result.agreedInclude).toBe(1);
    expect(result.agreedExclude).toBe(1);
  });

  it('includes reviewers in result', async () => {
    await writeReviewFile([], {
      reviewers: [
        { name: 'ai:claude', basis: 'title' },
        { name: 'ai:gpt-4o', basis: 'title' },
      ],
    });

    const result = await executeReviewStatus({ sessionId }, sessionsDir);

    expect(result.reviewers).toHaveLength(2);
    expect(result.reviewers[0]).toEqual({ name: 'ai:claude', basis: 'title' });
  });

  it('returns empty reviewers when none registered', async () => {
    await writeReviewFile([]);

    const result = await executeReviewStatus({ sessionId }, sessionsDir);

    expect(result.reviewers).toHaveLength(0);
  });

  it('returns zero counts for empty review file', async () => {
    await writeReviewFile([]);

    const result = await executeReviewStatus({ sessionId }, sessionsDir);

    expect(result.total).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.incomplete).toBe(0);
    expect(result.allUncertain).toBe(0);
    expect(result.agreedInclude).toBe(0);
    expect(result.agreedExclude).toBe(0);
    expect(result.divided).toBe(0);
    expect(result.finalized).toBe(0);
    expect(result.included).toBe(0);
    expect(result.excluded).toBe(0);
  });

  it('includes mode in result when present in review file', async () => {
    await writeReviewFile([], { mode: 'picking' });

    const result = await executeReviewStatus({ sessionId }, sessionsDir);
    expect(result.mode).toBe('picking');
  });

  it('returns undefined mode when not present in review file', async () => {
    await writeReviewFile([]);

    const result = await executeReviewStatus({ sessionId }, sessionsDir);
    expect(result.mode).toBeUndefined();
  });

  it('throws error if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    await expect(executeReviewStatus({ sessionId }, sessionsDir)).rejects.toThrow();
  });

  describe('formatStatusOutput', () => {
    it('shows new status breakdown', () => {
      const output = formatStatusOutput({
        sessionId: 'my-session',
        total: 100,
        pending: 10,
        incomplete: 8,
        allUncertain: 12,
        agreedInclude: 30,
        agreedExclude: 15,
        divided: 3,
        finalized: 22,
        included: 15,
        excluded: 7,
        reviewers: [
          { name: 'ai:claude', basis: 'title' },
          { name: 'ai:gpt-4o', basis: 'title' },
        ],
      });

      expect(output).toContain('Review Progress: my-session');
      expect(output).toContain('Total:           100');
      expect(output).toContain('Pending:         10');
      expect(output).toContain('Incomplete:      8');
      expect(output).toContain('All-uncertain:   12');
      expect(output).toContain('Agreed:          45');
      expect(output).toContain('include: 30');
      expect(output).toContain('exclude: 15');
      expect(output).toContain('Divided:         3');
      expect(output).toContain('Finalized:       22');
      expect(output).toContain('Reviewers:');
      expect(output).toContain('ai:claude  (title)');
      expect(output).toContain('ai:gpt-4o  (title)');
    });

    it('shows picking mode in header when mode is picking', () => {
      const output = formatStatusOutput({
        sessionId: 'my-session',
        total: 10,
        pending: 10,
        incomplete: 0,
        allUncertain: 0,
        agreedInclude: 0,
        agreedExclude: 0,
        divided: 0,
        finalized: 0,
        included: 0,
        excluded: 0,
        reviewers: [],
        mode: 'picking',
      });

      expect(output).toContain('Review Progress: my-session (picking mode)');
    });

    it('shows screening mode in header when mode is screening', () => {
      const output = formatStatusOutput({
        sessionId: 'my-session',
        total: 10,
        pending: 10,
        incomplete: 0,
        allUncertain: 0,
        agreedInclude: 0,
        agreedExclude: 0,
        divided: 0,
        finalized: 0,
        included: 0,
        excluded: 0,
        reviewers: [],
        mode: 'screening',
      });

      expect(output).toContain('Review Progress: my-session (screening mode)');
    });

    it('does not show mode when mode is undefined', () => {
      const output = formatStatusOutput({
        sessionId: 'my-session',
        total: 10,
        pending: 10,
        incomplete: 0,
        allUncertain: 0,
        agreedInclude: 0,
        agreedExclude: 0,
        divided: 0,
        finalized: 0,
        included: 0,
        excluded: 0,
        reviewers: [],
      });

      expect(output).toContain('Review Progress: my-session');
      expect(output).not.toContain('mode)');
    });

    it('does not include static AI Agent Workflow section', () => {
      const output = formatStatusOutput({
        sessionId: 'my-session',
        total: 10,
        pending: 10,
        incomplete: 0,
        allUncertain: 0,
        agreedInclude: 0,
        agreedExclude: 0,
        divided: 0,
        finalized: 0,
        included: 0,
        excluded: 0,
        reviewers: [],
      });

      expect(output).not.toContain('AI Agent Workflow');
      expect(output).not.toContain('Phase 1');
      expect(output).not.toContain('Phase 2');
    });

    it('hides reviewers section when no reviewers registered', () => {
      const output = formatStatusOutput({
        sessionId: 'my-session',
        total: 10,
        pending: 10,
        incomplete: 0,
        allUncertain: 0,
        agreedInclude: 0,
        agreedExclude: 0,
        divided: 0,
        finalized: 0,
        included: 0,
        excluded: 0,
        reviewers: [],
      });

      expect(output).not.toContain('Reviewers:');
    });
  });
});
