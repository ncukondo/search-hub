import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewExtract } from './extract.js';
import type { ReviewFile, ArticleEntry, WorkFile } from './types.js';

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
    // agreed-include (single reviewer, no registry)
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

  describe('--name option', () => {
    it('outputs to for-review/<name>/review.yaml when --name is specified', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, name: 'title-screening' },
        sessionsDir
      );

      const expectedPath = join(sessionsDir, sessionId, 'for-review', 'title-screening', 'review.yaml');
      expect(result.outputPath).toBe(expectedPath);

      const content = await readFile(expectedPath, 'utf-8');
      expect(content).toContain('sessionId');
    });

    it('rejects names containing /', async () => {
      await writeReviewFile(sampleArticles);

      await expect(
        executeReviewExtract(
          { sessionId, name: 'invalid/name' },
          sessionsDir
        )
      ).rejects.toThrow();
    });

    it('rejects names containing ..', async () => {
      await writeReviewFile(sampleArticles);

      await expect(
        executeReviewExtract(
          { sessionId, name: '..' },
          sessionsDir
        )
      ).rejects.toThrow();
    });

    it('rejects empty name', async () => {
      await writeReviewFile(sampleArticles);

      await expect(
        executeReviewExtract(
          { sessionId, name: '' },
          sessionsDir
        )
      ).rejects.toThrow();
    });
  });

  describe('filtering', () => {
    it('extracts filtered subset by single filter', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], name: 'batch' },
        sessionsDir
      );

      expect(result.extractedCount).toBe(3);
      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      expect(extracted.articles).toHaveLength(3);
    });

    it('extracts filtered subset by multiple filters', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending', 'conflicting'], name: 'batch' },
        sessionsDir
      );

      expect(result.extractedCount).toBe(4); // 3 pending + 1 conflicting
    });

    it('extracts all when no filter specified', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, name: 'batch' },
        sessionsDir
      );

      expect(result.extractedCount).toBe(6);
    });
  });

  describe('sorting', () => {
    it('sorts by year ascending', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'year', name: 'batch' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      const years = extracted.articles.map((a) => a.year);
      expect(years).toEqual(['2021', '2022', '2023']);
    });

    it('sorts by title ascending', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'title', name: 'batch' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      const titles = extracted.articles.map((a) => a.title);
      expect(titles).toEqual(['Pending Article A', 'Pending Article B', 'Pending Article C']);
    });

    it('sorts randomly with seed for reproducibility', async () => {
      await writeReviewFile(sampleArticles);

      const result1 = await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'random', seed: 42, name: 'batch1' },
        sessionsDir
      );
      const result2 = await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'random', seed: 42, name: 'batch2' },
        sessionsDir
      );

      const content1 = await readFile(result1.outputPath, 'utf-8');
      const content2 = await readFile(result2.outputPath, 'utf-8');
      const extracted1 = parseYaml(content1) as ReviewFile;
      const extracted2 = parseYaml(content2) as ReviewFile;

      expect(extracted1.articles.map((a) => a.title)).toEqual(
        extracted2.articles.map((a) => a.title)
      );
    });

    it('preserves original order when sort is "none"', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], sort: 'none', name: 'batch' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      const titles = extracted.articles.map((a) => a.title);
      expect(titles).toEqual(['Pending Article A', 'Pending Article B', 'Pending Article C']);
    });
  });

  describe('pagination', () => {
    it('respects limit option', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], limit: 2, name: 'batch' },
        sessionsDir
      );

      expect(result.extractedCount).toBe(2);
    });

    it('respects offset option', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], offset: 1, name: 'batch' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      expect(extracted.articles).toHaveLength(2);
      expect(extracted.articles[0]!.title).toBe('Pending Article B');
    });

    it('combines limit and offset', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, filter: ['pending'], offset: 1, limit: 1, name: 'batch' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;
      expect(extracted.articles).toHaveLength(1);
      expect(extracted.articles[0]!.title).toBe('Pending Article B');
    });
  });

  describe('output file', () => {
    it('creates for-review directory if it does not exist', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, name: 'new-review' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      expect(content).toContain('sessionId');
    });

    it('includes schema reference comment in output', async () => {
      await writeReviewFile(sampleArticles);

      const result = await executeReviewExtract(
        { sessionId, name: 'batch' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      expect(content).toContain('yaml-language-server');
      expect(content).toContain('review.schema.json');
    });

    it('copies schema file alongside YAML output', async () => {
      await writeReviewFile(sampleArticles);

      // First, ensure we have a schema file to copy
      const schemasDir = join(dirname(sessionsDir), '.search-hub', 'schemas');
      await mkdir(schemasDir, { recursive: true });
      await writeFile(
        join(schemasDir, 'review.schema.json'),
        JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', title: 'Review File' })
      );

      const result = await executeReviewExtract(
        { sessionId, name: 'batch' },
        sessionsDir
      );

      const schemaPath = join(dirname(result.outputPath), 'review.schema.json');
      await access(schemaPath); // Should not throw
      const schemaContent = await readFile(schemaPath, 'utf-8');
      expect(schemaContent).toContain('json-schema.org');
    });
  });

  it('throws error if reviews.yaml does not exist', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    await expect(
      executeReviewExtract({ sessionId, name: 'batch' }, sessionsDir)
    ).rejects.toThrow();
  });

  describe('ReviewFile extract with reviewHistory', () => {
    it('separates existing reviews into reviewHistory', async () => {
      const articlesWithReviews: ArticleEntry[] = [
        {
          title: 'Reviewed Article',
          pmid: '1',
          reviews: [
            { reviewer: 'gpt-4o', decision: 'include', basis: 'title', timestamp: '2024-01-01T00:00:00Z' },
            { reviewer: 'claude', decision: 'include', basis: 'abstract', timestamp: '2024-01-02T00:00:00Z' },
          ],
        },
        {
          title: 'Unreviewed Article',
          pmid: '2',
          reviews: [],
        },
      ];
      await writeReviewFile(articlesWithReviews);

      const result = await executeReviewExtract(
        { sessionId, name: 'confirm', reviewer: 'human:admin' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile & { articles: Array<ArticleEntry & { reviewHistory?: import('./types.js').Review[] }> };

      // reviews should be empty
      expect(extracted.articles[0]!.reviews).toEqual([]);
      expect(extracted.articles[1]!.reviews).toEqual([]);

      // reviewHistory should contain original reviews
      expect(extracted.articles[0]!.reviewHistory).toHaveLength(2);
      expect(extracted.articles[0]!.reviewHistory![0]!.reviewer).toBe('gpt-4o');
      expect(extracted.articles[0]!.reviewHistory![1]!.reviewer).toBe('claude');

      // Unreviewed article should have empty reviewHistory
      expect(extracted.articles[1]!.reviewHistory).toEqual([]);
    });

    it('includes top-level reviewer field in extracted ReviewFile', async () => {
      const articles: ArticleEntry[] = [
        { title: 'Article 1', pmid: '1', reviews: [] },
      ];
      await writeReviewFile(articles);

      const result = await executeReviewExtract(
        { sessionId, name: 'confirm', reviewer: 'human:admin' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile & { reviewer?: string };

      expect(extracted.reviewer).toBe('human:admin');
    });

    it('sets finalDecision to null in extracted ReviewFile', async () => {
      const articlesWithDecision: ArticleEntry[] = [
        {
          title: 'Decided Article',
          pmid: '1',
          reviews: [{ reviewer: 'human', decision: 'include', timestamp: '2024-01-01T00:00:00Z' }],
          finalDecision: 'include',
        },
        {
          title: 'Undecided Article',
          pmid: '2',
          reviews: [],
        },
      ];
      await writeReviewFile(articlesWithDecision);

      const result = await executeReviewExtract(
        { sessionId, name: 'confirm', reviewer: 'human:admin' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const extracted = parseYaml(content) as ReviewFile;

      // finalDecision should be null in extracted file
      expect(extracted.articles[0]!.finalDecision).toBeNull();
      expect(extracted.articles[1]!.finalDecision).toBeNull();
    });
  });

  describe('--basis and --reviewer options', () => {
    const articlesWithAbstracts: ArticleEntry[] = [
      {
        title: 'Article with Abstract',
        pmid: '100',
        doi: '10.1234/test',
        abstract: 'This is the abstract text.',
        reviews: [],
      },
      {
        title: 'Article without Abstract',
        pmid: '101',
        reviews: [],
      },
    ];

    it('extracts with --basis title outputs only id and title', async () => {
      await writeReviewFile(articlesWithAbstracts);

      const result = await executeReviewExtract(
        {
          sessionId,
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'phase1',
        },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;

      expect(workFile.sessionId).toBe(sessionId);
      expect(workFile.basis).toBe('title');
      expect(workFile.reviewer).toBe('ai:claude');
      expect(workFile.articles).toHaveLength(2);
      expect(workFile.articles[0]!.id).toBe('10.1234/test');
      expect(workFile.articles[0]!.title).toBe('Article with Abstract');
      expect(workFile.articles[0]!.abstract).toBeUndefined();
      expect(workFile.articles[0]!.decision).toBe('uncertain');
      expect(workFile.articles[0]!.comment).toBe('');
    });

    it('extracts with --basis abstract outputs id, title, and abstract', async () => {
      await writeReviewFile(articlesWithAbstracts);

      const result = await executeReviewExtract(
        {
          sessionId,
          basis: 'abstract',
          reviewer: 'ai:claude',
          name: 'phase2',
        },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;

      expect(workFile.basis).toBe('abstract');
      expect(workFile.articles[0]!.abstract).toBe('This is the abstract text.');
      // Article without abstract should still be included
      expect(workFile.articles[1]!.abstract).toBeUndefined();
    });

    it('uses first available identifier as id (doi > pmid > scopusId > ...)', async () => {
      const articles: ArticleEntry[] = [
        { title: 'DOI Article', doi: '10.1234/doi', pmid: '1', reviews: [] },
        { title: 'PMID Article', pmid: '2', scopusId: 'S2', reviews: [] },
        { title: 'Scopus Article', scopusId: 'S3', reviews: [] },
      ];
      await writeReviewFile(articles);

      const result = await executeReviewExtract(
        { sessionId, basis: 'title', reviewer: 'ai:test', name: 'ids' },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;

      expect(workFile.articles[0]!.id).toBe('10.1234/doi');
      expect(workFile.articles[1]!.id).toBe('2');
      expect(workFile.articles[2]!.id).toBe('S3');
    });

    it('defaults decision to uncertain in work file articles', async () => {
      await writeReviewFile(articlesWithAbstracts);

      const result = await executeReviewExtract(
        {
          sessionId,
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'default-decision',
        },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;

      // All articles should default to 'uncertain' instead of null
      for (const article of workFile.articles) {
        expect(article.decision).toBe('uncertain');
      }
    });

    it('extracts with --basis fulltext includes fulltext dirName and abstract', async () => {
      const articlesWithFulltext: ArticleEntry[] = [
        {
          title: 'Article with Fulltext',
          pmid: '200',
          doi: '10.1234/ft',
          abstract: 'Abstract text.',
          fulltext: { dirName: 'smith2024-abcd1234', hasFiles: { pdf: true, xml: false, markdown: true } },
          reviews: [],
        },
        {
          title: 'Article without Fulltext',
          pmid: '201',
          abstract: 'Another abstract.',
          reviews: [],
        },
      ];
      await writeReviewFile(articlesWithFulltext);

      const result = await executeReviewExtract(
        {
          sessionId,
          basis: 'fulltext',
          reviewer: 'ai:claude',
          name: 'fulltext-phase',
        },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;

      expect(workFile.basis).toBe('fulltext');
      // Article with fulltext should have dirName and abstract
      expect(workFile.articles[0]!.fulltext).toBe('smith2024-abcd1234');
      expect(workFile.articles[0]!.abstract).toBe('Abstract text.');
      // Article without fulltext should still be included but without fulltext
      expect(workFile.articles[1]!.fulltext).toBeUndefined();
      expect(workFile.articles[1]!.abstract).toBe('Another abstract.');
    });

    it('combines filter with basis option', async () => {
      const mixedArticles: ArticleEntry[] = [
        { title: 'Pending 1', pmid: '10', reviews: [] },
        { title: 'Reviewed 1', pmid: '11', reviews: [{ reviewer: 'human', decision: 'include' }] },
      ];
      await writeReviewFile(mixedArticles);

      const result = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'filtered',
        },
        sessionsDir
      );

      const content = await readFile(result.outputPath, 'utf-8');
      const workFile = parseYaml(content) as WorkFile;

      expect(workFile.articles).toHaveLength(1);
      expect(workFile.articles[0]!.title).toBe('Pending 1');
    });
  });
});
