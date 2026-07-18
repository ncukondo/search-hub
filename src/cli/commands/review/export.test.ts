import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewExport } from './export.js';
import type { ReviewFile, ArticleEntry } from './types.js';

describe('executeReviewExport', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-export-test-'));
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
    { title: 'Pending Article', pmid: '1', reviews: [] },
    // needs-final
    {
      title: 'Needs Final Article',
      pmid: '2',
      reviews: [{ reviewer: 'gpt-4o', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
    },
    // finalized - included
    {
      title: 'Included Article 1',
      pmid: '3',
      doi: '10.1234/inc1',
      year: '2022',
      reviews: [{ reviewer: 'human', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
      finalDecision: 'include',
    },
    {
      title: 'Included Article 2',
      pmid: '4',
      doi: '10.1234/inc2',
      year: '2023',
      reviews: [{ reviewer: 'human', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
      finalDecision: 'include',
    },
    // finalized - excluded
    {
      title: 'Excluded Article',
      pmid: '5',
      reviews: [{ reviewer: 'human', decision: 'exclude', timestamp: '2024-01-01T00:00:00Z' }],
      finalDecision: 'exclude',
    },
  ];

  describe('--only included', () => {
    it('exports only articles with finalDecision=include', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'included.yaml');

      const result = await executeReviewExport(
        { sessionId, only: 'included', output: outputPath, format: 'yaml' },
        sessionsDir,
      );

      expect(result.exportedCount).toBe(2);
      const content = await readFile(outputPath, 'utf-8');
      const exported = parseYaml(content) as { articles: ArticleEntry[] };
      expect(exported.articles).toHaveLength(2);
      expect(exported.articles.map((a) => a.title)).toEqual([
        'Included Article 1',
        'Included Article 2',
      ]);
    });
  });

  describe('--only excluded', () => {
    it('exports only articles with finalDecision=exclude', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'excluded.yaml');

      const result = await executeReviewExport(
        { sessionId, only: 'excluded', output: outputPath, format: 'yaml' },
        sessionsDir,
      );

      expect(result.exportedCount).toBe(1);
      const content = await readFile(outputPath, 'utf-8');
      const exported = parseYaml(content) as { articles: ArticleEntry[] };
      expect(exported.articles).toHaveLength(1);
      expect(exported.articles[0]!.title).toBe('Excluded Article');
    });
  });

  describe('output formats', () => {
    it('exports as YAML', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'export.yaml');

      await executeReviewExport(
        { sessionId, only: 'included', output: outputPath, format: 'yaml' },
        sessionsDir,
      );

      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('articles:');
      expect(content).toContain('Included Article 1');
    });

    it('exports as JSON', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'export.json');

      await executeReviewExport(
        { sessionId, only: 'included', output: outputPath, format: 'json' },
        sessionsDir,
      );

      const content = await readFile(outputPath, 'utf-8');
      const exported = JSON.parse(content);
      expect(exported.articles).toHaveLength(2);
    });

    it('exports as JSONL', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'export.jsonl');

      await executeReviewExport(
        { sessionId, only: 'included', output: outputPath, format: 'jsonl' },
        sessionsDir,
      );

      const content = await readFile(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).title).toBe('Included Article 1');
      expect(JSON.parse(lines[1]!).title).toBe('Included Article 2');
    });
  });

  describe('export content', () => {
    it('includes all article fields', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'export.json');

      await executeReviewExport(
        { sessionId, only: 'included', output: outputPath, format: 'json' },
        sessionsDir,
      );

      const content = await readFile(outputPath, 'utf-8');
      const exported = JSON.parse(content);
      const article = exported.articles[0];

      expect(article.title).toBe('Included Article 1');
      expect(article.pmid).toBe('3');
      expect(article.doi).toBe('10.1234/inc1');
      expect(article.year).toBe('2022');
      expect(article.finalDecision).toBe('include');
    });

    it('excludes review details by default', async () => {
      await writeReviewFile(sampleArticles);
      const outputPath = join(tempDir, 'output', 'export.json');

      await executeReviewExport(
        { sessionId, only: 'included', output: outputPath, format: 'json' },
        sessionsDir,
      );

      const content = await readFile(outputPath, 'utf-8');
      const exported = JSON.parse(content);

      // Reviews should not be included in export
      expect(exported.articles[0].reviews).toBeUndefined();
    });
  });

  it('creates output directory if not exists', async () => {
    await writeReviewFile(sampleArticles);
    const outputPath = join(tempDir, 'nested', 'deep', 'export.yaml');

    await executeReviewExport(
      { sessionId, only: 'included', output: outputPath, format: 'yaml' },
      sessionsDir,
    );

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('Included Article 1');
  });

  it('throws error if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    const outputPath = join(tempDir, 'output', 'export.yaml');

    await expect(
      executeReviewExport(
        { sessionId, only: 'included', output: outputPath, format: 'yaml' },
        sessionsDir,
      ),
    ).rejects.toThrow();
  });

  it('returns empty result when no articles match', async () => {
    await writeReviewFile([{ title: 'Pending', pmid: '1', reviews: [] }]);
    const outputPath = join(tempDir, 'output', 'export.yaml');

    const result = await executeReviewExport(
      { sessionId, only: 'included', output: outputPath, format: 'yaml' },
      sessionsDir,
    );

    expect(result.exportedCount).toBe(0);
  });
});
