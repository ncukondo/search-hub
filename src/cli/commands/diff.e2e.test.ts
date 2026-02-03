/**
 * E2E Tests for `search-hub diff` command
 *
 * Tests the diff command with real session data:
 * - Human-readable output
 * - JSON output
 * - --show filter
 * - Deduplication before diffing
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
} from '../e2e-helpers.js';
import {
  computeDiff,
  formatDiff,
  formatDiffJson,
} from './diff.js';
import { deduplicateArticles } from './export.js';
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

    await writeFile(
      join(sessionDir, 'session.json'),
      JSON.stringify(session, null, 2),
      'utf-8',
    );

    return id;
  }

  async function loadArticlesFromSession(
    sessionId: string,
    providers: string[],
  ): Promise<Article[]> {
    const { readFile } = await import('node:fs/promises');
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

      const articles1 = await loadArticlesFromSession('with-dups', ['pubmed', 'eric', 'arxiv', 'scopus']);
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
});
