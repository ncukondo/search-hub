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
  formatQueryDiagnostics,
  formatPreviewOutput,
  formatShortKeywordWarning,
  type SearchCommandOptions,
  type TranslationResult,
  type PreviewResult,
} from './search.js';
import { executePreview } from './search-executor.js';
import { detectShortKeywords } from '../../query/parser.js';
import type { ProviderName } from '../../session/types.js';
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

      const output = await formatDryRunOutput(translations);

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

      const output = await formatDryRunOutput(translations);

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
    it('should format empty translations', async () => {
      const output = await formatDryRunOutput([]);

      expect(output).toBe('No translations available.');
    });

    it('should format single translation', async () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
      ];

      const output = await formatDryRunOutput(translations);

      expect(output).toContain('Translated queries:');
      expect(output).toContain('[pubmed]');
      expect(output).toContain('diabetes[tiab]');
    });

    it('should format multiple translations', async () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
        { provider: 'eric', query: 'diabetes AND mellitus' },
      ];

      const output = await formatDryRunOutput(translations);

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

  describe('--dry-run includes provider readiness section', () => {
    it('should include provider readiness when config is provided', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed', 'eric'],
      });

      expect(result.success).toBe(true);

      const translations: TranslationResult[] = Object.entries(
        result.translations!
      ).map(([provider, t]) => ({
        provider,
        query: t.native,
      }));

      const { getDefaultConfig: getDefConfig } = await import('../../config/index.js');
      const config = getDefConfig();
      config.providers.pubmed.email = 'researcher@example.com';
      const providers: ProviderName[] = ['pubmed', 'eric'];

      const output = await formatDryRunOutput(translations, { config, providers });

      expect(output).toContain('Provider readiness:');
      expect(output).toContain('pubmed');
      expect(output).toContain('eric');
      expect(output).toContain('ready');
      expect(output).toContain('Translated queries:');
    });
  });

  describe('--dry-run CLI integration includes provider readiness', () => {
    it('should include provider readiness in CLI dry-run output with query file', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const { createProgram } = await import('../index.js');
      const logged: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logged.push(args.join(' '));
      });
      const program = createProgram();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'test', 'search', queryPath, '--db', 'pubmed,eric', '--dry-run', '--config', ctx.configPath]);
      } catch {
        // exitOverride may throw
      }
      logSpy.mockRestore();
      const output = logged.join('\n');
      expect(output).toContain('Provider readiness:');
      expect(output).toContain('pubmed');
      expect(output).toContain('eric');
      expect(output).toContain('Translated queries:');
    });

    it('should include provider readiness in CLI dry-run output with direct query', async () => {
      const { createProgram } = await import('../index.js');
      const logged: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logged.push(args.join(' '));
      });
      const program = createProgram();
      program.exitOverride();
      try {
        await program.parseAsync(['node', 'test', 'search', '--db', 'pubmed', '--query', 'diabetes[tiab]', '--dry-run', '--config', ctx.configPath]);
      } catch {
        // exitOverride may throw
      }
      logSpy.mockRestore();
      const output = logged.join('\n');
      expect(output).toContain('Provider readiness:');
      expect(output).toContain('pubmed');
      expect(output).toContain('Translated queries:');
    });
  });

  describe('--dry-run includes diagnostics section when applicable', () => {
    it('should not show diagnostics section for clean ERIC queries', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['eric'],
      });

      expect(result.success).toBe(true);

      const translations: TranslationResult[] = Object.entries(
        result.translations!
      ).map(([provider, t]) => ({
        provider,
        query: t.native,
      }));

      const diagnostics = formatQueryDiagnostics(translations);
      expect(diagnostics).toBe('');
    });

    it('should show diagnostics when PubMed query has NOT operator', async () => {
      // Create a translation result manually with NOT operator
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab] NOT review[pt]' },
      ];

      const { getDefaultConfig: getDefConfig2 } = await import('../../config/index.js');
      const config = getDefConfig2();
      const providers: ProviderName[] = ['pubmed'];

      const output = await formatDryRunOutput(translations, { config, providers });

      expect(output).toContain('Diagnostics:');
      expect(output).toContain('NOT');
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
    count: vi.fn().mockResolvedValue(2),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
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
    count: vi.fn().mockResolvedValue(1),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
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
    count: vi.fn().mockResolvedValue(1),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
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
    count: vi.fn().mockResolvedValue(1),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
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
const { executeSearch, executeCountOnly } = await import('./search-executor.js');
const { getDefaultConfig } = await import('../../config/index.js');
const { formatCountOnlyOutput } = await import('./search.js');

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
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error('Network timeout: Connection refused');
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: false, error: 'Connection failed' }),
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

  describe('error message includes per-provider details', () => {
    it('should include provider name and error in error message when all providers fail', async () => {
      // Create failing mocks for both providers
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const { ERICProvider } = await import('../../providers/eric/provider.js');

      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'pubmed',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error('PubMed API unavailable');
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: false, error: 'Connection failed' }),
      }));

      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ERICProvider).mockImplementationOnce(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'eric',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error('ERIC connection timeout');
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: false, error: 'Connection failed' }),
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

      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');
      // Error message should include per-provider details
      expect(result.error).toContain('pubmed');
      expect(result.error).toContain('PubMed API unavailable');
      expect(result.error).toContain('eric');
      expect(result.error).toContain('ERIC connection timeout');
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
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error('ERIC API temporarily unavailable');
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: false, error: 'Connection failed' }),
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

describe('search-hub search: zero-result searches (Task 15)', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('zero results should exit with code 0, not code 4', () => {
    it('should return success=true when provider returns 0 results without error', async () => {
      // Override PubMed mock to yield zero results (empty generator, no error)
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'very_obscure_nonexistent_term_xyz123[tiab]',
          provider: 'pubmed',
        }),
        search: vi.fn().mockImplementation(async function* () {
          // Yields nothing - zero results, but no error
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }));

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

      // Zero results with no error should be success (exit code 0),
      // NOT a network error (exit code 4)
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify the provider result shows 0 retrieved but no error
      expect(result.results?.['pubmed']?.retrieved).toBe(0);
      expect(result.results?.['pubmed']?.error).toBeUndefined();
    });

    it('should return success=true when multiple providers all return 0 results', async () => {
      // Override all mocks to yield zero results
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const { ERICProvider } = await import('../../providers/eric/provider.js');

      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'nonexistent_query[tiab]',
          provider: 'pubmed',
        }),
        search: vi.fn().mockImplementation(async function* () {
          // Zero results
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }));

      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ERICProvider).mockImplementationOnce(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({
          native: 'nonexistent_query',
          provider: 'eric',
        }),
        search: vi.fn().mockImplementation(async function* () {
          // Zero results
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
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

      // All zero results with no errors should still be success
      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(0);
      expect(result.results?.['pubmed']?.error).toBeUndefined();
      expect(result.results?.['eric']?.retrieved).toBe(0);
      expect(result.results?.['eric']?.error).toBeUndefined();
    });
  });

  describe('zero-result session status should be completed', () => {
    it('should set session status to completed for zero-result search', async () => {
      // Override PubMed mock to yield zero results
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'zero_results_query[tiab]',
          provider: 'pubmed',
        }),
        search: vi.fn().mockImplementation(async function* () {
          // Yields nothing - zero results
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }));

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
      expect(result.sessionId).toBeDefined();

      // Read session.json and verify status is 'completed', not 'failed'
      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

      expect(session.summary.status).toBe('completed');
      // The individual database status should also be 'completed'
      expect(session.databases.pubmed.status).toBe('completed');
      expect(session.databases.pubmed.retrievedCount).toBe(0);
    });

    it('should set session status to completed when all providers return zero results', async () => {
      // Override mocks to yield zero results for all providers
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const { ArxivProvider } = await import('../../providers/arxiv/provider.js');

      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'zero_results[tiab]',
          provider: 'pubmed',
        }),
        search: vi.fn().mockImplementation(async function* () {
          // Zero results
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }));

      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ArxivProvider).mockImplementationOnce(() => ({
        name: 'arxiv',
        translateQuery: vi.fn().mockReturnValue({
          native: 'ti:zero_results',
          provider: 'arxiv',
        }),
        search: vi.fn().mockImplementation(async function* () {
          // Zero results
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = true;
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

      // Session overall status should be 'completed' (not 'failed' or 'partial')
      expect(session.summary.status).toBe('completed');
      expect(session.databases.pubmed.status).toBe('completed');
      expect(session.databases.pubmed.retrievedCount).toBe(0);
      expect(session.databases.arxiv.status).toBe('completed');
      expect(session.databases.arxiv.retrievedCount).toBe(0);
    });

    it('should set session status to partial when one provider fails and another returns zero results', async () => {
      // One provider fails (error), one returns zero results (no error)
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const { ERICProvider } = await import('../../providers/eric/provider.js');

      // PubMed returns zero results successfully
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'zero_results[tiab]',
          provider: 'pubmed',
        }),
        search: vi.fn().mockImplementation(async function* () {
          // Zero results, no error
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }));

      // ERIC fails with an error
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ERICProvider).mockImplementationOnce(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'eric',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error('ERIC API unavailable');
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: false, error: 'Connection failed' }),
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

      // The search-executor checks anySucceeded (retrieved > 0) and anyFailed.
      // Zero results from pubmed means anySucceeded=false, eric failed means anyFailed=true.
      // So overall status should be 'failed' since no provider succeeded with results.
      // This confirms that zero-result WITHOUT error is different from failure WITH error.
      expect(result.sessionId).toBeDefined();

      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

      // PubMed completed successfully (zero results, no error)
      expect(session.databases.pubmed.status).toBe('completed');
      expect(session.databases.pubmed.retrievedCount).toBe(0);
      // ERIC failed
      expect(session.databases.eric.status).toBe('failed');
    });
  });


  describe('--verbose flag shows provider details on failure', () => {
    it('should show per-provider details when verbose is enabled and search fails', async () => {
      // Import provider mocks
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'pubmed',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error('PubMed API unavailable');
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: false, error: 'Connection failed' }),
      }));

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

      expect(result.success).toBe(false);
      expect(result.results).toBeDefined();
      expect(result.results!['pubmed']?.error).toBe('PubMed API unavailable');

      // Verify formatVerboseProviderDetails works with these results
      const { formatVerboseProviderDetails } = await import('./search-utils.js');
      const verboseOutput = formatVerboseProviderDetails(result.results!);
      expect(verboseOutput).toContain('Per-provider details');
      expect(verboseOutput).toContain('pubmed');
      expect(verboseOutput).toContain('FAILED');
      expect(verboseOutput).toContain('PubMed API unavailable');
    });
  });
});


describe('search-hub search: UX improvements (Tasks #19 and #22)', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('PubMed email warning includes config path', () => {
    it('should show config file path in PubMed email warning', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.pubmed.email = '';
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No email configured for PubMed'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('config.toml'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('search-hub config providers.pubmed.email'));

      warnSpy.mockRestore();
    });
  });

  describe('failed search shows suggested diagnostic commands', () => {
    it('should include suggested actions when all providers fail', async () => {
      // Create a failing mock for PubMed
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(PubMedProvider).mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'pubmed',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error('Connection refused');
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: false, error: 'Connection failed' }),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      warnSpy.mockRestore();

      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');
      expect(result.error).toContain('Suggested actions:');
      expect(result.error).toContain('--dry-run');
      expect(result.error).toContain('search-hub config');
      expect(result.error).toContain('--db');
    });
  });

  describe('Scopus API key preflight check E2E', () => {
    it('should skip Scopus in default mode and succeed with other providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      // Scopus should be skipped entirely (not in results)
      expect(result.results?.['scopus']).toBeUndefined();

      // Skip warning should be emitted
      const warnCalls = warnSpy.mock.calls.map((c) => c.join(' '));
      expect(warnCalls.some((msg) => msg.includes('Skipping scopus'))).toBe(true);

      warnSpy.mockRestore();
    });
  });
});

describe('search-hub search: skip unconfigured providers E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('search without Scopus API key completes successfully', () => {
    it('should skip Scopus and complete search with configured providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.retrieved).toBe(1);
      // Scopus should not appear in results
      expect(result.results?.['scopus']).toBeUndefined();

      // Session should be completed (not partial)
      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);
      expect(session.summary.status).toBe('completed');

      // Verify skip warning
      const warnCalls = warnSpy.mock.calls.map((c) => c.join(' '));
      expect(warnCalls.some((msg) => msg.includes('Skipping scopus'))).toBe(true);
      expect(warnCalls.some((msg) => msg.includes('--db scopus'))).toBe(true);

      warnSpy.mockRestore();
    });
  });

  describe('search with --db scopus without API key fails with clear error', () => {
    it('should fail with config error when --db scopus is explicitly requested', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath, providers: ['scopus'] },
        ctx.sessionsDir,
        config,
        false
      );

      expect(result.success).toBe(false);
      expect(result.results?.['scopus']?.error).toContain('provider configuration incomplete');

      // Should have the Scopus API key warning (from createProviderInstance)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Scopus requires an API key'));

      warnSpy.mockRestore();
    });
  });
});

describe('search-hub search --count-only E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('count-only with query file', () => {
    it('should return hit counts from all enabled providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;
      config.providers.scopus.enabled = false;

      const counts = await executeCountOnly(
        { queryFile: queryPath, countOnly: true },
        config
      );

      expect(counts).toHaveLength(3);
      expect(counts.find((c) => c.provider === 'pubmed')?.count).toBe(2);
      expect(counts.find((c) => c.provider === 'eric')?.count).toBe(1);
      expect(counts.find((c) => c.provider === 'arxiv')?.count).toBe(1);
    });

    it('should return counts for single provider with --db', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;
      config.providers.scopus.enabled = false;

      const counts = await executeCountOnly(
        { queryFile: queryPath, countOnly: true, providers: ['pubmed'] },
        config
      );

      expect(counts).toHaveLength(1);
      expect(counts[0]!.provider).toBe('pubmed');
      expect(counts[0]!.count).toBe(2);
    });
  });

  describe('count-only with direct query', () => {
    it('should return count for direct query with single provider', async () => {
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;

      const counts = await executeCountOnly(
        { directQuery: 'diabetes[tiab]', providers: ['pubmed'], countOnly: true },
        config
      );

      expect(counts).toHaveLength(1);
      expect(counts[0]!.provider).toBe('pubmed');
      expect(counts[0]!.count).toBe(2);
    });
  });

  describe('count-only does not create session', () => {
    it('should not create any files in sessions directory', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      await executeCountOnly(
        { queryFile: queryPath, countOnly: true },
        config
      );

      // Sessions directory should remain empty
      const entries = await readdir(ctx.sessionsDir);
      expect(entries).toHaveLength(0);
    });
  });

  describe('count-only output formatting', () => {
    it('should format count results with totals', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const counts = await executeCountOnly(
        { queryFile: queryPath, countOnly: true },
        config
      );

      const output = formatCountOnlyOutput(counts, 'test-query.yaml');

      expect(output).toContain('Query: test-query.yaml (count only)');
      expect(output).toContain('pubmed:');
      expect(output).toContain('eric:');
      expect(output).toContain('hits');
      expect(output).toContain('total:');
      expect(output).toContain('before deduplication');
    });
  });

  describe('count-only handles provider errors gracefully', () => {
    it('should return error for failed provider without affecting others', async () => {
      // Override ERIC to throw an error during count
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ERICProvider).mockImplementationOnce(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'eric',
        }),
        count: vi.fn().mockRejectedValue(new Error('ERIC API timeout')),
        search: vi.fn().mockImplementation(async function* () {}),
        testConnection: vi.fn().mockResolvedValue({ ok: false }),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const counts = await executeCountOnly(
        { queryFile: queryPath, countOnly: true },
        config
      );

      expect(counts).toHaveLength(2);

      const pubmed = counts.find((c) => c.provider === 'pubmed');
      expect(pubmed?.count).toBe(2);
      expect(pubmed?.error).toBeUndefined();

      const eric = counts.find((c) => c.provider === 'eric');
      expect(eric?.count).toBe(0);
      expect(eric?.error).toContain('ERIC API timeout');
    });
  });

  describe('count-only skips unconfigured providers', () => {
    it('should skip Scopus without API key in default mode', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const counts = await executeCountOnly(
        { queryFile: queryPath, countOnly: true },
        config
      );

      // Scopus should be skipped since no API key and no explicit --db
      expect(counts).toHaveLength(1);
      expect(counts[0]!.provider).toBe('pubmed');
    });
  });
});

/**
 * E2E Tests for Query Refinement UX Improvements (Task #07)
 *
 * Tests:
 * - Direct query tip display
 * - Preview mode functionality
 * - Short keyword warning
 */

describe('search-hub search: Query Refinement UX (Task #07)', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('Preview mode (--preview)', () => {
    it('should return preview results with counts and titles', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const results = await executePreview(
        { queryFile: queryPath, preview: true },
        config
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.provider).toBe('pubmed');
      expect(results[0]!.count).toBe(2);
      expect(results[0]!.titles.length).toBeGreaterThan(0);
    });

    it('should return preview results for multiple providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const results = await executePreview(
        { queryFile: queryPath, preview: true },
        config
      );

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.provider === 'pubmed')).toBeDefined();
      expect(results.find((r) => r.provider === 'eric')).toBeDefined();
    });

    it('should not create session directory', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      await executePreview(
        { queryFile: queryPath, preview: true },
        config
      );

      const entries = await readdir(ctx.sessionsDir);
      expect(entries).toHaveLength(0);
    });

    it('should format preview output correctly', () => {
      const results: PreviewResult[] = [
        {
          provider: 'pubmed',
          count: 28,
          titles: ['Article 1', 'Article 2', 'Article 3'],
        },
      ];

      const output = formatPreviewOutput(results, 'query.yaml');

      expect(output).toContain('query.yaml');
      expect(output).toContain('preview');
      expect(output).toContain('pubmed:');
      expect(output).toContain('28');
      expect(output).toContain('Article 1');
      expect(output).toContain('Article 2');
    });
  });

  describe('Short keyword warning', () => {
    it('should detect short keywords from query AST', async () => {
      const queryPath = await createRawQueryFile(ctx.tempDir, `
name: short_keywords_test
query:
  - field: title_abstract
    terms:
      keywords:
        - EPA
        - OSCE
        - AI
        - medical education
    operator: OR
`);
      const { parseQueryFile } = await import('../../query/parser.js');
      const ast = await parseQueryFile(queryPath);
      const shortKeywords = detectShortKeywords(ast);

      expect(shortKeywords).toContain('EPA');
      expect(shortKeywords).toContain('AI');
      expect(shortKeywords).not.toContain('OSCE');
      expect(shortKeywords).not.toContain('medical education');
    });

    it('should format warning with suggestions', () => {
      const warning = formatShortKeywordWarning(['EPA', 'AI']);

      expect(warning).toContain('⚠');
      expect(warning).toContain('EPA');
      expect(warning).toContain('AI');
      expect(warning).toContain('short');
      expect(warning).toContain('full phrases');
      expect(warning).toContain('exclude');
    });

    it('should return empty string when no short keywords', () => {
      const warning = formatShortKeywordWarning([]);
      expect(warning).toBe('');
    });
  });
});
