import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewMark } from './mark.js';
import type { ReviewFile, WorkFile } from './types.js';

describe('executeReviewMark', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-mark-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('ReviewFile screening format', () => {
    async function createScreeningFile(articles: ReviewFile['articles']): Promise<string> {
      const reviewFile: ReviewFile = {
        sessionId: 'test-session',
        basis: 'title',
        reviewer: 'ai:claude',
        articles,
      };
      const filePath = join(tempDir, 'screening.yaml');
      await writeFile(filePath, stringifyYaml(reviewFile));
      return filePath;
    }

    it('marks article by doi identifier', async () => {
      const filePath = await createScreeningFile([
        {
          doi: '10.1234/test1',
          title: 'Article 1',
          reviews: [{ decision: 'uncertain', comment: '' } as any],
        },
        {
          doi: '10.1234/test2',
          title: 'Article 2',
          reviews: [{ decision: 'uncertain', comment: '' } as any],
        },
      ]);

      await executeReviewMark({
        file: filePath,
        id: '10.1234/test1',
        decision: 'include',
      });

      const content = await readFile(filePath, 'utf-8');
      const file = parseYaml(content) as ReviewFile;
      expect(file.articles[0]!.reviews[0]!.decision).toBe('include');
      expect(file.articles[1]!.reviews[0]!.decision).toBe('uncertain');
    });

    it('marks article by pmid identifier', async () => {
      const filePath = await createScreeningFile([
        {
          pmid: '12345',
          title: 'Article 1',
          reviews: [{ decision: 'uncertain', comment: '' } as any],
        },
      ]);

      await executeReviewMark({
        file: filePath,
        id: '12345',
        decision: 'exclude',
        comment: 'Not relevant',
      });

      const content = await readFile(filePath, 'utf-8');
      const file = parseYaml(content) as ReviewFile;
      expect(file.articles[0]!.reviews[0]!.decision).toBe('exclude');
      expect(file.articles[0]!.reviews[0]!.comment).toBe('Not relevant');
    });

    it('overwrites existing decision in reviews[0]', async () => {
      const filePath = await createScreeningFile([
        {
          doi: '10.1234/test1',
          title: 'Article 1',
          reviews: [{ decision: 'include', comment: 'Initial' } as any],
        },
      ]);

      await executeReviewMark({
        file: filePath,
        id: '10.1234/test1',
        decision: 'exclude',
        comment: 'Changed',
      });

      const content = await readFile(filePath, 'utf-8');
      const file = parseYaml(content) as ReviewFile;
      expect(file.articles[0]!.reviews[0]!.decision).toBe('exclude');
      expect(file.articles[0]!.reviews[0]!.comment).toBe('Changed');
    });

    it('throws error when article not found by identifier', async () => {
      const filePath = await createScreeningFile([
        {
          doi: '10.1234/test1',
          title: 'Article 1',
          reviews: [{ decision: 'uncertain', comment: '' } as any],
        },
      ]);

      await expect(
        executeReviewMark({
          file: filePath,
          id: 'nonexistent',
          decision: 'include',
        })
      ).rejects.toThrow(/not found/i);
    });

    it('preserves schema reference comments on save', async () => {
      const content = [
        '# yaml-language-server: $schema=./review.schema.json',
        '# Screening by title only.',
        stringifyYaml({
          sessionId: 'test-session',
          basis: 'title',
          reviewer: 'ai:claude',
          articles: [{
            doi: '10.1234/test1',
            title: 'Article 1',
            reviews: [{ decision: 'uncertain', comment: '' }],
          }],
        }),
      ].join('\n');
      const filePath = join(tempDir, 'with-comments.yaml');
      await writeFile(filePath, content);

      await executeReviewMark({
        file: filePath,
        id: '10.1234/test1',
        decision: 'include',
      });

      const saved = await readFile(filePath, 'utf-8');
      expect(saved).toContain('yaml-language-server');
      expect(saved).toContain('Screening');
    });
  });

  describe('validation', () => {
    it('throws error when file has no basis field', async () => {
      const filePath = join(tempDir, 'invalid.yaml');
      await writeFile(filePath, stringifyYaml({
        sessionId: 'test',
        articles: [{ title: 'Test', reviews: [] }],
      }));

      await expect(
        executeReviewMark({
          file: filePath,
          id: '1',
          decision: 'include',
        })
      ).rejects.toThrow(/basis/i);
    });

    it('throws error when file does not exist', async () => {
      await expect(
        executeReviewMark({
          file: '/nonexistent/file.yaml',
          id: '1',
          decision: 'include',
        })
      ).rejects.toThrow();
    });
  });

  describe('old WorkFile format (backward compat)', () => {
    async function createWorkFile(articles: WorkFile['articles']): Promise<string> {
      const workFile: WorkFile = {
        sessionId: 'test-session',
        basis: 'title',
        reviewer: 'ai:claude',
        articles,
      };
      const filePath = join(tempDir, 'phase1.yaml');
      await writeFile(filePath, stringifyYaml(workFile));
      return filePath;
    }

    it('marks article in old WorkFile format by id', async () => {
      const filePath = await createWorkFile([
        { id: '10.1234/test1', title: 'Article 1', decision: null, comment: '' },
        { id: '10.1234/test2', title: 'Article 2', decision: null, comment: '' },
      ]);

      await executeReviewMark({
        file: filePath,
        id: '10.1234/test1',
        decision: 'include',
      });

      const content = await readFile(filePath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;
      expect(workFile.articles[0]!.decision).toBe('include');
      expect(workFile.articles[1]!.decision).toBeNull();
    });
  });
});
