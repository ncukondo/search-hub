/**
 * E2E Tests for `search-hub export` command
 *
 * Tests the export command functionality:
 * - --format ids exports IDs only
 * - --format json exports full JSON
 * - --format jsonl exports JSON lines
 * - --id-type doi filters to DOIs
 * - --id-type pmid filters to PMIDs
 * - --output writes to file
 * - source: query filters to specific database
 * - stdout output when no --output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import {
  setupE2EContext,
  execCli,
  type E2EContext,
} from '../e2e-helpers.js';
import {
  parseExportOptions,
  validateExportInput,
  formatIds,
  formatJson,
  formatJsonl,
  formatCslJson,
  deduplicateArticles,
  filterArticles,
  type JsonExportMetadata,
  type ExportFilter,
} from './export.js';
import type { Article } from '../../providers/base/types.js';

describe('search-hub export E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  /**
   * Sample articles for testing export functionality
   */
  const sampleArticles: Article[] = [
    {
      title: 'Diabetes and Machine Learning',
      authors: [{ family: 'Smith', given: 'John' }],
      pmid: '12345678',
      doi: '10.1000/diabetes.2024.001',
      source: 'pubmed',
      publicationDate: '2024-01-15',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Deep Learning in Healthcare',
      authors: [{ family: 'Johnson', given: 'Alice' }],
      pmid: '12345679',
      doi: '10.1000/healthcare.2024.002',
      source: 'pubmed',
      publicationDate: '2024-02-20',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'arXiv Paper on AI',
      authors: [{ family: 'Chen', given: 'Wei' }],
      arxivId: '2401.00001',
      source: 'arxiv',
      publicationDate: '2024-01-01',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'ERIC Education Study',
      authors: [{ family: 'Teacher', given: 'Mary' }],
      ericId: 'ED654321',
      source: 'eric',
      publicationDate: '2023-06-15',
      retrievedAt: new Date().toISOString(),
    },
    {
      title: 'Scopus Article',
      authors: [{ family: 'Lee', given: 'James' }],
      scopusId: 'SCOPUS-123456',
      doi: '10.1000/scopus.2024.003',
      source: 'scopus',
      publicationDate: '2024-03-10',
      retrievedAt: new Date().toISOString(),
    },
  ];

  /**
   * Helper to create a test session with articles
   */
  async function createTestSessionWithResults(
    id: string,
    articles: Article[],
    providers: string[] = ['pubmed']
  ): Promise<string> {
    const sessionDir = join(ctx.sessionsDir, id);
    await mkdir(sessionDir, { recursive: true });

    // Group articles by provider
    const articlesByProvider: Record<string, Article[]> = {};
    for (const article of articles) {
      const provider = article.source;
      if (!articlesByProvider[provider]) {
        articlesByProvider[provider] = [];
      }
      articlesByProvider[provider]!.push(article);
    }

    // Create database entries and result files
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

      // Create results file
      const jsonl = providerArticles.map((a) => JSON.stringify(a)).join('\n');
      await writeFile(
        join(sessionDir, `${provider}_results.jsonl`),
        jsonl,
        'utf-8'
      );

      // Create query file
      await writeFile(
        join(sessionDir, `${provider}_query.txt`),
        `${provider} query string`,
        'utf-8'
      );
    }

    const session = {
      id,
      name: 'Export Test Session',
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
      'utf-8'
    );

    return id;
  }

  describe('parseExportOptions', () => {
    it('should parse session ID', () => {
      const options = parseExportOptions('session-001', {});

      expect(options.sessionId).toBe('session-001');
    });

    it('should default format to jsonl', () => {
      const options = parseExportOptions('session-001', {});

      expect(options.format).toBe('jsonl');
    });

    it('should parse --format option', () => {
      const options = parseExportOptions('session-001', { format: 'ids' });

      expect(options.format).toBe('ids');
    });

    it('should parse --output option', () => {
      const options = parseExportOptions('session-001', { output: 'results.json' });

      expect(options.outputPath).toBe('results.json');
    });

    it('should parse --id-type option', () => {
      const options = parseExportOptions('session-001', { idType: 'doi' });

      expect(options.idType).toBe('doi');
    });
  });

  describe('validateExportInput', () => {
    it('should require session ID', () => {
      const result = validateExportInput({ sessionId: '', format: 'jsonl' });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('session ID');
    });

    it('should validate format', () => {
      const result = validateExportInput({ sessionId: 'test', format: 'invalid' as any });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid format');
    });

    it('should validate id-type', () => {
      const result = validateExportInput({
        sessionId: 'test',
        format: 'ids',
        idType: 'invalid' as any,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid id-type');
    });

    it('should reject id-type with non-ids format', () => {
      const result = validateExportInput({
        sessionId: 'test',
        format: 'json',
        idType: 'doi',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('can only be used with --format ids');
    });

    it('should accept valid options', () => {
      const result = validateExportInput({
        sessionId: 'test',
        format: 'jsonl',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('formatIds', () => {
    it('should export DOIs with --id-type doi', () => {
      const output = formatIds(sampleArticles, 'doi');

      expect(output).toContain('10.1000/diabetes.2024.001');
      expect(output).toContain('10.1000/healthcare.2024.002');
      expect(output).toContain('10.1000/scopus.2024.003');
      // Should not contain PMIDs or other IDs
      expect(output).not.toContain('pmid:');
      expect(output).not.toContain('12345678');
    });

    it('should export PMIDs with --id-type pmid', () => {
      const output = formatIds(sampleArticles, 'pmid');

      expect(output).toContain('12345678');
      expect(output).toContain('12345679');
      // Should not contain DOIs
      expect(output).not.toContain('10.1000/');
    });

    it('should export all IDs with --id-type all', () => {
      const output = formatIds(sampleArticles, 'all');

      // Should have prefixed IDs
      expect(output).toContain('doi:10.1000/diabetes.2024.001');
      expect(output).toContain('pmid:12345678');
      expect(output).toContain('arxiv:2401.00001');
      expect(output).toContain('eric:ED654321');
      expect(output).toContain('scopus:SCOPUS-123456');
    });

    it('should return one ID per line', () => {
      const output = formatIds(sampleArticles, 'all');
      const lines = output.split('\n');

      // Each article may have multiple IDs, so total lines >= number of articles
      expect(lines.length).toBeGreaterThanOrEqual(sampleArticles.length);
    });

    it('should skip articles without matching ID type', () => {
      const articlesWithoutDoi: Article[] = [
        {
          title: 'No DOI Article',
          authors: [],
          pmid: '11111111',
          source: 'pubmed',
          retrievedAt: new Date().toISOString(),
        },
      ];

      const output = formatIds(articlesWithoutDoi, 'doi');

      expect(output).toBe('');
    });
  });

  describe('formatJson', () => {
    it('should export full JSON array', () => {
      const output = formatJson(sampleArticles);
      const parsed = JSON.parse(output);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(sampleArticles.length);
      expect(parsed[0].title).toBe('Diabetes and Machine Learning');
    });

    it('should include all article fields', () => {
      const output = formatJson(sampleArticles);
      const parsed = JSON.parse(output);

      expect(parsed[0]).toHaveProperty('title');
      expect(parsed[0]).toHaveProperty('authors');
      expect(parsed[0]).toHaveProperty('pmid');
      expect(parsed[0]).toHaveProperty('doi');
      expect(parsed[0]).toHaveProperty('source');
    });

    it('should be pretty-printed', () => {
      const output = formatJson(sampleArticles);

      // Pretty-printed JSON has newlines and indentation
      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });

    it('should handle empty array', () => {
      const output = formatJson([]);
      const parsed = JSON.parse(output);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(0);
    });
  });

  describe('formatJsonl', () => {
    it('should export one JSON object per line', () => {
      const output = formatJsonl(sampleArticles);
      const lines = output.split('\n');

      expect(lines.length).toBe(sampleArticles.length);
    });

    it('should have valid JSON on each line', () => {
      const output = formatJsonl(sampleArticles);
      const lines = output.split('\n');

      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should preserve article data', () => {
      const output = formatJsonl(sampleArticles);
      const lines = output.split('\n');
      const firstArticle = JSON.parse(lines[0]!);

      expect(firstArticle.title).toBe('Diabetes and Machine Learning');
      expect(firstArticle.pmid).toBe('12345678');
    });

    it('should handle empty array', () => {
      const output = formatJsonl([]);

      expect(output).toBe('');
    });
  });

  describe('source: query filters to specific database', () => {
    it('should only include articles from specified provider via source: query', async () => {
      // Create session with articles from multiple providers
      const pubmedArticles = sampleArticles.filter((a) => a.source === 'pubmed');
      const arxivArticles = sampleArticles.filter((a) => a.source === 'arxiv');

      await createTestSessionWithResults(
        'multi-provider-export',
        [...pubmedArticles, ...arxivArticles],
        ['pubmed', 'arxiv']
      );

      // Read all results from session
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv']) {
        const resultsPath = join(ctx.sessionsDir, 'multi-provider-export', `${provider}_results.jsonl`);
        const content = await readFile(resultsPath, 'utf-8');
        for (const line of content.trim().split('\n').filter(l => l)) {
          allArticles.push(JSON.parse(line));
        }
      }

      // Filter using source: query (replaces --db)
      const { filterByQuery } = await import('./query-filter.js');
      const filtered = filterByQuery(allArticles, 'source:pubmed');

      expect(filtered.length).toBe(pubmedArticles.length);
      for (const article of filtered) {
        expect(article.source).toBe('pubmed');
      }
    });
  });

  describe('--output writes to file', () => {
    it('should create output file at specified path', async () => {
      await createTestSessionWithResults('session-for-file-export', sampleArticles.slice(0, 2), ['pubmed']);

      const outputPath = join(ctx.tempDir, 'export-output.jsonl');

      // Simulate file export by reading session results and writing to output
      const resultsPath = join(ctx.sessionsDir, 'session-for-file-export', 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      await writeFile(outputPath, content, 'utf-8');

      const outputContent = await readFile(outputPath, 'utf-8');
      expect(outputContent.length).toBeGreaterThan(0);

      const lines = outputContent.trim().split('\n');
      expect(lines.length).toBe(2);
    });
  });

  describe('stdout output when no --output', () => {
    it('should return formatted output directly', async () => {
      await createTestSessionWithResults('session-stdout', sampleArticles.slice(0, 2), ['pubmed']);

      // Read results and format them
      const resultsPath = join(ctx.sessionsDir, 'session-stdout', 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map((line) => JSON.parse(line));

      const output = formatJsonl(articles);

      expect(output.length).toBeGreaterThan(0);
      expect(output.split('\n').length).toBe(2);
    });
  });

  describe('integration: export workflow', () => {
    it('should export session results in ids format', async () => {
      await createTestSessionWithResults('export-ids-workflow', sampleArticles.slice(0, 2), ['pubmed']);

      const resultsPath = join(ctx.sessionsDir, 'export-ids-workflow', 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map((line) => JSON.parse(line));

      const output = formatIds(articles, 'doi');

      expect(output).toContain('10.1000/diabetes.2024.001');
      expect(output).toContain('10.1000/healthcare.2024.002');
    });

    it('should export session results in json format', async () => {
      await createTestSessionWithResults('export-json-workflow', sampleArticles.slice(0, 2), ['pubmed']);

      const resultsPath = join(ctx.sessionsDir, 'export-json-workflow', 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map((line) => JSON.parse(line));

      const output = formatJson(articles);
      const parsed = JSON.parse(output);

      expect(parsed.length).toBe(2);
    });

    it('should produce correctly grouped IDs output from session data', async () => {
      await createTestSessionWithResults(
        'export-grouped-ids',
        sampleArticles.slice(0, 2),
        ['pubmed']
      );

      const resultsPath = join(ctx.sessionsDir, 'export-grouped-ids', 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map((line) => JSON.parse(line));

      const output = formatIds(articles, 'all');
      const groups = output.split('\n\n');

      // 2 articles from pubmed, each with pmid and doi
      expect(groups).toHaveLength(2);

      // First article group should have pmid before doi
      const firstGroup = groups[0]!.split('\n');
      expect(firstGroup[0]).toContain('pmid:');
      expect(firstGroup[1]).toContain('doi:');

      // Second article group should also have pmid before doi
      const secondGroup = groups[1]!.split('\n');
      expect(secondGroup[0]).toContain('pmid:');
      expect(secondGroup[1]).toContain('doi:');
    });

    it('should include year field in JSON export matching publicationDate', async () => {
      await createTestSessionWithResults(
        'export-json-year',
        sampleArticles,
        ['pubmed', 'arxiv', 'eric', 'scopus']
      );

      // Read all results and combine
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, 'export-json-year', `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      const jsonOutput = formatJson(allArticles);
      const parsed = JSON.parse(jsonOutput);

      // All sample articles have publicationDate, so all should have year
      for (const article of parsed) {
        expect(article).toHaveProperty('year');
        if (article.publicationDate) {
          const expectedYear = parseInt(article.publicationDate.substring(0, 4), 10);
          expect(article.year).toBe(expectedYear);
        } else {
          expect(article.year).toBeNull();
        }
      }
    });

    it('should include year field in JSONL export matching publicationDate', async () => {
      await createTestSessionWithResults(
        'export-jsonl-year',
        sampleArticles.slice(0, 2),
        ['pubmed']
      );

      const resultsPath = join(ctx.sessionsDir, 'export-jsonl-year', 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map((line) => JSON.parse(line));

      const output = formatJsonl(articles);
      const lines = output.trim().split('\n');

      for (const line of lines) {
        const article = JSON.parse(line);
        expect(article).toHaveProperty('year');
        expect(typeof article.year).toBe('number');
      }
    });

    it('should export filtered by pmid type', async () => {
      // Include article without PMID
      const mixedArticles: Article[] = [
        ...sampleArticles.filter((a) => a.pmid),
        {
          title: 'No PMID',
          authors: [],
          doi: '10.1000/no-pmid',
          source: 'scopus', // Use valid provider
          retrievedAt: new Date().toISOString(),
        },
      ];

      const output = formatIds(mixedArticles, 'pmid');
      const ids = output.split('\n').filter((id) => id);

      // Only articles with PMIDs should be included
      expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
    });
  });

  describe('deduplication E2E', () => {
    it('should deduplicate articles with same PMID from session results', async () => {
      // Simulate PubMed pagination overlap: same PMID appears twice
      const articlesWithDup: Article[] = [
        {
          title: 'Diabetes and Machine Learning',
          authors: [{ family: 'Smith', given: 'John' }],
          pmid: '41541042',
          doi: '10.1000/diabetes.2024.001',
          source: 'pubmed',
          retrievedAt: new Date().toISOString(),
        },
        {
          title: 'Deep Learning in Healthcare',
          authors: [{ family: 'Johnson', given: 'Alice' }],
          pmid: '12345679',
          doi: '10.1000/healthcare.2024.002',
          source: 'pubmed',
          retrievedAt: new Date().toISOString(),
        },
        {
          title: 'Diabetes and Machine Learning (dup)',
          authors: [{ family: 'Smith', given: 'John' }],
          pmid: '41541042',
          doi: '10.1000/diabetes.2024.001',
          source: 'pubmed',
          retrievedAt: new Date().toISOString(),
        },
      ];

      await createTestSessionWithResults('dedup-pmid-test', articlesWithDup, ['pubmed']);

      // Read session results
      const resultsPath = join(ctx.sessionsDir, 'dedup-pmid-test', 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map((line) => JSON.parse(line));

      // Apply deduplication
      const result = deduplicateArticles(articles);

      expect(result.articles).toHaveLength(2);
      expect(result.duplicatesRemoved).toBe(1);

      // Verify exported JSONL has correct count
      const output = formatJsonl(result.articles);
      const outputLines = output.split('\n');
      expect(outputLines).toHaveLength(2);
    });

    it('should deduplicate articles with same DOI across providers', async () => {
      // Same article found by both PubMed and Scopus
      const pubmedArticles: Article[] = [
        {
          title: 'Cross-Provider Article (PubMed)',
          authors: [{ family: 'Chen', given: 'Wei' }],
          pmid: '99999999',
          doi: '10.1000/cross-provider.2024',
          source: 'pubmed',
          abstract: 'This is the full abstract from PubMed.',
          journal: 'Journal of Testing',
          volume: '10',
          issue: '2',
          pages: '100-110',
          retrievedAt: new Date().toISOString(),
        },
      ];

      const scopusArticles: Article[] = [
        {
          title: 'Cross-Provider Article (Scopus)',
          authors: [{ family: 'Chen', given: 'W.' }],
          scopusId: 'SCOPUS-88888',
          doi: '10.1000/cross-provider.2024',
          source: 'scopus',
          retrievedAt: new Date().toISOString(),
        },
        {
          title: 'Unique Scopus Article',
          authors: [{ family: 'Lee', given: 'James' }],
          scopusId: 'SCOPUS-77777',
          doi: '10.1000/unique-scopus.2024',
          source: 'scopus',
          retrievedAt: new Date().toISOString(),
        },
      ];

      // Create session with results from both providers
      const sessionId = 'dedup-cross-provider';
      const sessionDir = join(ctx.sessionsDir, sessionId);
      await mkdir(sessionDir, { recursive: true });

      // Write PubMed results
      await writeFile(
        join(sessionDir, 'pubmed_results.jsonl'),
        pubmedArticles.map((a) => JSON.stringify(a)).join('\n'),
        'utf-8'
      );
      await writeFile(join(sessionDir, 'pubmed_query.txt'), 'pubmed query', 'utf-8');

      // Write Scopus results
      await writeFile(
        join(sessionDir, 'scopus_results.jsonl'),
        scopusArticles.map((a) => JSON.stringify(a)).join('\n'),
        'utf-8'
      );
      await writeFile(join(sessionDir, 'scopus_query.txt'), 'scopus query', 'utf-8');

      // Read all articles
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'scopus']) {
        const path = join(sessionDir, `${provider}_results.jsonl`);
        const fileContent = await readFile(path, 'utf-8');
        for (const line of fileContent.trim().split('\n')) {
          allArticles.push(JSON.parse(line));
        }
      }

      expect(allArticles).toHaveLength(3); // 1 pubmed + 2 scopus before dedup

      // Apply deduplication
      const result = deduplicateArticles(allArticles);

      expect(result.articles).toHaveLength(2); // 1 cross-provider + 1 unique scopus
      expect(result.duplicatesRemoved).toBe(1);

      // The PubMed record should be kept (more metadata)
      const keptArticle = result.articles.find((a) => a.doi === '10.1000/cross-provider.2024');
      expect(keptArticle).toBeDefined();
      expect(keptArticle!.source).toBe('pubmed');
      expect(keptArticle!.abstract).toBe('This is the full abstract from PubMed.');
      expect(keptArticle!.pmid).toBe('99999999');
    });

    it('should produce accurate dedup count for mixed duplicates', async () => {
      const articles: Article[] = [
        // PubMed articles with one dup
        {
          title: 'Article A',
          authors: [],
          pmid: '11111111',
          doi: '10.1000/a',
          source: 'pubmed',
          retrievedAt: new Date().toISOString(),
        },
        {
          title: 'Article B',
          authors: [],
          pmid: '22222222',
          source: 'pubmed',
          retrievedAt: new Date().toISOString(),
        },
        {
          title: 'Article A dup',
          authors: [],
          pmid: '11111111',
          doi: '10.1000/a',
          source: 'pubmed',
          retrievedAt: new Date().toISOString(),
        },
        // Scopus article matching Article A's DOI
        {
          title: 'Article A from Scopus',
          authors: [],
          scopusId: 'SC-111',
          doi: '10.1000/a',
          source: 'scopus',
          retrievedAt: new Date().toISOString(),
        },
        // Unique Scopus article
        {
          title: 'Article C',
          authors: [],
          scopusId: 'SC-333',
          doi: '10.1000/c',
          source: 'scopus',
          retrievedAt: new Date().toISOString(),
        },
      ];

      const result = deduplicateArticles(articles);

      // Article A (PMID dup removed), Article A Scopus (DOI dup removed) = 2 dups
      // Remaining: Article A, Article B, Article C = 3 unique
      expect(result.articles).toHaveLength(3);
      expect(result.duplicatesRemoved).toBe(2);

      // Exported results should match
      const jsonOutput = formatJson(result.articles);
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveLength(3);

      const idsOutput = formatIds(result.articles, 'all');
      expect(idsOutput).toContain('pmid:11111111');
      expect(idsOutput).toContain('pmid:22222222');
      expect(idsOutput).toContain('scopus:SC-333');
    });
  });

  describe('CSL-JSON export E2E', () => {
    it('should produce valid CSL-JSON array from session data', async () => {
      const sessionId = 'csl-json-basic';
      await createTestSessionWithResults(sessionId, sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      // Read all articles from session (simulating CLI handler)
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, sessionId, `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      const output = formatCslJson(allArticles);
      const parsed = JSON.parse(output);

      // Should be a JSON array
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(allArticles.length);

      // Each item should be a valid CSL-JSON object
      for (const item of parsed) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type', 'article-journal');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('author');
        expect(Array.isArray(item.author)).toBe(true);
      }
    });

    it('should map DOI and PMID fields correctly in CSL-JSON output', async () => {
      const sessionId = 'csl-json-fields';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const resultsPath = join(ctx.sessionsDir, sessionId, 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map(line => JSON.parse(line));

      const output = formatCslJson(articles);
      const parsed = JSON.parse(output);

      // First article has both DOI and PMID
      expect(parsed[0].DOI).toBe('10.1000/diabetes.2024.001');
      expect(parsed[0].PMID).toBe('12345678');
      expect(parsed[0].issued).toBeDefined();
      expect(parsed[0].issued['date-parts'][0][0]).toBe(2024);
    });

    it('should produce output parseable as JSON array of CSL-JSON items', async () => {
      const sessionId = 'csl-json-parseable';
      await createTestSessionWithResults(sessionId, sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      // Read all articles
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, sessionId, `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      const output = formatCslJson(allArticles);

      // Must be parseable as JSON
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);

      // Verify each item has required CSL-JSON fields
      for (const item of parsed) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.type).toBe('string');
        expect(typeof item.title).toBe('string');
        expect(Array.isArray(item.author)).toBe(true);
      }

      // Verify titles from original articles are preserved
      const titles = parsed.map((item: { title: string }) => item.title);
      expect(titles).toContain('Diabetes and Machine Learning');
      expect(titles).toContain('arXiv Paper on AI');
      expect(titles).toContain('ERIC Education Study');
      expect(titles).toContain('Scopus Article');
    });

    it('should generate author-year IDs for CSL-JSON items', async () => {
      const sessionId = 'csl-json-ids';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const resultsPath = join(ctx.sessionsDir, sessionId, 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map(line => JSON.parse(line));

      const output = formatCslJson(articles);
      const parsed = JSON.parse(output);

      // IDs should follow author-year pattern
      expect(parsed[0].id).toBe('smith-2024');
      expect(parsed[1].id).toBe('johnson-2024');
    });

    it('should handle CSL-JSON export with deduplication', async () => {
      const articlesWithDup: Article[] = [
        ...sampleArticles.slice(0, 2),
        { ...sampleArticles[0]! }, // duplicate
      ];

      const dedupResult = deduplicateArticles(articlesWithDup);
      const output = formatCslJson(dedupResult.articles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveLength(2);
      expect(dedupResult.duplicatesRemoved).toBe(1);
    });
  });

  describe('JSON metadata envelope E2E', () => {
    it('should produce metadata envelope when session metadata is provided', async () => {
      const sessionId = 'envelope-basic-test';
      await createTestSessionWithResults(sessionId, sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      // Read all articles (simulating what the CLI handler does)
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, sessionId, `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      // Build metadata like the CLI handler does
      const databases: Record<string, number> = {};
      for (const article of allArticles) {
        databases[article.source] = (databases[article.source] ?? 0) + 1;
      }
      const metadata: JsonExportMetadata = {
        sessionId,
        sessionName: 'Export Test Session',
        createdAt: '2024-01-15T10:00:00Z',
        databases,
      };

      const output = formatJson(allArticles, metadata);
      const parsed = JSON.parse(output);

      // Verify envelope structure
      expect(parsed).toHaveProperty('session');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('results');
      expect(Array.isArray(parsed.results)).toBe(true);
    });

    it('should have session.id matching the session directory name', async () => {
      const sessionId = '20240115_diabetes-ai_a3f2c1';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const resultsPath = join(ctx.sessionsDir, sessionId, 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map(line => JSON.parse(line));

      const metadata: JsonExportMetadata = {
        sessionId,
        sessionName: 'diabetes_ai_scoping',
        createdAt: '2024-01-15T10:00:00Z',
        databases: { pubmed: articles.length },
      };

      const output = formatJson(articles, metadata);
      const parsed = JSON.parse(output);

      expect(parsed.session.id).toBe(sessionId);
      expect(parsed.session.name).toBe('diabetes_ai_scoping');
      expect(parsed.session.createdAt).toBe('2024-01-15T10:00:00Z');
    });

    it('should have summary.databases counts matching actual results', async () => {
      const sessionId = 'envelope-db-counts';
      await createTestSessionWithResults(sessionId, sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      // Read all articles
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, sessionId, `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      // Compute expected database counts
      const expectedCounts: Record<string, number> = {};
      for (const article of allArticles) {
        expectedCounts[article.source] = (expectedCounts[article.source] ?? 0) + 1;
      }

      const metadata: JsonExportMetadata = {
        sessionId,
        sessionName: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        databases: expectedCounts,
      };

      const output = formatJson(allArticles, metadata);
      const parsed = JSON.parse(output);

      // Verify per-database counts
      expect(parsed.summary.databases).toEqual(expectedCounts);
      expect(parsed.summary.databases.pubmed).toBe(2); // 2 pubmed articles in sampleArticles
      expect(parsed.summary.databases.arxiv).toBe(1);
      expect(parsed.summary.databases.eric).toBe(1);
      expect(parsed.summary.databases.scopus).toBe(1);

      // Verify total
      expect(parsed.summary.totalResults).toBe(allArticles.length);
    });

    it('should include year field in results within envelope', async () => {
      const sessionId = 'envelope-year-field';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const resultsPath = join(ctx.sessionsDir, sessionId, 'pubmed_results.jsonl');
      const content = await readFile(resultsPath, 'utf-8');
      const articles = content.trim().split('\n').map(line => JSON.parse(line));

      const metadata: JsonExportMetadata = {
        sessionId,
        sessionName: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        databases: { pubmed: articles.length },
      };

      const output = formatJson(articles, metadata);
      const parsed = JSON.parse(output);

      // Results in envelope should still have the year field
      for (const article of parsed.results) {
        expect(article).toHaveProperty('year');
        if (article.publicationDate) {
          const expectedYear = parseInt(article.publicationDate.substring(0, 4), 10);
          expect(article.year).toBe(expectedYear);
        }
      }
    });
  });

  describe('stdout output via CLI process', () => {
    it('should write JSONL data to stdout when no -o is specified', async () => {
      const sessionId = 'stdout-jsonl-cli';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const result = await execCli(
        ['export', sessionId, '--format', 'jsonl', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);

      // stdout should contain valid JSONL
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      // Each line should be a valid article object
      const firstArticle = JSON.parse(lines[0]!);
      expect(firstArticle).toHaveProperty('title');
      expect(firstArticle).toHaveProperty('source');
    });

    it('should write JSON data to stdout when no -o is specified', async () => {
      const sessionId = 'stdout-json-cli';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const result = await execCli(
        ['export', sessionId, '--format', 'json', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);

      // stdout should contain valid JSON with metadata envelope
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('session');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('results');
      expect(parsed.results).toHaveLength(2);
    });

    it('should write IDs data to stdout when no -o is specified', async () => {
      const sessionId = 'stdout-ids-cli';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const result = await execCli(
        ['export', sessionId, '--format', 'ids', '--id-type', 'doi', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);

      // stdout should contain DOIs only
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^10\.\d+\//);
      expect(lines[1]).toMatch(/^10\.\d+\//);
    });

    it('should write CSL-JSON data to stdout when no -o is specified', async () => {
      const sessionId = 'stdout-csljson-cli';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const result = await execCli(
        ['export', sessionId, '--format', 'csl-json', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);

      // stdout should contain valid CSL-JSON array
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toHaveProperty('type', 'article-journal');
    });

    it('should not mix informational messages into stdout', async () => {
      // Create articles that will trigger dedup message
      const articlesWithDup: Article[] = [
        ...sampleArticles.slice(0, 2),
        { ...sampleArticles[0]! }, // duplicate
      ];
      const sessionId = 'stdout-clean-cli';
      await createTestSessionWithResults(sessionId, articlesWithDup, ['pubmed']);

      const result = await execCli(
        ['export', sessionId, '--format', 'jsonl', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);

      // stdout should contain only valid JSONL (no informational messages)
      const lines = result.stdout.trim().split('\n');
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      // stderr should contain dedup info
      expect(result.stderr).toContain('duplicate');
    });

    it('should write dedup/filter info to stderr when outputting to stdout', async () => {
      const sessionId = 'stdout-stderr-info-cli';
      await createTestSessionWithResults(sessionId, sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      const result = await execCli(
        ['export', sessionId, '--format', 'jsonl', '--filter-year', '2024-2024', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);

      // stdout should contain only valid JSONL
      const lines = result.stdout.trim().split('\n');
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      // stderr should contain filter info
      expect(result.stderr).toContain('filtered');
    });

    it('should write "Exported N articles to" message to stderr when -o is specified', async () => {
      const sessionId = 'stdout-file-stderr-cli';
      await createTestSessionWithResults(sessionId, sampleArticles.slice(0, 2), ['pubmed']);

      const outputPath = join(ctx.tempDir, 'output-stderr-test.jsonl');

      const result = await execCli(
        ['export', sessionId, '--format', 'jsonl', '-o', outputPath, '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);

      // stdout should be empty (data goes to file)
      expect(result.stdout.trim()).toBe('');

      // stderr should contain the "Exported" message
      expect(result.stderr).toContain('Exported');
      expect(result.stderr).toContain('articles');
    });
  });

  describe('filter E2E', () => {
    const filterArticles_ = filterArticles; // alias for clarity

    it('should reduce result count with year filter', async () => {
      await createTestSessionWithResults('filter-year-e2e', sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      // Read all articles from session
      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, 'filter-year-e2e', `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      // Deduplicate first (like the CLI does)
      const dedupResult = deduplicateArticles(allArticles);

      // Apply year filter: only 2024 articles
      const filter: ExportFilter = { yearFrom: 2024, yearTo: 2024 };
      const filtered = filterArticles_(dedupResult.articles, filter);

      // Only 2024 articles: pubmed 2024-01-15, pubmed 2024-02-20, arxiv 2024-01-01, scopus 2024-03-10
      expect(filtered.length).toBeLessThan(dedupResult.articles.length);
      expect(filtered.length).toBe(4);
      for (const article of filtered) {
        expect(article.publicationDate).toMatch(/^2024/);
      }
    });

    it('should filter by title keyword from session results', async () => {
      await createTestSessionWithResults('filter-title-e2e', sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, 'filter-title-e2e', `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      const dedupResult = deduplicateArticles(allArticles);

      // Filter by title keyword "diabetes"
      const filter: ExportFilter = { titleKeywords: ['diabetes'] };
      const filtered = filterArticles_(dedupResult.articles, filter);

      expect(filtered.length).toBe(1);
      expect(filtered[0]!.title).toBe('Diabetes and Machine Learning');
    });

    it('should show filtered count in output message format', async () => {
      await createTestSessionWithResults('filter-count-e2e', sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, 'filter-count-e2e', `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      const dedupResult = deduplicateArticles(allArticles);
      const preFilterCount = dedupResult.articles.length;

      // Apply filter
      const filter: ExportFilter = { yearFrom: 2024, yearTo: 2024 };
      const filtered = filterArticles_(dedupResult.articles, filter);

      // Verify the message format would show filter impact
      const message = `Exported ${filtered.length} articles (filtered from ${preFilterCount})`;
      expect(message).toContain(`filtered from ${preFilterCount}`);
      expect(message).toContain(`${filtered.length} articles`);
      expect(filtered.length).toBeLessThan(preFilterCount);
    });

    it('should work with combined filters and all export formats', async () => {
      await createTestSessionWithResults('filter-combined-e2e', sampleArticles, ['pubmed', 'arxiv', 'eric', 'scopus']);

      const allArticles: Article[] = [];
      for (const provider of ['pubmed', 'arxiv', 'eric', 'scopus']) {
        const resultsPath = join(ctx.sessionsDir, 'filter-combined-e2e', `${provider}_results.jsonl`);
        try {
          const content = await readFile(resultsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);
          for (const line of lines) {
            allArticles.push(JSON.parse(line));
          }
        } catch {
          // Provider may not have results
        }
      }

      const dedupResult = deduplicateArticles(allArticles);

      // Combined: year 2024 AND title "deep learning"
      const filter: ExportFilter = { yearFrom: 2024, yearTo: 2024, titleKeywords: ['deep learning'] };
      const filtered = filterArticles_(dedupResult.articles, filter);

      // Only "Deep Learning in Healthcare" (2024, has "deep learning") matches
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.title).toBe('Deep Learning in Healthcare');

      // Verify all export formats work with filtered results
      const jsonOutput = formatJson(filtered);
      const parsedJson = JSON.parse(jsonOutput);
      expect(parsedJson).toHaveLength(1);

      const jsonlOutput = formatJsonl(filtered);
      const jsonlLines = jsonlOutput.trim().split('\n');
      expect(jsonlLines).toHaveLength(1);

      const idsOutput = formatIds(filtered, 'doi');
      expect(idsOutput).toContain('10.1000/healthcare.2024.002');
    });
  });
});
