/**
 * E2E Tests for `search-hub diff` command
 *
 * Tests the diff command with real session data:
 * - Human-readable output
 * - JSON output
 * - --show filter
 * - Deduplication before diffing
 * - Query diff comparison
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import { computeDiff, computeQueryDiff, formatDiff, formatDiffJson } from './diff.js';
import { deduplicateArticles } from './export.js';
import { loadSessionQuery } from './session-utils.js';
import { getSuggestion } from '../suggestions/rules.js';
import { formatSuggestion } from '../suggestions/index.js';
import type { Article } from '../../providers/base/types.js';

describe('search-hub diff E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // Session 1: "v5" - broader query, 6 articles
  const session1Articles: Article[] = [
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
      title: 'A Generative AI Virtual Teaching Assistant',
      authors: [{ family: 'Brown', given: 'Emma' }],
      pmid: '44444444',
      doi: '10.1000/nurse.2025.001',
      source: 'pubmed',
      publicationDate: '2025-02-01',
      journal: 'Nursing Education',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Effects of AI-based Physiotherapy Education',
      authors: [{ family: 'Lee', given: 'Kim' }],
      ericId: 'ED654321',
      source: 'eric',
      publicationDate: '2024-08-10',
      journal: 'Journal of Allied Health',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'arXiv Deep Learning Paper',
      authors: [{ family: 'Wu', given: 'Li' }],
      arxivId: '2405.12345',
      source: 'arxiv',
      publicationDate: '2024-05-01',
      retrievedAt: new Date().toISOString(),
    },
  ];

  // Session 2: "v6" - tighter query, 4 articles (2 dropped, 1 new)
  const session2Articles: Article[] = [
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
      // New article not in v5
      title: 'Bytes versus brains: AI-generated feedback and human tutor feedback',
      authors: [{ family: 'Taylor', given: 'Sara' }],
      pmid: '55555555',
      doi: '10.1000/bytes.2026.001',
      source: 'pubmed',
      publicationDate: '2026-01-15',
      journal: 'Medical Education',
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
      name: `diff-e2e-${id}`,
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

  async function createTestSessionWithQuery(
    id: string,
    articles: Article[],
    providers: string[],
    queryYaml: string,
  ): Promise<string> {
    const sessionId = await createTestSession(id, articles, providers);
    const sessionDir = join(ctx.sessionsDir, sessionId);
    await writeFile(join(sessionDir, 'query_common.yaml'), queryYaml, 'utf-8');
    return sessionId;
  }

  async function loadArticlesFromSession(
    sessionId: string,
    providers: string[],
  ): Promise<Article[]> {
    const { readFile } = await import('node:fs/promises');
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

  describe('diff with two real sessions', () => {
    it('should correctly compute diff between sessions', async () => {
      await createTestSession('wba-genai-v5', session1Articles, ['pubmed', 'eric', 'arxiv']);
      await createTestSession('wba-genai-v6', session2Articles, ['pubmed']);

      const articles1 = await loadArticlesFromSession('wba-genai-v5', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('wba-genai-v6', ['pubmed']);

      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);

      const diff = computeDiff(dedup1.articles, dedup2.articles);

      // v5 had 6, v6 had 4
      expect(diff.session1Count).toBe(6);
      expect(diff.session2Count).toBe(4);

      // 3 articles in common (shared PMIDs: 11111111, 22222222, 33333333)
      expect(diff.common).toHaveLength(3);

      // 1 added (Bytes versus brains - pmid 55555555)
      expect(diff.added).toHaveLength(1);
      expect(diff.added[0]!.title).toContain('Bytes versus brains');

      // 3 removed (Teaching Assistant, Physiotherapy, arXiv paper)
      expect(diff.removed).toHaveLength(3);
    });

    it('should produce human-readable output matching spec format', async () => {
      await createTestSession('wba-genai-v5', session1Articles, ['pubmed', 'eric', 'arxiv']);
      await createTestSession('wba-genai-v6', session2Articles, ['pubmed']);

      const articles1 = await loadArticlesFromSession('wba-genai-v5', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('wba-genai-v6', ['pubmed']);

      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);

      const diff = computeDiff(dedup1.articles, dedup2.articles);
      const output = formatDiff(diff, 'wba-genai-v5', 'wba-genai-v6');

      // Check header
      expect(output).toContain('Diff: wba-genai-v5 → wba-genai-v6');
      expect(output).toContain('Session 1: 6 articles (wba-genai-v5)');
      expect(output).toContain('Session 2: 4 articles (wba-genai-v6)');

      // Check summary
      expect(output).toContain('Common:  3 articles');
      expect(output).toContain('Added:   1 articles');
      expect(output).toContain('Removed: 3 articles');

      // Check added articles
      expect(output).toContain('Added (+1):');
      expect(output).toContain('+ [2026] Bytes versus brains');

      // Check removed articles
      expect(output).toContain('Removed (-3):');
      expect(output).toContain('- ');
      expect(output).toContain('A Generative AI Virtual Teaching Assistant');
    });

    it('should produce valid JSON output', async () => {
      await createTestSession('wba-genai-v5', session1Articles, ['pubmed', 'eric', 'arxiv']);
      await createTestSession('wba-genai-v6', session2Articles, ['pubmed']);

      const articles1 = await loadArticlesFromSession('wba-genai-v5', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('wba-genai-v6', ['pubmed']);

      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);

      const diff = computeDiff(dedup1.articles, dedup2.articles);
      const jsonOutput = formatDiffJson(diff, 'wba-genai-v5', 'wba-genai-v6');

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.session1).toBe('wba-genai-v5');
      expect(parsed.session2).toBe('wba-genai-v6');
      expect(parsed.summary.session1Count).toBe(6);
      expect(parsed.summary.session2Count).toBe(4);
      expect(parsed.summary.commonCount).toBe(3);
      expect(parsed.summary.addedCount).toBe(1);
      expect(parsed.summary.removedCount).toBe(3);
      expect(parsed.added).toHaveLength(1);
      expect(parsed.removed).toHaveLength(3);
      expect(parsed.common).toHaveLength(3);
    });

    it('should filter with --show added', async () => {
      await createTestSession('wba-genai-v5', session1Articles, ['pubmed', 'eric', 'arxiv']);
      await createTestSession('wba-genai-v6', session2Articles, ['pubmed']);

      const articles1 = await loadArticlesFromSession('wba-genai-v5', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('wba-genai-v6', ['pubmed']);

      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);

      const diff = computeDiff(dedup1.articles, dedup2.articles);
      const output = formatDiff(diff, 'wba-genai-v5', 'wba-genai-v6', 'added');

      expect(output).toContain('Bytes versus brains');
      expect(output).not.toContain('A Generative AI Virtual Teaching Assistant');
    });

    it('should handle sessions with duplicates across providers', async () => {
      // Session with same article from two providers
      const sessionWithDups: Article[] = [
        ...session1Articles,
        {
          // Duplicate via DOI from scopus
          title: 'AI in Medical Education 2024 (Scopus)',
          authors: [{ family: 'Smith', given: 'J.' }],
          scopusId: 'SCOPUS-001',
          doi: '10.1000/med.2024.001', // Same DOI as first pubmed article
          source: 'scopus',
          publicationDate: '2024-03-15',
          retrievedAt: new Date().toISOString(),
        },
      ];

      await createTestSession('with-dups', sessionWithDups, ['pubmed', 'eric', 'arxiv', 'scopus']);
      await createTestSession('wba-genai-v6', session2Articles, ['pubmed']);

      const articles1 = await loadArticlesFromSession('with-dups', [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
      ]);
      const articles2 = await loadArticlesFromSession('wba-genai-v6', ['pubmed']);

      // Dedup should remove the scopus duplicate
      const dedup1 = deduplicateArticles(articles1);
      expect(dedup1.duplicatesRemoved).toBe(1);

      const dedup2 = deduplicateArticles(articles2);

      const diff = computeDiff(dedup1.articles, dedup2.articles);

      // After dedup, session1 should have 6 unique articles (same as before)
      expect(diff.session1Count).toBe(6);
      expect(diff.session2Count).toBe(4);
      expect(diff.common).toHaveLength(3);
    });
  });

  describe('query diff with two sessions', () => {
    const queryV1 = `
name: medical-ai-search-v1
description: Version 1 - broad search
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - "medical education"
        - "artificial intelligence"
        - "machine learning"
    operator: OR
  - id: block-2
    field: title_abstract
    terms:
      keywords:
        - diagnosis
        - treatment
    operator: OR
filters:
  year_from: 2020
  year_to: 2025
  language:
    - en
`;

    const queryV2 = `
name: medical-ai-search-v2
description: Version 2 - narrower search with OSCE
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - "medical education"
        - "artificial intelligence"
    operator: OR
  - id: block-2
    field: title_abstract
    terms:
      keywords:
        - OSCE
        - "clinical examination"
    operator: OR
filters:
  year_from: 2021
  year_to: 2025
  language:
    - en
`;

    it('should compute query diff between two sessions', async () => {
      await createTestSessionWithQuery(
        'query-v1',
        session1Articles,
        ['pubmed', 'eric', 'arxiv'],
        queryV1,
      );
      await createTestSessionWithQuery('query-v2', session2Articles, ['pubmed'], queryV2);

      const query1 = await loadSessionQuery('query-v1', ctx.sessionsDir);
      const query2 = await loadSessionQuery('query-v2', ctx.sessionsDir);

      expect(query1).toBeDefined();
      expect(query2).toBeDefined();

      const queryDiff = computeQueryDiff(query1!, query2!);

      // Block 1: removed "machine learning"
      expect(queryDiff.blocks[0]!.removed).toContain('machine learning');

      // Block 2: removed "diagnosis", "treatment", added "OSCE", "clinical examination"
      expect(queryDiff.blocks[1]!.removed).toContain('diagnosis');
      expect(queryDiff.blocks[1]!.removed).toContain('treatment');
      expect(queryDiff.blocks[1]!.added).toContain('OSCE');
      expect(queryDiff.blocks[1]!.added).toContain('clinical examination');

      // Filters: yearFrom changed from 2020 to 2021
      expect(queryDiff.filters.yearFromChanged).toBe(true);
      expect(queryDiff.filters.oldYearFrom).toBe(2020);
      expect(queryDiff.filters.newYearFrom).toBe(2021);
    });

    it('should include query diff in formatted output', async () => {
      await createTestSessionWithQuery(
        'query-v1',
        session1Articles,
        ['pubmed', 'eric', 'arxiv'],
        queryV1,
      );
      await createTestSessionWithQuery('query-v2', session2Articles, ['pubmed'], queryV2);

      const query1 = await loadSessionQuery('query-v1', ctx.sessionsDir);
      const query2 = await loadSessionQuery('query-v2', ctx.sessionsDir);
      const queryDiff = computeQueryDiff(query1!, query2!);

      const articles1 = await loadArticlesFromSession('query-v1', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('query-v2', ['pubmed']);
      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);
      const diff = computeDiff(dedup1.articles, dedup2.articles);

      const output = formatDiff(diff, 'query-v1', 'query-v2', undefined, { queryDiff });

      // Check query changes section
      expect(output).toContain('Query changes:');
      expect(output).toContain('Block 1');
      expect(output).toContain('Block 2');
      expect(output).toContain('- machine learning');
      expect(output).toContain('+ OSCE');
      expect(output).toContain('Result changes:');
      expect(output).toContain('yearFrom: 2020 → 2021');
    });

    it('should include query diff in JSON output', async () => {
      await createTestSessionWithQuery(
        'query-v1',
        session1Articles,
        ['pubmed', 'eric', 'arxiv'],
        queryV1,
      );
      await createTestSessionWithQuery('query-v2', session2Articles, ['pubmed'], queryV2);

      const query1 = await loadSessionQuery('query-v1', ctx.sessionsDir);
      const query2 = await loadSessionQuery('query-v2', ctx.sessionsDir);
      const queryDiff = computeQueryDiff(query1!, query2!);

      const articles1 = await loadArticlesFromSession('query-v1', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('query-v2', ['pubmed']);
      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);
      const diff = computeDiff(dedup1.articles, dedup2.articles);

      const jsonOutput = formatDiffJson(diff, 'query-v1', 'query-v2', undefined, { queryDiff });
      const parsed = JSON.parse(jsonOutput);

      expect(parsed.queryDiff).toBeDefined();
      expect(parsed.queryDiff.blocks).toHaveLength(2);
      expect(parsed.queryDiff.filters.yearFromChanged).toBe(true);
    });

    it('should show placeholder when query is missing', async () => {
      // Create session without query file
      await createTestSession('no-query-v1', session1Articles, ['pubmed', 'eric', 'arxiv']);
      await createTestSession('no-query-v2', session2Articles, ['pubmed']);

      const query1 = await loadSessionQuery('no-query-v1', ctx.sessionsDir);
      const query2 = await loadSessionQuery('no-query-v2', ctx.sessionsDir);

      expect(query1).toBeUndefined();
      expect(query2).toBeUndefined();

      const articles1 = await loadArticlesFromSession('no-query-v1', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('no-query-v2', ['pubmed']);
      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);
      const diff = computeDiff(dedup1.articles, dedup2.articles);

      const output = formatDiff(diff, 'no-query-v1', 'no-query-v2', undefined, {
        showQueryDiffPlaceholder: true,
      });

      expect(output).toContain('Query changes: (query data not available)');
    });

    it('should hide query diff with noQueryDiff option', async () => {
      await createTestSessionWithQuery(
        'query-v1',
        session1Articles,
        ['pubmed', 'eric', 'arxiv'],
        queryV1,
      );
      await createTestSessionWithQuery('query-v2', session2Articles, ['pubmed'], queryV2);

      const query1 = await loadSessionQuery('query-v1', ctx.sessionsDir);
      const query2 = await loadSessionQuery('query-v2', ctx.sessionsDir);
      const queryDiff = computeQueryDiff(query1!, query2!);

      const articles1 = await loadArticlesFromSession('query-v1', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('query-v2', ['pubmed']);
      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);
      const diff = computeDiff(dedup1.articles, dedup2.articles);

      const output = formatDiff(diff, 'query-v1', 'query-v2', undefined, {
        queryDiff,
        noQueryDiff: true,
      });

      expect(output).not.toContain('Query changes:');
      expect(output).not.toContain('Result changes:');
    });
  });

  describe('diff merge suggestion with real sessions', () => {
    it('should suggest merge when both sessions have unique articles', async () => {
      await createTestSession('wba-genai-v5', session1Articles, ['pubmed', 'eric', 'arxiv']);
      await createTestSession('wba-genai-v6', session2Articles, ['pubmed']);

      const articles1 = await loadArticlesFromSession('wba-genai-v5', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('wba-genai-v6', ['pubmed']);

      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);
      const diff = computeDiff(dedup1.articles, dedup2.articles);

      // Both added (1) and removed (3) are > 0
      expect(diff.added.length).toBeGreaterThan(0);
      expect(diff.removed.length).toBeGreaterThan(0);

      const suggestion = getSuggestion({
        command: 'diff',
        sessionId: 'wba-genai-v6',
        diffSession1Id: 'wba-genai-v5',
        diffAddedCount: diff.added.length,
        diffRemovedCount: diff.removed.length,
      });

      const output = formatSuggestion(suggestion);

      expect(output).toContain('See also:');
      expect(output).toContain('search-hub merge wba-genai-v5 wba-genai-v6');
      expect(output).toContain('search-hub results wba-genai-v6');
    });

    it('should NOT suggest merge when session-2 is a superset', async () => {
      // session-2 contains all articles from session-1 plus more
      const supersetArticles: Article[] = [
        ...session1Articles,
        {
          title: 'Extra article only in superset',
          authors: [{ family: 'New', given: 'Author' }],
          pmid: '99999999',
          source: 'pubmed',
          publicationDate: '2025-01-01',
          retrievedAt: new Date().toISOString(),
        },
      ];

      await createTestSession('base-session', session1Articles, ['pubmed', 'eric', 'arxiv']);
      await createTestSession('superset-session', supersetArticles, ['pubmed', 'eric', 'arxiv']);

      const articles1 = await loadArticlesFromSession('base-session', ['pubmed', 'eric', 'arxiv']);
      const articles2 = await loadArticlesFromSession('superset-session', [
        'pubmed',
        'eric',
        'arxiv',
      ]);

      const dedup1 = deduplicateArticles(articles1);
      const dedup2 = deduplicateArticles(articles2);
      const diff = computeDiff(dedup1.articles, dedup2.articles);

      // Added > 0 but Removed = 0 (session-2 is superset)
      expect(diff.added.length).toBeGreaterThan(0);
      expect(diff.removed.length).toBe(0);

      const suggestion = getSuggestion({
        command: 'diff',
        sessionId: 'superset-session',
        diffSession1Id: 'base-session',
        diffAddedCount: diff.added.length,
        diffRemovedCount: diff.removed.length,
      });

      const output = formatSuggestion(suggestion);

      // Should NOT contain merge
      expect(output).not.toContain('merge');
      // Should still contain results
      expect(output).toContain('search-hub results superset-session');
    });
  });
});
