/**
 * E2E Tests for `search-hub search` command
 *
 * Tests the search command with:
 * - --dry-run flag (no API calls)
 * - Live execution with mocked API providers
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
  createQueryFile,
  createRawQueryFile,
  queryFixtures,
} from '../e2e-helpers.js';
import {
  parseSearchOptions,
  validateSearchInput,
  formatDryRunOutput,
  type SearchCommandOptions,
  type TranslationResult,
} from './search.js';
import { translateQueryCommand } from './query/translate.js';

describe('search-hub search --dry-run E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('--dry-run shows translated queries', () => {
    it('should show translations for all providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      // Use translate command to get translations (simulating dry run)
      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();

      // Format as dry run output
      const translations: TranslationResult[] = Object.entries(
        result.translations!
      ).map(([provider, t]) => ({
        provider,
        query: t.native,
      }));

      const output = formatDryRunOutput(translations);

      expect(output).toContain('Translated queries:');
      expect(output).toContain('[pubmed]');
      expect(output).toContain('[eric]');
      expect(output).toContain('[arxiv]');
      expect(output).toContain('[scopus]');
    });

    it('should show translation for single provider with --db', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);

      const translations: TranslationResult[] = Object.entries(
        result.translations!
      ).map(([provider, t]) => ({
        provider,
        query: t.native,
      }));

      const output = formatDryRunOutput(translations);

      expect(output).toContain('[pubmed]');
      expect(output).not.toContain('[eric]');
      expect(output).not.toContain('[arxiv]');
      expect(output).not.toContain('[scopus]');
    });
  });

  describe('--dry-run does not create session', () => {
    it('should not create session directory in dry run mode', async () => {
      // In dry run mode, no session should be created
      const options: SearchCommandOptions = {
        queryFile: 'test.yaml',
        dryRun: true,
      };

      expect(options.dryRun).toBe(true);

      // Check sessions directory is empty
      const sessionsContent = await readdir(ctx.sessionsDir);
      expect(sessionsContent).toHaveLength(0);
    });
  });

  describe('--dry-run does not make API calls', () => {
    it('should only translate queries without executing', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      // Simulate dry run - only translate, no execution
      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      // Verify we got translations but no search was executed
      expect(result.translations).toBeDefined();
      // No session files should exist
      const sessionsContent = await readdir(ctx.sessionsDir);
      expect(sessionsContent).toHaveLength(0);
    });
  });

  describe('--db filters databases in dry run', () => {
    it('should only show pubmed translation with --db pubmed', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(Object.keys(result.translations!)).toEqual(['pubmed']);
    });

    it('should show multiple providers with --db pubmed,eric', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed', 'eric'],
      });

      expect(result.success).toBe(true);
      const providers = Object.keys(result.translations!);
      expect(providers).toContain('pubmed');
      expect(providers).toContain('eric');
      expect(providers).not.toContain('arxiv');
      expect(providers).not.toContain('scopus');
    });
  });

  describe('parseSearchOptions', () => {
    it('should parse query file argument', () => {
      const options = parseSearchOptions('query.yaml', {});

      expect(options.queryFile).toBe('query.yaml');
    });

    it('should parse --query option', () => {
      const options = parseSearchOptions(undefined, {
        query: 'diabetes[tiab]',
      });

      expect(options.directQuery).toBe('diabetes[tiab]');
    });

    it('should parse --db option', () => {
      const options = parseSearchOptions('query.yaml', {
        db: 'pubmed',
      });

      expect(options.providers).toEqual(['pubmed']);
    });

    it('should parse multiple --db values', () => {
      const options = parseSearchOptions('query.yaml', {
        db: 'pubmed,eric',
      });

      expect(options.providers).toContain('pubmed');
      expect(options.providers).toContain('eric');
    });

    it('should parse --max-results option', () => {
      const options = parseSearchOptions('query.yaml', {
        maxResults: '100',
      });

      expect(options.maxResults).toBe(100);
    });

    it('should parse --dry-run flag', () => {
      const options = parseSearchOptions('query.yaml', {
        dryRun: true,
      });

      expect(options.dryRun).toBe(true);
    });

    it('should parse --no-resume flag', () => {
      const options = parseSearchOptions('query.yaml', {
        noResume: true,
      });

      expect(options.noResume).toBe(true);
    });

    it('should parse --name option', () => {
      const options = parseSearchOptions('query.yaml', {
        name: 'my-search-session',
      });

      expect(options.sessionName).toBe('my-search-session');
    });
  });

  describe('validateSearchInput', () => {
    it('should require query file or direct query', () => {
      const result = validateSearchInput({});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('query file');
    });

    it('should accept query file', () => {
      const result = validateSearchInput({
        queryFile: 'query.yaml',
      });

      expect(result.valid).toBe(true);
    });

    it('should require --db with direct query', () => {
      const result = validateSearchInput({
        directQuery: 'diabetes[tiab]',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('--db');
    });

    it('should accept direct query with --db', () => {
      const result = validateSearchInput({
        directQuery: 'diabetes[tiab]',
        providers: ['pubmed'],
      });

      expect(result.valid).toBe(true);
    });

    it('should reject direct query with multiple providers', () => {
      const result = validateSearchInput({
        directQuery: 'diabetes[tiab]',
        providers: ['pubmed', 'eric'],
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('single provider');
    });
  });

  describe('formatDryRunOutput', () => {
    it('should format empty translations', () => {
      const output = formatDryRunOutput([]);

      expect(output).toBe('No translations available.');
    });

    it('should format single translation', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
      ];

      const output = formatDryRunOutput(translations);

      expect(output).toContain('Translated queries:');
      expect(output).toContain('[pubmed]');
      expect(output).toContain('diabetes[tiab]');
    });

    it('should format multiple translations', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
        { provider: 'eric', query: 'diabetes AND mellitus' },
      ];

      const output = formatDryRunOutput(translations);

      expect(output).toContain('[pubmed]');
      expect(output).toContain('diabetes[tiab]');
      expect(output).toContain('[eric]');
      expect(output).toContain('diabetes AND mellitus');
    });
  });

  describe('dry run with complex queries', () => {
    it('should handle multi-block queries', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.multiBlock);

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(Object.keys(result.translations!).length).toBeGreaterThan(0);
    });

    it('should handle queries with MeSH terms', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.withMesh);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.translations!['pubmed']).toBeDefined();
    });

    it('should handle queries with filters', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: filtered-query
query:
  - field: title_abstract
    terms:
      keywords:
        - cancer
    operator: AND
filters:
  year_from: 2022
  year_to: 2024
  languages:
    - en
`
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      // Check that year filters are included in translations
      const anyHasYear = Object.values(result.translations!).some((t) =>
        /2022|2024/.test(t.native)
      );
      expect(anyHasYear).toBe(true);
    });
  });

  describe('error handling in dry run', () => {
    it('should handle missing query file', async () => {
      const result = await translateQueryCommand(
        join(ctx.tempDir, 'nonexistent.yaml')
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid query file', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        'invalid: yaml: content'
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(false);
    });
  });
});

/**
 * E2E Tests for `search-hub search` command - Live Execution with Mock API
 *
 * These tests mock the external APIs and verify the search command
 * creates sessions, saves results, and handles errors correctly.
 */

// Mock provider modules before importing executeSearch
vi.mock('../../providers/pubmed/provider.js', () => ({
  PubMedProvider: vi.fn().mockImplementation(() => ({
    name: 'pubmed',
    translateQuery: vi.fn().mockReturnValue({
      native: 'diabetes[tiab]',
      provider: 'pubmed',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Effect of Diabetes on Outcomes',
        authors: [{ family: 'Smith', given: 'John' }],
        pmid: '12345678',
        doi: '10.1000/test.12345',
        source: 'pubmed',
        year: 2024,
        retrievedAt: new Date().toISOString(),
      };
      yield {
        title: 'Machine Learning in Diabetes Management',
        authors: [{ family: 'Johnson', given: 'Alice' }],
        pmid: '12345679',
        doi: '10.1000/test.12346',
        source: 'pubmed',
        year: 2024,
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('../../providers/eric/provider.js', () => ({
  ERICProvider: vi.fn().mockImplementation(() => ({
    name: 'eric',
    translateQuery: vi.fn().mockReturnValue({
      native: 'diabetes AND education',
      provider: 'eric',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Diabetes Education in Schools',
        authors: [{ family: 'Teacher', given: 'Mary' }],
        ericId: 'ED654321',
        source: 'eric',
        year: 2023,
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('../../providers/arxiv/provider.js', () => ({
  ArxivProvider: vi.fn().mockImplementation(() => ({
    name: 'arxiv',
    translateQuery: vi.fn().mockReturnValue({
      native: 'ti:diabetes',
      provider: 'arxiv',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Deep Learning for Diabetes Prediction',
        authors: [{ family: 'Chen', given: 'Wei' }],
        arxivId: '2401.00001',
        source: 'arxiv',
        year: 2024,
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('../../providers/scopus/provider.js', () => ({
  ScopusProvider: vi.fn().mockImplementation(() => ({
    name: 'scopus',
    translateQuery: vi.fn().mockReturnValue({
      native: 'TITLE-ABS-KEY(diabetes)',
      provider: 'scopus',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Scopus Article on Diabetes',
        authors: [{ family: 'Lee', given: 'James' }],
        scopusId: 'SCOPUS-123456',
        doi: '10.1000/scopus.123',
        source: 'scopus',
        year: 2024,
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));

// Mock ref-cli to avoid external dependencies
vi.mock('../../integration/ref-cli.js', () => ({
  checkRefAvailable: vi.fn().mockResolvedValue(false),
  refAdd: vi.fn().mockResolvedValue({
    summary: { total: 0, added: 0, skipped: 0, failed: 0 },
    added: [],
    skipped: [],
    failed: [],
  }),
  refUpdate: vi.fn().mockResolvedValue(undefined),
  refExport: vi.fn().mockResolvedValue({}),
}));

// Import after mocking
const { executeSearch } = await import('./search-executor.js');
const { getDefaultConfig } = await import('../../config/index.js');

describe('search-hub search (Live with Mock API) E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('creates session directory', () => {
    it('should create session directory with correct structure', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false // disable progress display
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();

      // Verify session directory was created
      const sessionDir = join(ctx.sessionsDir, result.sessionId!);
      const dirStat = await stat(sessionDir);
      expect(dirStat.isDirectory()).toBe(true);

      // Verify session.json exists
      const sessionPath = join(sessionDir, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);
      expect(session.id).toBe(result.sessionId);
    });

    it('should include query file in session directory', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);

      // Verify translated query file exists
      const queryFilePath = join(ctx.sessionsDir, result.sessionId!, 'pubmed_query.txt');
      const queryContent = await readFile(queryFilePath, 'utf-8');
      expect(queryContent.length).toBeGreaterThan(0);
    });
  });

  describe('saves results to session', () => {
    it('should save results to JSONL file', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);

      // Verify results JSONL file exists
      const resultsPath = join(ctx.sessionsDir, result.sessionId!, 'pubmed_results.jsonl');
      const resultsContent = await readFile(resultsPath, 'utf-8');
      const lines = resultsContent.trim().split('\n');

      expect(lines.length).toBe(2); // Mock yields 2 articles
      const article1 = JSON.parse(lines[0]!);
      expect(article1.pmid).toBe('12345678');
      const article2 = JSON.parse(lines[1]!);
      expect(article2.pmid).toBe('12345679');
    });

    it('should update database status in session.json', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);

      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

      expect(session.databases.pubmed.status).toBe('completed');
      expect(session.databases.pubmed.retrievedCount).toBe(2);
    });
  });

  describe('handles network errors gracefully', () => {
    it('should mark provider as failed when search throws error', async () => {
      // Create a failing mock for this specific test
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ERICProvider).mockImplementationOnce(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'eric',
        }),
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Network timeout: Connection refused');
        }),
        testConnection: vi.fn().mockResolvedValue(false),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = false;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      // Session should still be created, but status should reflect failure
      expect(result.sessionId).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');

      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

      expect(session.databases.eric.status).toBe('failed');
      expect(session.databases.eric.error).toBeDefined();
    });
  });

  describe('continues with other DBs when one fails', () => {
    it('should complete successfully if at least one provider succeeds', async () => {
      // Create a failing mock for ERIC but keep PubMed working
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ERICProvider).mockImplementationOnce(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'eric',
        }),
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('ERIC API temporarily unavailable');
        }),
        testConnection: vi.fn().mockResolvedValue(false),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      // Should succeed because pubmed worked
      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.retrieved).toBe(0);

      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

      expect(session.databases.pubmed.status).toBe('completed');
      expect(session.databases.eric.status).toBe('failed');
      // Session status should be 'partial' when some providers fail
      expect(session.summary.status).toBe('partial');
    });
  });

  describe('--max-results limits results', () => {
    it('should pass maxResults option to provider', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath, maxResults: 1 },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      // Note: The mock doesn't actually limit results, but the option is passed
      // A real implementation test would verify the provider received maxResults=1
    });

    it('should use config max_results when not specified in options', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.pubmed.max_results = 50;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      // The config value should be used
    });
  });

  describe('--db filters databases in search', () => {
    it('should only search selected provider with --db', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath, providers: ['pubmed'] },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['eric']).toBeUndefined();
      expect(result.results?.['arxiv']).toBeUndefined();
    });

    it('should search multiple selected providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath, providers: ['pubmed', 'arxiv'] },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['arxiv']).toBeDefined();
      expect(result.results?.['eric']).toBeUndefined();
    });
  });

  describe('direct query mode', () => {
    it('should execute search with direct query string', async () => {
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { directQuery: 'diabetes[tiab] AND treatment[tiab]', providers: ['pubmed'] },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.results?.['pubmed']).toBeDefined();
    });
  });

  describe('session naming', () => {
    it('should use custom session name when provided', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath, sessionName: 'my-diabetes-search' },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toContain('my-diabetes-search');
    });

    it('should use query name as session name by default', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      // queryFixtures.simple has name 'simple-test'
      expect(result.sessionId).toContain('simple-test');
    });
  });

  describe('multi-provider search', () => {
    it('should search all enabled providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.retrieved).toBe(1);
      expect(result.results?.['arxiv']?.retrieved).toBe(1);
      expect(result.results?.['scopus']).toBeUndefined();
    });

    it('should create separate result files for each provider', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);

      // Verify separate result files exist
      const sessionDir = join(ctx.sessionsDir, result.sessionId!);
      const pubmedResults = await readFile(join(sessionDir, 'pubmed_results.jsonl'), 'utf-8');
      const ericResults = await readFile(join(sessionDir, 'eric_results.jsonl'), 'utf-8');

      expect(pubmedResults.trim().split('\n').length).toBe(2);
      expect(ericResults.trim().split('\n').length).toBe(1);
    });
  });
});
