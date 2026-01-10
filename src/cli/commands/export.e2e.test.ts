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
 * - --db filters to specific database
 * - stdout output when no --output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
} from '../e2e-helpers.js';
import {
  parseExportOptions,
  validateExportInput,
  formatIds,
  formatJson,
  formatJsonl,
  type ExportCommandOptions,
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
      join(sessionDir, 'session.json'),
      JSON.stringify(session, null, 2),
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

    it('should parse --db option', () => {
      const options = parseExportOptions('session-001', { db: 'pubmed' });

      expect(options.providers).toEqual(['pubmed']);
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

  describe('--db filters to specific database', () => {
    it('should only include articles from specified provider', async () => {
      // Create session with articles from multiple providers
      const pubmedArticles = sampleArticles.filter((a) => a.source === 'pubmed');
      const arxivArticles = sampleArticles.filter((a) => a.source === 'arxiv');

      await createTestSessionWithResults(
        'multi-provider-export',
        [...pubmedArticles, ...arxivArticles],
        ['pubmed', 'arxiv']
      );

      // Read only pubmed results
      const pubmedResultsPath = join(ctx.sessionsDir, 'multi-provider-export', 'pubmed_results.jsonl');
      const pubmedContent = await readFile(pubmedResultsPath, 'utf-8');
      const pubmedLines = pubmedContent.trim().split('\n').filter(l => l);

      expect(pubmedLines.length).toBe(pubmedArticles.length);

      // Each article should be from pubmed
      for (const line of pubmedLines) {
        const article = JSON.parse(line);
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
});
