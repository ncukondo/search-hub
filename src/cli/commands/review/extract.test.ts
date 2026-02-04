import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewExtract } from './extract.js';
import type { ReviewFile, ArticleEntry } from './types.js';

describe('executeReviewExtract', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-extract-test-'));
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

  const sampleArticles: ArticleEntry[] = [
    // pending
    { title: 'Pending Article A', pmid: '1', year: '2022', reviews: [] },
    { title: 'Pending Article B', pmid: '2', year: '2021', reviews: [] },
    { title: 'Pending Article C', pmid: '3', year: '2023', reviews: [] },
    // conflicting
    {
      title: 'Conflicting Article',
      pmid: '4',
      year: '2020',
      reviews: [
        { reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
        { reviewer: 'claude', decision: 'exclude', timestamp: '2024-01-01T01:00:00Z' },
      ],
    },
    // needs-final
    {
      title: 'Needs Final Article',
      pmid: '5',
      year: '2019',
      reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
    },
    // finalized
    {
      title: 'Finalized Article',
      pmid: '6',
      year: '2018',
      reviews: [{ reviewer: 'human', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
      finalDecision: 'include',
    },
  ];

  describe('filtering', () => {
    it('extracts filtered subset by single filter', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], output: outputPath },
        sessionsDir
      );

      expect(result.extractedCount).toBe(3);
      const content = await readFile(outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      expect(extracted.articles).toHaveLength(3);
    });

    it('extracts filtered subset by multiple filters', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending', 'conflicting'], output: outputPath },
        sessionsDir
      );

      expect(result.extractedCount).toBe(4); // 3 pending + 1 conflicting
    });

    it('extracts all when no filter specified', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      const result = await executeReviewExtract(
        { sessionId, output: outputPath },
        sessionsDir
      );

      expect(result.extractedCount).toBe(6);
    });
  });

  describe('sorting', () => {
    it('sorts by year ascending', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'year', output: outputPath },
        sessionsDir
      );

      const content = await readFile(outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      const years = extracted.articles.map((a) => a.year);
      expect(years).toEqual(['2021', '2022', '2023']);
    });

    it('sorts by title ascending', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'title', output: outputPath },
        sessionsDir
      );

      const content = await readFile(outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      const titles = extracted.articles.map((a) => a.title);
      expect(titles).toEqual(['Pending Article A', 'Pending Article B', 'Pending Article C']);
    });

    it('sorts randomly with seed for reproducibility', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath1 = join(tempDir, 'output1', 'batch.yaml');
      const outputPath2 = join(tempDir, 'output2', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'random', seed: 42, output: outputPath1 },
        sessionsDir
      );
      await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'random', seed: 42, output: outputPath2 },
        sessionsDir
      );

      const content1 = await readFile(outputPath1, 'utf-8');
      const content2 = await readFile(outputPath2, 'utf-8');
      const extracted1 = parseYaml(content1) as ReviewFile;
      const extracted2 = parseYaml(content2) as ReviewFile;

      expect(extracted1.articles.map((a) => a.title)).toEqual(
        extracted2.articles.map((a) => a.title)
      );
    });

    it('preserves original order when sort is "none"', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'none', output: outputPath },
        sessionsDir
      );

      const content = await readFile(outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      const titles = extracted.articles.map((a) => a.title);
      expect(titles).toEqual(['Pending Article A', 'Pending Article B', 'Pending Article C']);
    });
  });

  describe('pagination', () => {
    it('respects limit option', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], limit: 2, output: outputPath },
        sessionsDir
      );

      expect(result.extractedCount).toBe(2);
    });

    it('respects offset option', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, filter: ['pending'], offset: 1, output: outputPath },
        sessionsDir
      );

      const content = await readFile(outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      expect(extracted.articles).toHaveLength(2);
      expect(extracted.articles[0]!.title).toBe('Pending Article B');
    });

    it('combines limit and offset', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, filter: ['pending'], offset: 1, limit: 1, output: outputPath },
        sessionsDir
      );

      const content = await readFile(outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      expect(extracted.articles).toHaveLength(1);
      expect(extracted.articles[0]!.title).toBe('Pending Article B');
    });
  });

  describe('output file', () => {
    it('creates output directory if it does not exist', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'nested', 'deep', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, output: outputPath },
        sessionsDir
      );

      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('sessionId');
    });

    it('includes schema reference comment in output', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      await executeReviewExtract(
        { sessionId, output: outputPath },
        sessionsDir
      );

      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('yaml-language-server');
      expect(content).toContain('review.schema.json');
    });

    it('copies schema file alongside YAML output', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'batch.yaml');

      // First, ensure we have a schema file to copy
      const schemasDir = join(dirname(sessionsDir), '.search-hub', 'schemas');
      await mkdir(schemasDir, { recursive: true });
      await writeFile(
        join(schemasDir, 'review.schema.json'),
        JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', title: 'Review File' })
      );

      await executeReviewExtract(
        { sessionId, output: outputPath },
        sessionsDir
      );

      const schemaPath = join(tempDir, 'output', 'review.schema.json');
      await access(schemaPath); // Should not throw
      const schemaContent = await readFile(schemaPath, 'utf-8');
      expect(schemaContent).toContain('json-schema.org');
    });
  });

  it('throws error if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    const outputPath = join(tempDir, 'output', 'batch.yaml');

    await expect(
      executeReviewExtract({ sessionId, output: outputPath }, sessionsDir)
    ).rejects.toThrow();
  });
});
