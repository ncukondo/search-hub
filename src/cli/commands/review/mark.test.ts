import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewMark } from './mark.js';
import type { ReviewBasis } from './types.js';

/**
 * Work file structure for AI agent workflow
 */
interface WorkFile {
  sessionId: string;
  basis: ReviewBasis;
  reviewer: string;
  articles: Array<{
    id: string;
    title: string;
    abstract?: string;
    decision: 'include' | 'exclude' | 'uncertain' | null;
    comment: string;
  }>;
}

describe('executeReviewMark', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-mark-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

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

  describe('single article marking', () => {
    it('marks a single article with decision', async () => {
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

    it('marks a single article with decision and comment', async () => {
      const filePath = await createWorkFile([
        { id: '10.1234/test1', title: 'Article 1', decision: null, comment: '' },
      ]);

      await executeReviewMark({
        file: filePath,
        id: '10.1234/test1',
        decision: 'exclude',
        comment: 'Not relevant to research question',
      });

      const content = await readFile(filePath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;
      expect(workFile.articles[0]!.decision).toBe('exclude');
      expect(workFile.articles[0]!.comment).toBe('Not relevant to research question');
    });

    it('overwrites existing decision', async () => {
      const filePath = await createWorkFile([
        { id: '10.1234/test1', title: 'Article 1', decision: 'include', comment: 'Initial' },
      ]);

      await executeReviewMark({
        file: filePath,
        id: '10.1234/test1',
        decision: 'exclude',
        comment: 'Changed my mind',
      });

      const content = await readFile(filePath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;
      expect(workFile.articles[0]!.decision).toBe('exclude');
      expect(workFile.articles[0]!.comment).toBe('Changed my mind');
    });

    it('throws error when article not found', async () => {
      const filePath = await createWorkFile([
        { id: '10.1234/test1', title: 'Article 1', decision: null, comment: '' },
      ]);

      await expect(
        executeReviewMark({
          file: filePath,
          id: 'nonexistent',
          decision: 'include',
        })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('batch marking via JSON input', () => {
    it('marks multiple articles from JSON input', async () => {
      const filePath = await createWorkFile([
        { id: '10.1234/test1', title: 'Article 1', decision: null, comment: '' },
        { id: '10.1234/test2', title: 'Article 2', decision: null, comment: '' },
        { id: '10.1234/test3', title: 'Article 3', decision: null, comment: '' },
      ]);

      const decisions = [
        { id: '10.1234/test1', decision: 'include', comment: 'Relevant' },
        { id: '10.1234/test2', decision: 'exclude', comment: 'Off topic' },
      ];
      const inputPath = join(tempDir, 'decisions.json');
      await writeFile(inputPath, JSON.stringify(decisions));

      const result = await executeReviewMark({
        file: filePath,
        input: inputPath,
      });

      expect(result.marked).toBe(2);

      const content = await readFile(filePath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;
      expect(workFile.articles[0]!.decision).toBe('include');
      expect(workFile.articles[0]!.comment).toBe('Relevant');
      expect(workFile.articles[1]!.decision).toBe('exclude');
      expect(workFile.articles[1]!.comment).toBe('Off topic');
      expect(workFile.articles[2]!.decision).toBeNull();
    });

    it('reports warnings for unknown article ids', async () => {
      const filePath = await createWorkFile([
        { id: '10.1234/test1', title: 'Article 1', decision: null, comment: '' },
      ]);

      const decisions = [
        { id: '10.1234/test1', decision: 'include' },
        { id: 'unknown', decision: 'exclude' },
      ];
      const inputPath = join(tempDir, 'decisions.json');
      await writeFile(inputPath, JSON.stringify(decisions));

      const result = await executeReviewMark({
        file: filePath,
        input: inputPath,
      });

      expect(result.marked).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('unknown');
    });
  });

  describe('work file validation', () => {
    it('throws error when file has no basis field', async () => {
      const filePath = join(tempDir, 'invalid.yaml');
      await writeFile(filePath, stringifyYaml({
        sessionId: 'test',
        articles: [{ id: '1', title: 'Test', decision: null, comment: '' }],
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
});
