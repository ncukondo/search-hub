/**
 * Tests for review finalize command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import {
  executeReviewFinalize,
  formatFinalizeOutput,
  type ReviewFinalizeResult,
} from './finalize.js';
import type { ReviewFile } from './types.js';

describe('executeReviewFinalize', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'finalize-test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-finalize-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function setupReviewFile(reviewFile: ReviewFile): Promise<void> {
    const sessionDir = join(sessionsDir, sessionId);
    const internalDir = join(sessionDir, '.internal');
    await mkdir(internalDir, { recursive: true });
    const schemaComment = `# yaml-language-server: $schema=./review.schema.json\n`;
    await writeFile(
      join(internalDir, 'reviews.yaml'),
      schemaComment + stringifyYaml(reviewFile, { lineWidth: 0 })
    );
  }

  async function readReviewFile(): Promise<ReviewFile> {
    const content = await readFile(
      join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
      'utf-8'
    );
    return parseYaml(content) as ReviewFile;
  }

  describe('Step 1: basic finalization', () => {
    it('finalizes agreed-include articles with finalDecision: include', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Article 1',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(1);
      expect(result.excludedCount).toBe(0);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBe('include');
    });

    it('finalizes agreed-exclude articles with finalDecision: exclude', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Article 1',
            reviews: [{ reviewer: 'ai:claude', decision: 'exclude', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(0);
      expect(result.excludedCount).toBe(1);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBe('exclude');
    });

    it('skips pending, incomplete, all-uncertain, and divided articles', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [
          { name: 'ai:claude', basis: 'title' },
          { name: 'ai:gpt-4o', basis: 'title' },
        ],
        articles: [
          // pending (no reviews)
          { doi: '10.1234/pending', title: 'Pending', reviews: [] },
          // incomplete (only one reviewer of two)
          {
            doi: '10.1234/incomplete',
            title: 'Incomplete',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
          // all-uncertain
          {
            doi: '10.1234/uncertain',
            title: 'Uncertain',
            reviews: [
              { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
              { reviewer: 'ai:gpt-4o', decision: 'uncertain', basis: 'title' },
            ],
          },
          // divided
          {
            doi: '10.1234/divided',
            title: 'Divided',
            reviews: [
              { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
              { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'title' },
            ],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(0);
      expect(result.excludedCount).toBe(0);
      expect(result.skippedByStatus.pending).toBe(1);
      expect(result.skippedByStatus.incomplete).toBe(1);
      expect(result.skippedByStatus['all-uncertain']).toBe(1);
      expect(result.skippedByStatus.divided).toBe(1);

      // Verify no finalDecision was set
      const reviewFile = await readReviewFile();
      for (const article of reviewFile.articles) {
        expect(article.finalDecision).toBeUndefined();
      }
    });

    it('skips already finalized articles', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Already Finalized',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
            finalDecision: 'include',
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(0);
      expect(result.excludedCount).toBe(0);
      expect(result.skippedByStatus.finalized).toBe(1);
    });

    it('writes finalized YAML with local schema reference (./review.schema.json)', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Article 1',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
        ],
      });

      await executeReviewFinalize({ sessionId }, sessionsDir);

      const content = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const firstLine = content.split('\n')[0];
      expect(firstLine).toBe('# yaml-language-server: $schema=./review.schema.json');
    });

    it('returns correct counts for mixed articles', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          // agreed-include
          {
            doi: '10.1234/inc1',
            title: 'Include 1',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
          {
            doi: '10.1234/inc2',
            title: 'Include 2',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
          // agreed-exclude
          {
            doi: '10.1234/exc1',
            title: 'Exclude 1',
            reviews: [{ reviewer: 'ai:claude', decision: 'exclude', basis: 'title' }],
          },
          // pending
          { doi: '10.1234/pend', title: 'Pending', reviews: [] },
          // uncertain
          {
            doi: '10.1234/unc',
            title: 'Uncertain',
            reviews: [{ reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' }],
          },
          // already finalized
          {
            doi: '10.1234/fin',
            title: 'Finalized',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
            finalDecision: 'include',
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(2);
      expect(result.excludedCount).toBe(1);
      expect(result.skippedByStatus.pending).toBe(1);
      expect(result.skippedByStatus['all-uncertain']).toBe(1);
      expect(result.skippedByStatus.finalized).toBe(1);
    });
  });

  describe('Step 2: dry-run support', () => {
    it('returns correct counts without modifying the file', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Article 1',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
          {
            doi: '10.1234/a2',
            title: 'Article 2',
            reviews: [{ reviewer: 'ai:claude', decision: 'exclude', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize(
        { sessionId, dryRun: true },
        sessionsDir
      );
      expect(result.includedCount).toBe(1);
      expect(result.excludedCount).toBe(1);

      // Verify file was NOT modified
      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBeUndefined();
      expect(reviewFile.articles[1]!.finalDecision).toBeUndefined();
    });
  });

  describe('Step 3: --min-reviewers support', () => {
    it('skips articles with fewer reviewers than minReviewers', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Single Reviewer',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize(
        { sessionId, minReviewers: 2 },
        sessionsDir
      );
      expect(result.includedCount).toBe(0);
      expect(result.excludedCount).toBe(0);
      // Single reviewer article is skipped due to insufficient reviewers
      expect(result.skippedByStatus['agreed-include']).toBe(1);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBeUndefined();
    });

    it('finalizes with minReviewers: 1 (default) for single-reviewer agreements', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Single Reviewer',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(1);
    });

    it('skips when minReviewers: 3 but only 2 reviewers exist', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [
          { name: 'ai:claude', basis: 'title' },
          { name: 'ai:gpt-4o', basis: 'title' },
        ],
        articles: [
          {
            doi: '10.1234/a1',
            title: 'Two Reviewers',
            reviews: [
              { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
              { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'title' },
            ],
          },
        ],
      });

      const result = await executeReviewFinalize(
        { sessionId, minReviewers: 3 },
        sessionsDir
      );
      expect(result.includedCount).toBe(0);
      expect(result.skippedByStatus['agreed-include']).toBe(1);
    });
  });

  describe('Step 4: multi-stage screening with basis priority', () => {
    it('article with title uncertain + abstract include from same reviewer → finalized as include', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/multi1',
            title: 'Multi-stage Article',
            reviews: [
              { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
              { reviewer: 'ai:claude', decision: 'include', basis: 'abstract' },
            ],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(1);
      expect(result.excludedCount).toBe(0);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBe('include');
    });

    it('article with title uncertain + abstract exclude from different reviewer → finalized as exclude', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [
          { name: 'ai:claude', basis: 'title' },
          { name: 'ai:gpt-4o', basis: 'abstract' },
        ],
        articles: [
          {
            doi: '10.1234/multi2',
            title: 'Cross-Reviewer Multi-stage',
            reviews: [
              { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
              { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'abstract' },
            ],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(0);
      expect(result.excludedCount).toBe(1);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBe('exclude');
    });

    it('article with only title uncertain → not finalized (still all-uncertain)', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/unc-only',
            title: 'Uncertain Only',
            reviews: [
              { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
            ],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(0);
      expect(result.excludedCount).toBe(0);
      expect(result.skippedByStatus['all-uncertain']).toBe(1);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBeUndefined();
    });
  });

  describe('Step 5: --decision filter', () => {
    it('decision: exclude only finalizes agreed-exclude; agreed-include skipped', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/inc',
            title: 'Include Article',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
          {
            doi: '10.1234/exc',
            title: 'Exclude Article',
            reviews: [{ reviewer: 'ai:claude', decision: 'exclude', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize(
        { sessionId, decision: 'exclude' },
        sessionsDir
      );
      expect(result.excludedCount).toBe(1);
      expect(result.includedCount).toBe(0);
      expect(result.skippedByStatus['agreed-include']).toBe(1);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBeUndefined();
      expect(reviewFile.articles[1]!.finalDecision).toBe('exclude');
    });

    it('decision: include only finalizes agreed-include; agreed-exclude skipped', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/inc',
            title: 'Include Article',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
          {
            doi: '10.1234/exc',
            title: 'Exclude Article',
            reviews: [{ reviewer: 'ai:claude', decision: 'exclude', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize(
        { sessionId, decision: 'include' },
        sessionsDir
      );
      expect(result.includedCount).toBe(1);
      expect(result.excludedCount).toBe(0);
      expect(result.skippedByStatus['agreed-exclude']).toBe(1);

      const reviewFile = await readReviewFile();
      expect(reviewFile.articles[0]!.finalDecision).toBe('include');
      expect(reviewFile.articles[1]!.finalDecision).toBeUndefined();
    });

    it('decision: undefined (default) finalizes both — existing behavior preserved', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [{ name: 'ai:claude', basis: 'title' }],
        articles: [
          {
            doi: '10.1234/inc',
            title: 'Include Article',
            reviews: [{ reviewer: 'ai:claude', decision: 'include', basis: 'title' }],
          },
          {
            doi: '10.1234/exc',
            title: 'Exclude Article',
            reviews: [{ reviewer: 'ai:claude', decision: 'exclude', basis: 'title' }],
          },
        ],
      });

      const result = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result.includedCount).toBe(1);
      expect(result.excludedCount).toBe(1);
      expect(result.skippedByStatus['agreed-include']).toBe(0);
      expect(result.skippedByStatus['agreed-exclude']).toBe(0);
    });

    it('skipped-by-filter articles counted in skippedByStatus under their agreed status', async () => {
      await setupReviewFile({
        sessionId,
        reviewers: [
          { name: 'ai:claude', basis: 'title' },
          { name: 'ai:gpt-4o', basis: 'title' },
        ],
        articles: [
          {
            doi: '10.1234/inc1',
            title: 'Include 1',
            reviews: [
              { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
              { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'title' },
            ],
          },
          {
            doi: '10.1234/inc2',
            title: 'Include 2',
            reviews: [
              { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
              { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'title' },
            ],
          },
          {
            doi: '10.1234/exc1',
            title: 'Exclude 1',
            reviews: [
              { reviewer: 'ai:claude', decision: 'exclude', basis: 'title' },
              { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'title' },
            ],
          },
          // pending - not affected by decision filter
          { doi: '10.1234/pend', title: 'Pending', reviews: [] },
        ],
      });

      const result = await executeReviewFinalize(
        { sessionId, decision: 'exclude' },
        sessionsDir
      );
      expect(result.excludedCount).toBe(1);
      expect(result.includedCount).toBe(0);
      expect(result.skippedByStatus['agreed-include']).toBe(2);
      expect(result.skippedByStatus.pending).toBe(1);
    });
  });
});

describe('formatFinalizeOutput', () => {
  it('formats standard output', () => {
    const result: ReviewFinalizeResult = {
      includedCount: 30,
      excludedCount: 12,
      skippedByStatus: {
        pending: 5,
        incomplete: 8,
        'all-uncertain': 12,
        divided: 3,
        finalized: 0,
        'agreed-include': 0,
        'agreed-exclude': 0,
      },
    };
    const output = formatFinalizeOutput(result);
    expect(output).toContain('Finalized 42 articles (30 include, 12 exclude)');
    expect(output).toContain('Skipped: 5 pending, 8 incomplete, 12 all-uncertain, 3 divided');
  });

  it('includes dry-run header', () => {
    const result: ReviewFinalizeResult = {
      includedCount: 5,
      excludedCount: 3,
      skippedByStatus: {
        pending: 0,
        incomplete: 0,
        'all-uncertain': 0,
        divided: 0,
        finalized: 0,
        'agreed-include': 0,
        'agreed-exclude': 0,
      },
    };
    const output = formatFinalizeOutput(result, { dryRun: true });
    expect(output).toContain('Dry run - no changes made');
    expect(output).toContain('Finalized 8 articles');
  });

  it('omits skipped line when all counts are zero', () => {
    const result: ReviewFinalizeResult = {
      includedCount: 10,
      excludedCount: 5,
      skippedByStatus: {
        pending: 0,
        incomplete: 0,
        'all-uncertain': 0,
        divided: 0,
        finalized: 0,
        'agreed-include': 0,
        'agreed-exclude': 0,
      },
    };
    const output = formatFinalizeOutput(result);
    expect(output).not.toContain('Skipped');
  });

  it('shows filtered-out agreed-include count when --decision exclude is active', () => {
    const result: ReviewFinalizeResult = {
      includedCount: 0,
      excludedCount: 5,
      skippedByStatus: {
        pending: 2,
        incomplete: 0,
        'all-uncertain': 0,
        divided: 0,
        finalized: 0,
        'agreed-include': 3,
        'agreed-exclude': 0,
      },
    };
    const output = formatFinalizeOutput(result, { decision: 'exclude' });
    expect(output).toContain('Skipped: 2 pending, 3 agreed-include (filtered)');
  });

  it('shows filtered-out agreed-exclude count when --decision include is active', () => {
    const result: ReviewFinalizeResult = {
      includedCount: 5,
      excludedCount: 0,
      skippedByStatus: {
        pending: 0,
        incomplete: 0,
        'all-uncertain': 0,
        divided: 0,
        finalized: 0,
        'agreed-include': 0,
        'agreed-exclude': 4,
      },
    };
    const output = formatFinalizeOutput(result, { decision: 'include' });
    expect(output).toContain('Skipped: 4 agreed-exclude (filtered)');
  });
});
