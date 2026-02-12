/**
 * E2E Tests for `search-hub results` command
 *
 * Tests the results command with real session data:
 * - Human-readable output with article listing
 * - JSON output
 * - Pagination (limit/offset)
 * - Filtering options
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import {
  setupE2EContext,
  type E2EContext,
} from '../e2e-helpers.js';
import {
  formatResultsList,
  formatResultsJson,
} from './results.js';
import { deduplicateArticles } from './export.js';
import type { Article } from '../../providers/base/types.js';

describe('search-hub results E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const sampleArticles: Article[] = [
    {
      title: 'AI in Medical Education: A Comprehensive Review',
      authors: [{ family: 'Smith', given: 'John' }],
      pmid: '11111111',
      doi: '10.1000/med.2024.001',
      source: 'pubmed',
      publicationDate: '2024-03-15',
      journal: 'BMC medical education',
      abstract: 'This comprehensive review examines the application of artificial intelligence in medical education, analyzing current implementations and future directions for AI-assisted learning in healthcare training programs.',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Machine Learning Applications in Healthcare',
      authors: [{ family: 'Jones', given: 'Alice' }],
      pmid: '22222222',
      doi: '10.1000/med.2024.002',
      source: 'pubmed',
      publicationDate: '2024-06-01',
      journal: 'BMC medical education',
      abstract: 'We present a systematic analysis of machine learning applications in healthcare settings, with emphasis on diagnostic accuracy and clinical decision support systems.',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Neural Networks for Medical Diagnosis',
      authors: [{ family: 'Chen', given: 'Wei' }],
      pmid: '33333333',
      doi: '10.1000/med.2025.001',
      source: 'pubmed',
      publicationDate: '2025-01-10',
      journal: 'JMIR medical education',
      // No abstract for this article
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Educational Technology in Medical Training',
      authors: [{ family: 'Teacher', given: 'Mary' }],
      ericId: 'ED654321',
      doi: '10.1000/eric.2023.001',
      source: 'eric',
      publicationDate: '2023-11-20',
      journal: 'Academic medicine',
      abstract: 'This study explores the integration of educational technology tools in medical training curricula.',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Deep Learning Methods for Clinical Data',
      authors: [{ family: 'Wu', given: 'Li' }],
      arxivId: '2405.12345',
      source: 'arxiv',
      publicationDate: '2024-05-01',
      journal: 'arXiv preprint',
      abstract: 'A'.repeat(500), // Long abstract to test truncation
      retrievedAt: new Date().toISOString(),
    },
    {
      // Duplicate of first article (same DOI, from scopus)
      title: 'AI in Medical Education: A Comprehensive Review (Scopus)',
      authors: [{ family: 'Smith', given: 'J.' }],
      scopusId: 'SCOPUS-001',
      doi: '10.1000/med.2024.001',
      source: 'scopus',
      publicationDate: '2024-03-15',
      retrievedAt: new Date().toISOString(),
    },
  ];

  async function createTestSession(
    id: string,
    articles: Article[],
    providers: string[],
  ): Promise<string> {
    const sessionDir = join(ctx.sessionsDir, id);
    await mkdir(sessionDir, { recursive: true });

    const articlesByProvider: Record<string, Article[]> = {};
    for (const article of articles) {
      const provider = article.source;
      if (!articlesByProvider[provider]) {
        articlesByProvider[provider] = [];
      }
      articlesByProvider[provider]!.push(article);
    }

    const databases: Record<string, object> = {};
    for (const provider of providers) {
      const providerArticles = articlesByProvider[provider] ?? [];
      databases[provider] = {
        status: 'completed',
        totalHits: providerArticles.length,
        retrievedCount: providerArticles.length,
        files: {
          query: `${provider}_query.txt`,
          results: `${provider}_results.jsonl`,
        },
      };

      const jsonl = providerArticles.map((a) => JSON.stringify(a)).join('\n');
      await writeFile(
        join(sessionDir, `${provider}_results.jsonl`),
        jsonl,
        'utf-8',
      );
      await writeFile(
        join(sessionDir, `${provider}_query.txt`),
        `${provider} query string`,
        'utf-8',
      );
    }

    const session = {
      id,
      name: 'results-e2e-test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query: {
        file: 'test-query.yaml',
        hash: 'abc123',
        content: 'name: test\nquery: []',
      },
      databases,
      summary: {
        status: 'completed',
        totalHits: articles.length,
        totalRetrieved: articles.length,
      },
    };

    await writeFile(
      join(sessionDir, 'session.yaml'),
      stringifyYaml(session),
      'utf-8',
    );

    return id;
  }

  async function loadArticlesFromSession(
    sessionId: string,
    providers: string[],
  ): Promise<Article[]> {
    const articles: Article[] = [];
    for (const provider of providers) {
      const resultsPath = join(
        ctx.sessionsDir,
        sessionId,
        `${provider}_results.jsonl`,
      );
      try {
        const content = await readFile(resultsPath, 'utf-8');
        const lines = content.trim().split('\n').filter((l) => l);
        for (const line of lines) {
          articles.push(JSON.parse(line));
        }
      } catch {
        // Provider may not have results
      }
    }
    return articles;
  }

  describe('results command with real session data', () => {
    it('should produce human-readable output listing articles', async () => {
      await createTestSession(
        'results-e2e-human',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-human',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );
      const dedupResult = deduplicateArticles(allArticles);
      const output = formatResultsList(dedupResult.articles, {
        sessionId: 'results-e2e-human',
        sessionName: 'results-e2e-test',
        total: dedupResult.articles.length,
      });

      expect(output).toContain('Results: results-e2e-test (results-e2e-human)');
      expect(output).toContain('Showing 1-5 of 5 articles');
      expect(output).toContain('AI in Medical Education');
      expect(output).toContain('Machine Learning Applications');
      expect(output).toContain('Neural Networks');
      expect(output).toContain('Educational Technology');
      expect(output).toContain('Deep Learning Methods');
      expect(output).toContain('[2024]');
      expect(output).toContain('[2025]');
      expect(output).toContain('[2023]');
    });

    it('should produce parseable JSON with --json flag', async () => {
      await createTestSession(
        'results-e2e-json',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-json',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );
      const dedupResult = deduplicateArticles(allArticles);
      const jsonOutput = formatResultsJson(dedupResult.articles);

      const parsed = JSON.parse(jsonOutput) as (Article & { year: number | null })[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(5); // 6 - 1 dup
      expect(parsed[0]).toHaveProperty('title');
      expect(parsed[0]).toHaveProperty('year');
      expect(parsed[0]).toHaveProperty('source');
    });

    it('should support pagination with limit option', async () => {
      await createTestSession(
        'results-e2e-limit',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-limit',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );
      const dedupResult = deduplicateArticles(allArticles);
      const limited = dedupResult.articles.slice(0, 2);
      const output = formatResultsList(limited, {
        sessionId: 'results-e2e-limit',
        sessionName: 'results-e2e-test',
        total: dedupResult.articles.length,
        offset: 0,
      });

      expect(output).toContain('Showing 1-2 of 5 articles');
      // Should only have 2 articles listed
      const articleMatches = output.match(/^\s*\d+\./gm);
      expect(articleMatches).toHaveLength(2);
    });

    it('should support pagination with offset option', async () => {
      await createTestSession(
        'results-e2e-offset',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-offset',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );
      const dedupResult = deduplicateArticles(allArticles);
      const offset = 2;
      const offsetArticles = dedupResult.articles.slice(offset, offset + 2);
      const output = formatResultsList(offsetArticles, {
        sessionId: 'results-e2e-offset',
        sessionName: 'results-e2e-test',
        total: dedupResult.articles.length,
        offset,
      });

      expect(output).toContain('Showing 3-4 of 5 articles');
      // First article should be numbered 3
      expect(output).toContain('3.');
    });

    it('should deduplicate articles by DOI', async () => {
      await createTestSession(
        'results-e2e-dedup',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-dedup',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      expect(allArticles).toHaveLength(6);

      const dedupResult = deduplicateArticles(allArticles);
      expect(dedupResult.articles).toHaveLength(5);
      expect(dedupResult.duplicatesRemoved).toBe(1);

      // Verify the duplicate was the scopus article (same DOI as pubmed)
      const sources = dedupResult.articles.map((a) => a.source);
      expect(sources).toContain('pubmed');
      expect(sources).toContain('eric');
      expect(sources).toContain('arxiv');
      // Scopus article should have been merged (pubmed version kept because it appeared first)
      const scopusCount = sources.filter((s) => s === 'scopus').length;
      expect(scopusCount).toBe(0);
    });

    it('should display abstracts when --abstract flag is set', async () => {
      await createTestSession(
        'results-e2e-abstract',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-abstract',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );
      const dedupResult = deduplicateArticles(allArticles);
      const output = formatResultsList(dedupResult.articles, {
        sessionId: 'results-e2e-abstract',
        sessionName: 'results-e2e-test',
        total: dedupResult.articles.length,
        showAbstract: true,
      });

      // Should contain abstracts
      expect(output).toContain('Abstract:');
      expect(output).toContain('comprehensive review examines the application of artificial intelligence');
      expect(output).toContain('systematic analysis of machine learning');
      // Should show placeholder for missing abstract
      expect(output).toContain('(No abstract available)');
    });

    it('should truncate long abstracts with --abstract-length', async () => {
      await createTestSession(
        'results-e2e-abstract-length',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-abstract-length',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );
      const dedupResult = deduplicateArticles(allArticles);
      const output = formatResultsList(dedupResult.articles, {
        sessionId: 'results-e2e-abstract-length',
        sessionName: 'results-e2e-test',
        total: dedupResult.articles.length,
        showAbstract: true,
        abstractLength: 100,
      });

      // The long abstract (500 As) should be truncated
      expect(output).toContain('...');
      // Should not contain the full 500-character abstract
      expect(output).not.toContain('A'.repeat(500));
    });

    it('should not display abstracts when --abstract flag is not set', async () => {
      await createTestSession(
        'results-e2e-no-abstract',
        sampleArticles,
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );

      const allArticles = await loadArticlesFromSession(
        'results-e2e-no-abstract',
        ['pubmed', 'eric', 'arxiv', 'scopus'],
      );
      const dedupResult = deduplicateArticles(allArticles);
      const output = formatResultsList(dedupResult.articles, {
        sessionId: 'results-e2e-no-abstract',
        sessionName: 'results-e2e-test',
        total: dedupResult.articles.length,
        showAbstract: false,
      });

      // Should not contain any abstract content
      expect(output).not.toContain('Abstract:');
      expect(output).not.toContain('(No abstract available)');
    });
  });
});
