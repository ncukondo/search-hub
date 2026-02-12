/**
 * E2E Tests for `search-hub check` command
 *
 * Tests the check command with real session data:
 * - File-based identifier input
 * - Direct DOI/PMID arguments
 * - Human-readable output
 * - JSON output
 * - --missing-only filter
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import {
  setupE2EContext,
  type E2EContext,
} from '../e2e-helpers.js';
import {
  parseIdentifierFile,
  checkCoverage,
  formatCheckResult,
  formatCheckResultJson,
} from './check.js';
import { loadSessionArticles } from './session-utils.js';
import { loadSession } from '../../session/manager.js';
import type { Article } from '../../providers/base/types.js';

describe('search-hub check E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const sessionArticles: Article[] = [
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
      title: 'Same Article From Scopus',
      authors: [{ family: 'Smith', given: 'John' }],
      scopusId: 'SCOPUS-001',
      doi: '10.1000/med.2024.001',
      source: 'scopus',
      publicationDate: '2024-03-15',
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

  async function createTestSession(id: string): Promise<string> {
    const sessionDir = join(ctx.sessionsDir, id);
    await mkdir(sessionDir, { recursive: true });

    const articlesByProvider: Record<string, Article[]> = {};
    for (const article of sessionArticles) {
      const provider = article.source;
      if (!articlesByProvider[provider]) {
        articlesByProvider[provider] = [];
      }
      articlesByProvider[provider]!.push(article);
    }

    const databases: Record<string, object> = {};
    for (const [provider, articles] of Object.entries(articlesByProvider)) {
      databases[provider] = {
        status: 'completed',
        totalHits: articles.length,
        retrievedCount: articles.length,
        files: {
          query: `${provider}_query.txt`,
          results: `${provider}_results.jsonl`,
        },
      };

      const jsonl = articles.map((a) => JSON.stringify(a)).join('\n');
      await writeFile(join(sessionDir, `${provider}_results.jsonl`), jsonl, 'utf-8');
      await writeFile(join(sessionDir, `${provider}_query.txt`), `${provider} query`, 'utf-8');
    }

    const session = {
      id,
      name: `check-e2e-${id}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query: { file: 'test.yaml', hash: 'abc', content: 'name: test\nquery: []' },
      databases,
      summary: {
        status: 'completed',
        totalHits: sessionArticles.length,
        totalRetrieved: sessionArticles.length,
      },
    };

    await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');
    return id;
  }

  describe('check with file input', () => {
    it('should report correct coverage with mix of found and missing', async () => {
      const sessionId = await createTestSession('check-test-01');

      const fileContent = [
        '# Known articles from prior review',
        '10.1000/med.2024.001',       // found (Article 1)
        '10.1000/med.2024.002',       // found (Article 2)
        '10.9999/not-in-results',     // missing
        'PMID:33333333',              // found (Article 3)
        '99999999',                   // missing PMID
      ].join('\n');

      const identifiers = parseIdentifierFile(fileContent);
      expect(identifiers).toHaveLength(5);

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);

      expect(result.total).toBe(5);
      expect(result.foundCount).toBe(3);
      expect(result.missingCount).toBe(2);
      expect(result.coverage).toBeCloseTo(0.6);
    });

    it('should report found articles with correct source databases', async () => {
      const sessionId = await createTestSession('check-test-02');

      // This DOI exists in both pubmed and scopus
      const fileContent = '10.1000/med.2024.001';
      const identifiers = parseIdentifierFile(fileContent);

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);

      expect(result.found).toHaveLength(1);
      expect(result.found[0]!.sources).toContain('pubmed');
      expect(result.found[0]!.sources).toContain('scopus');
    });

    it('should produce correct text output', async () => {
      const sessionId = await createTestSession('check-test-03');

      const fileContent = '10.1000/med.2024.001\n10.9999/missing\nPMID:22222222';
      const identifiers = parseIdentifierFile(fileContent);

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);
      const output = formatCheckResult(result, { sessionId, source: 'refs.txt' });

      expect(output).toContain('Coverage: check-test-03');
      expect(output).toContain('Source: refs.txt (3 identifiers)');
      expect(output).toContain('Found: 2/3 (66.7%)');
      expect(output).toContain('Missing (1):');
      expect(output).toContain('10.9999/missing');
      expect(output).toContain('Found (2):');
    });

    it('should produce valid JSON output', async () => {
      const sessionId = await createTestSession('check-test-04');

      const fileContent = '10.1000/med.2024.001\n10.9999/missing';
      const identifiers = parseIdentifierFile(fileContent);

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);
      const json = formatCheckResultJson(result, { sessionId, source: 'known.txt' });

      const parsed = JSON.parse(json);
      expect(parsed.session).toBe('check-test-04');
      expect(parsed.source).toBe('known.txt');
      expect(parsed.total).toBe(2);
      expect(parsed.found).toBe(1);
      expect(parsed.missing).toBe(1);
      expect(parsed.coverage).toBe(0.5);
      expect(parsed.details.found).toHaveLength(1);
      expect(parsed.details.missing).toHaveLength(1);
      expect(parsed.details.found[0].title).toBe('AI in Medical Education 2024');
    });

    it('should show only missing with --missing-only', async () => {
      const sessionId = await createTestSession('check-test-05');

      const fileContent = '10.1000/med.2024.001\n10.9999/missing';
      const identifiers = parseIdentifierFile(fileContent);

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);
      const output = formatCheckResult(result, { sessionId, source: 'refs.txt', missingOnly: true });

      expect(output).toContain('Missing (1):');
      expect(output).toContain('10.9999/missing');
      expect(output).not.toContain('Found (1):');
    });
  });

  describe('check with direct identifiers', () => {
    it('should find a known DOI', async () => {
      const sessionId = await createTestSession('check-test-06');

      const identifiers = parseIdentifierFile('10.1000/med.2024.001');

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);

      expect(result.foundCount).toBe(1);
      expect(result.missingCount).toBe(0);
      expect(result.coverage).toBe(1);
    });

    it('should report unknown DOI as missing', async () => {
      const sessionId = await createTestSession('check-test-07');

      const identifiers = parseIdentifierFile('10.9999/unknown');

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);

      expect(result.foundCount).toBe(0);
      expect(result.missingCount).toBe(1);
      expect(result.coverage).toBe(0);
    });

    it('should find by arXiv ID', async () => {
      const sessionId = await createTestSession('check-test-08');

      const identifiers = parseIdentifierFile('arxiv:2405.12345');

      const session = await loadSession(sessionId, ctx.sessionsDir);
      const articles = await loadSessionArticles(session, sessionId, ctx.sessionsDir);
      const result = checkCoverage(articles, identifiers);

      expect(result.foundCount).toBe(1);
      expect(result.found[0]!.title).toBe('arXiv Deep Learning Paper');
    });
  });
});
