/**
 * E2E Tests for query filter (-q / --query) on results and export commands.
 *
 * Creates a session with known articles and verifies that -q filtering
 * works end-to-end through the actual command pipeline.
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
  parseResultsOptions,
  validateResultsInput,
} from './results.js';
import {
  deduplicateArticles,
  filterArticles,
  formatIds,
  formatJsonl,
} from './export.js';
import { filterByQuery } from './query-filter.js';
import type { Article } from '../../providers/base/types.js';

describe('query filter E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const testArticles: Article[] = [
    {
      title: 'Deep Learning for Diabetes Prediction',
      authors: [{ family: 'Smith', given: 'John' }, { family: 'Tanaka', given: 'Yuki' }],
      pmid: '11111111',
      doi: '10.1001/jama.2023.12345',
      source: 'pubmed',
      publicationDate: '2023-06-15',
      journal: 'The Lancet Digital Health',
      abstract: 'A randomized controlled trial of deep learning models for diabetes prediction in clinical settings.',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Obesity Treatment with AI-Assisted Approaches',
      authors: [{ family: 'Johnson', given: 'Emma' }],
      pmid: '22222222',
      doi: '10.1002/obesity.2023.99',
      source: 'pubmed',
      publicationDate: '2023-09-01',
      journal: 'JAMA Internal Medicine',
      abstract: 'A study on obesity treatment using machine learning and AI approaches.',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Educational Data Mining in Medical Schools',
      authors: [{ family: 'Garcia', given: 'Maria' }],
      ericId: 'ED999999',
      source: 'eric',
      publicationDate: '2024-02-20',
      journal: 'Academic Medicine',
      abstract: 'Data mining techniques applied to educational outcomes in medical training.',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Neural Network Architectures for Genomics',
      authors: [{ family: 'Chen', given: 'Wei' }],
      arxivId: '2405.54321',
      source: 'arxiv',
      publicationDate: '2024-05-10',
      journal: 'arXiv preprint',
      abstract: 'Novel neural network architectures for genomic data analysis.',
      retrievedAt: new Date().toISOString(),
    },
  ];

  async function createTestSession(id: string, articles: Article[]): Promise<void> {
    const sessionDir = join(ctx.sessionsDir, id);
    await mkdir(sessionDir, { recursive: true });

    const articlesByProvider: Record<string, Article[]> = {};
    for (const article of articles) {
      if (!articlesByProvider[article.source]) {
        articlesByProvider[article.source] = [];
      }
      articlesByProvider[article.source]!.push(article);
    }

    const databases: Record<string, object> = {};
    const providers = Object.keys(articlesByProvider);

    for (const provider of providers) {
      const providerArticles = articlesByProvider[provider]!;
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
      await writeFile(join(sessionDir, `${provider}_results.jsonl`), jsonl, 'utf-8');
      await writeFile(join(sessionDir, `${provider}_query.txt`), `${provider} query`, 'utf-8');
    }

    const session = {
      id,
      name: 'query-filter-e2e',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query: { file: 'test.yaml', hash: 'abc', content: 'name: test\nquery: []' },
      databases,
      summary: {
        status: 'completed',
        totalHits: articles.length,
        totalRetrieved: articles.length,
      },
    };

    await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');
  }

  async function loadAllArticles(sessionId: string): Promise<Article[]> {
    const articles: Article[] = [];
    for (const provider of ['pubmed', 'eric', 'arxiv', 'scopus']) {
      const filePath = join(ctx.sessionsDir, sessionId, `${provider}_results.jsonl`);
      try {
        const content = await readFile(filePath, 'utf-8');
        for (const line of content.trim().split('\n').filter(Boolean)) {
          articles.push(JSON.parse(line));
        }
      } catch {
        // Provider not present
      }
    }
    return articles;
  }

  describe('results -q filtering', () => {
    const sessionId = 'qf-e2e-001';

    beforeEach(async () => {
      await createTestSession(sessionId, testArticles);
    });

    it('filters by free text matching title', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'diabetes');

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.pmid).toBe('11111111');
    });

    it('filters by doi exact match', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'doi:10.1001/jama.2023.12345');

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.title).toContain('Diabetes');
    });

    it('returns 0 results for nonexistent query', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'nonexistent_term_xyz');

      expect(filtered).toHaveLength(0);
    });

    it('filters by combined author and year', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'author:smith year:2023');

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.pmid).toBe('11111111');
    });

    it('filters by source provider', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'source:eric');

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.ericId).toBe('ED999999');
    });

    it('integrates with results formatting pipeline', async () => {
      const articles = await loadAllArticles(sessionId);
      const dedupResult = deduplicateArticles(articles);
      const filtered = filterByQuery(dedupResult.articles, 'author:tanaka');

      const output = formatResultsList(filtered, {
        sessionId,
        sessionName: 'query-filter-e2e',
        total: filtered.length,
        filteredFrom: dedupResult.articles.length,
      });

      expect(output).toContain('Diabetes');
      expect(output).toContain('filtered from');
      expect(output).not.toContain('Obesity');
    });

    it('integrates with JSON output pipeline', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'year:2024');

      const jsonOutput = formatResultsJson(filtered);
      const parsed = JSON.parse(jsonOutput);

      expect(parsed).toHaveLength(2); // eric + arxiv articles from 2024
      expect(parsed.every((a: Article) => {
        const year = a.publicationDate ? parseInt(a.publicationDate.slice(0, 4), 10) : 0;
        return year === 2024;
      })).toBe(true);
    });
  });

  describe('export -q filtering', () => {
    const sessionId = 'qf-e2e-002';

    beforeEach(async () => {
      await createTestSession(sessionId, testArticles);
    });

    it('filters exported articles by year query', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'year:2023');

      expect(filtered).toHaveLength(2); // two 2023 articles (pubmed)

      // Verify they have expected DOIs
      const dois = filtered.map((a) => a.doi).filter(Boolean);
      expect(dois).toHaveLength(2);
      expect(dois.every((d) => d!.startsWith('10.'))).toBe(true);
    });

    it('filters exported articles with JSONL format', async () => {
      const articles = await loadAllArticles(sessionId);
      const filtered = filterByQuery(articles, 'journal:lancet');

      const jsonlOutput = formatJsonl(filtered);
      const lines = jsonlOutput.trim().split('\n').filter(Boolean);

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.journal).toContain('Lancet');
    });
  });

  describe('validation: -q with legacy flags', () => {
    it('rejects -q combined with --filter-title', () => {
      const opts = parseResultsOptions('test-session', {
        query: 'diabetes',
        filterTitle: 'something',
      });
      const validation = validateResultsInput(opts);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('-q/--query');
    });

    it('rejects -q combined with --filter-year', () => {
      const opts = parseResultsOptions('test-session', {
        query: 'diabetes',
        filterYear: '2023',
      });
      const validation = validateResultsInput(opts);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('-q/--query');
    });

    it('rejects -q combined with --filter-abstract', () => {
      const opts = parseResultsOptions('test-session', {
        query: 'diabetes',
        filterAbstract: 'something',
      });
      const validation = validateResultsInput(opts);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('-q/--query');
    });

    it('accepts -q alone', () => {
      const opts = parseResultsOptions('test-session', {
        query: 'author:smith year:2023',
      });
      const validation = validateResultsInput(opts);

      expect(validation.valid).toBe(true);
    });
  });
});
