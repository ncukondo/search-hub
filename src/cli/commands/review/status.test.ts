import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import { executeReviewStatus } from './status.js';
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

  async function writeReviewFile(articles: ArticleEntry[]): Promise<void> {
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

  it('counts articles by status correctly', async () => {
    const articles: ArticleEntry[] = [
      // pending (no reviews)
      { title: 'Article 1', pmid: '1', reviews: [] },
      { title: 'Article 2', pmid: '2', reviews: [] },
      // needs-final (has reviews but no finalDecision)
      {
        title: 'Article 3', pmid: '3',
        reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
      },
      // conflicting (reviewers disagree)
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
    expect(result.conflicting).toBe(1);
    expect(result.needsFinal).toBe(1);
    expect(result.finalized).toBe(2);
    expect(result.included).toBe(1);
    expect(result.excluded).toBe(1);
  });

  it('returns zero counts for empty review file', async () => {
    await writeReviewFile([]);

    const result = await executeReviewStatus({ sessionId }, sessionsDir);

    expect(result.total).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.conflicting).toBe(0);
    expect(result.needsFinal).toBe(0);
    expect(result.finalized).toBe(0);
    expect(result.included).toBe(0);
    expect(result.excluded).toBe(0);
  });

  it('formats human-readable output', async () => {
    const articles: ArticleEntry[] = [
      { title: 'Article 1', pmid: '1', reviews: [] },
      { title: 'Article 2', pmid: '2', reviews: [], finalDecision: 'include' },
    ];

    await writeReviewFile(articles);

    const result = await executeReviewStatus({ sessionId }, sessionsDir);

    expect(result.total).toBe(2);
    expect(result.pending).toBe(1);
    expect(result.finalized).toBe(1);
  });

  it('throws error if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    // Don't create reviews.yaml

    await expect(executeReviewStatus({ sessionId }, sessionsDir)).rejects.toThrow();
  });
});
