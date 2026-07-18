/**
 * E2E Tests for `search-hub summary` command
 *
 * Tests the summary command with real session data:
 * - Human-readable output
 * - JSON output
 * - Statistics accuracy
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import { computeSummary, formatSummary, formatSummaryJson } from './summary.js';
import { deduplicateArticles } from './export.js';
import type { Article } from '../../providers/base/types.js';
import type { SessionSummary } from './summary.js';

describe('search-hub summary E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const sampleArticles: Article[] = [
    {
      title: 'AI in Medical Education 2024',
      authors: [{ family: 'Smith', given: 'John' }],
      pmid: '11111111',
      doi: '10.1000/med.2024.001',
      source: 'pubmed',
      publicationDate: '2024-03-15',
      journal: 'BMC medical education',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Machine Learning in Medicine',
      authors: [{ family: 'Jones', given: 'Alice' }],
      pmid: '22222222',
      doi: '10.1000/med.2024.002',
      source: 'pubmed',
      publicationDate: '2024-06-01',
      journal: 'BMC medical education',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Neural Networks for Diagnosis',
      authors: [{ family: 'Chen', given: 'Wei' }],
      pmid: '33333333',
      doi: '10.1000/med.2025.001',
      source: 'pubmed',
      publicationDate: '2025-01-10',
      journal: 'JMIR medical education',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'ERIC Educational Technology Study',
      authors: [{ family: 'Teacher', given: 'Mary' }],
      ericId: 'ED654321',
      doi: '10.1000/eric.2023.001',
      source: 'eric',
      publicationDate: '2023-11-20',
      journal: 'Academic medicine',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'arXiv Deep Learning Paper',
      authors: [{ family: 'Wu', given: 'Li' }],
      arxivId: '2405.12345',
      source: 'arxiv',
      publicationDate: '2024-05-01',
      journal: 'arXiv preprint',
      retrievedAt: new Date().toISOString(),
    },
    {
      // Duplicate of first article (same DOI, from scopus)
      title: 'AI in Medical Education 2024 (Scopus)',
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
      await writeFile(join(sessionDir, `${provider}_results.jsonl`), jsonl, 'utf-8');
      await writeFile(
        join(sessionDir, `${provider}_query.txt`),
        `${provider} query string`,
        'utf-8',
      );
    }

    const session = {
      id,
      name: 'summary-e2e-test',
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

    await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');

    return id;
  }

  async function loadArticlesFromSession(
    sessionId: string,
    providers: string[],
  ): Promise<Article[]> {
    const articles: Article[] = [];
    for (const provider of providers) {
      const resultsPath = join(ctx.sessionsDir, sessionId, `${provider}_results.jsonl`);
      try {
        const content = await readFile(resultsPath, 'utf-8');
        const lines = content
          .trim()
          .split('\n')
          .filter((l) => l);
        for (const line of lines) {
          articles.push(JSON.parse(line));
        }
      } catch {
        // Provider may not have results
      }
    }
    return articles;
  }

  describe('summary command with real session data', () => {
    it('should produce human-readable output from session data', async () => {
      await createTestSession('summary-e2e-human', sampleArticles, [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
      ]);

      const allArticles = await loadArticlesFromSession('summary-e2e-human', [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
      ]);
      const dedupResult = deduplicateArticles(allArticles);
      const summary = computeSummary(allArticles, dedupResult.articles, {
        sessionId: 'summary-e2e-human',
        sessionName: 'summary-e2e-test',
      });
      const output = formatSummary(summary);

      expect(output).toContain('Session: summary-e2e-test (summary-e2e-human)');
      expect(output).toContain('Year distribution:');
      expect(output).toContain('Database breakdown:');
      expect(output).toContain('Top journals (by article count):');
      expect(output).toContain('Identifier coverage:');
    });

    it('should produce parseable JSON with --json flag', async () => {
      await createTestSession('summary-e2e-json', sampleArticles, [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
      ]);

      const allArticles = await loadArticlesFromSession('summary-e2e-json', [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
      ]);
      const dedupResult = deduplicateArticles(allArticles);
      const summary = computeSummary(allArticles, dedupResult.articles, {
        sessionId: 'summary-e2e-json',
        sessionName: 'summary-e2e-test',
      });
      const jsonOutput = formatSummaryJson(summary);

      const parsed = JSON.parse(jsonOutput) as SessionSummary;
      expect(parsed.sessionId).toBe('summary-e2e-json');
      expect(parsed.sessionName).toBe('summary-e2e-test');
      expect(typeof parsed.totalArticles).toBe('number');
      expect(typeof parsed.uniqueArticles).toBe('number');
      expect(parsed.yearDistribution).toBeDefined();
      expect(parsed.databaseBreakdown).toBeDefined();
      expect(Array.isArray(parsed.topJournals)).toBe(true);
      expect(parsed.identifierCoverage).toBeDefined();
    });

    it('should produce statistics that match actual session data', async () => {
      await createTestSession('summary-e2e-stats', sampleArticles, [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
      ]);

      const allArticles = await loadArticlesFromSession('summary-e2e-stats', [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
      ]);

      expect(allArticles).toHaveLength(6); // 3 pubmed + 1 eric + 1 arxiv + 1 scopus

      const dedupResult = deduplicateArticles(allArticles);
      const summary = computeSummary(allArticles, dedupResult.articles, {
        sessionId: 'summary-e2e-stats',
        sessionName: 'summary-e2e-test',
      });

      // Total is pre-dedup, unique is post-dedup
      expect(summary.totalArticles).toBe(6);
      expect(summary.uniqueArticles).toBe(5); // 1 dup removed (scopus article matches pubmed DOI)

      // Year distribution
      expect(summary.yearDistribution['2023']).toBe(1); // eric article
      expect(summary.yearDistribution['2024']).toBe(3); // 2 pubmed + 1 arxiv (scopus dup removed)
      expect(summary.yearDistribution['2025']).toBe(1); // 1 pubmed

      // Database breakdown (from unique articles)
      expect(summary.databaseBreakdown['pubmed']).toBe(3);
      expect(summary.databaseBreakdown['eric']).toBe(1);
      expect(summary.databaseBreakdown['arxiv']).toBe(1);
      // Scopus article was a dup, so pubmed record was kept
      expect(summary.databaseBreakdown['scopus']).toBeUndefined();

      // Top journals
      const journalNames = summary.topJournals.map((j) => j.name);
      expect(journalNames).toContain('BMC medical education');
      expect(summary.topJournals.find((j) => j.name === 'BMC medical education')!.count).toBe(2);

      // Identifier coverage (from 5 unique articles)
      // DOI: pubmed1, pubmed2, pubmed3, eric1 = 4
      expect(summary.identifierCoverage.withDoi).toBe(4);
      // PMID: pubmed1, pubmed2, pubmed3 = 3
      expect(summary.identifierCoverage.withPmid).toBe(3);
      // No DOI/PMID: arxiv1 = 1
      expect(summary.identifierCoverage.noDoiOrPmid).toBe(1);
    });
  });
});
