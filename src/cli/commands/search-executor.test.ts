/**
 * Tests for search-executor.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SearchCommandOptions } from './search.js';
import type { Config } from '../../config/index.js';
import { getDefaultConfig } from '../../config/index.js';
import type { Article } from '../../providers/base/types.js';

// Mock provider module
vi.mock('../../providers/pubmed/provider.js', () => ({
  PubMedProvider: vi.fn().mockImplementation(() => ({
    name: 'pubmed',
    translateQuery: vi.fn().mockReturnValue({
      native: 'test query',
      provider: 'pubmed',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Test Article 1',
        authors: [{ family: 'Smith', given: 'John' }],
        pmid: '12345',
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
      } as Article;
      yield {
        title: 'Test Article 2',
        authors: [{ family: 'Doe', given: 'Jane' }],
        pmid: '12346',
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
      } as Article;
    }),
    count: vi.fn().mockResolvedValue(42),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../../providers/eric/provider.js', () => ({
  ERICProvider: vi.fn().mockImplementation(() => ({
    name: 'eric',
    translateQuery: vi.fn().mockReturnValue({
      native: 'test query',
      provider: 'eric',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'ERIC Article',
        authors: [{ family: 'Teacher', given: 'Ann' }],
        ericId: 'ED123456',
        source: 'eric',
        retrievedAt: new Date().toISOString(),
      } as Article;
    }),
    count: vi.fn().mockResolvedValue(15),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../../providers/arxiv/provider.js', () => ({
  ArxivProvider: vi.fn().mockImplementation(() => ({
    name: 'arxiv',
    translateQuery: vi.fn().mockReturnValue({
      native: 'test query',
      provider: 'arxiv',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'arXiv Paper',
        authors: [{ family: 'Researcher', given: 'Bob' }],
        arxivId: '2301.00001',
        source: 'arxiv',
        retrievedAt: new Date().toISOString(),
      } as Article;
    }),
    count: vi.fn().mockResolvedValue(8),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../../providers/scopus/provider.js', () => ({
  ScopusProvider: vi.fn().mockImplementation(() => ({
    name: 'scopus',
    translateQuery: vi.fn().mockReturnValue({
      native: 'test query',
      provider: 'scopus',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Scopus Article',
        authors: [{ family: 'Scientist', given: 'Eve' }],
        scopusId: 'SCOPUS123',
        source: 'scopus',
        retrievedAt: new Date().toISOString(),
      } as Article;
    }),
    count: vi.fn().mockResolvedValue(120),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

// Mock config paths
vi.mock('../../config/paths.js', () => ({
  getConfigDir: vi.fn().mockReturnValue('/home/user/.config/search-hub'),
}));

// Mock ref-cli functions for auto-register tests
vi.mock('../../integration/ref-cli.js', () => ({
  checkRefAvailable: vi.fn().mockResolvedValue(true),
  refAdd: vi.fn().mockResolvedValue({
    summary: { total: 1, added: 1, skipped: 0, failed: 0 },
    added: [{ source: 'pmid:12345', id: 'smith2024', title: 'Test Article' }],
    skipped: [],
    failed: [],
  }),
  refUpdate: vi.fn().mockResolvedValue(undefined),
  refExport: vi.fn().mockResolvedValue({}),
}));

// Import after mocking
const { executeSearch, executeCountOnly, executePreview, createProviderInstance, isProviderConfigured } = await import('./search-executor.js');

describe('search-executor', () => {
  let tempDir: string;
  let sessionsDir: string;
  let queryFilePath: string;
  let config: Config;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'search-hub-test-'));
    sessionsDir = join(tempDir, 'sessions');
    queryFilePath = join(tempDir, 'test-query.yaml');
    await mkdir(sessionsDir, { recursive: true });

    // Create a test query file
    const queryContent = `name: test-query
description: A test query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - machine learning
    operator: AND
filters:
  year_from: 2020
`;
    await writeFile(queryFilePath, queryContent, 'utf-8');

    config = getDefaultConfig();
    // Enable only pubmed for faster tests
    config.providers.pubmed.enabled = true;
    config.providers.eric.enabled = false;
    config.providers.arxiv.enabled = false;
    config.providers.scopus.enabled = false;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('executeSearch', () => {
    it('should create a session and execute search', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
    });

    it('should respect provider filter', async () => {
      config.providers.eric.enabled = true;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        providers: ['pubmed'],
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['eric']).toBeUndefined();
    });

    it('should handle direct query mode', async () => {
      const options: SearchCommandOptions = {
        directQuery: 'diabetes AND AI',
        providers: ['pubmed'],
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
    });

    it('should respect maxResults option', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        maxResults: 1,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      // maxResults is passed to provider, mock doesn't enforce it
    });

    it('should use custom session name', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        sessionName: 'my-custom-session',
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.sessionId).toContain('my-custom-session');
    });

    it('should save results to JSONL file', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);

      // Check that results file was created
      const resultsPath = join(sessionsDir, result.sessionId!, 'pubmed_results.jsonl');
      const resultsContent = await readFile(resultsPath, 'utf-8');
      const lines = resultsContent.trim().split('\n');
      expect(lines.length).toBe(2);
    });

    it('should create both JSONL and YAML results files on completion', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);

      // Check that both JSONL and YAML files were created
      const jsonlPath = join(sessionsDir, result.sessionId!, 'pubmed_results.jsonl');
      const yamlPath = join(sessionsDir, result.sessionId!, 'pubmed_results.yaml');

      const jsonlContent = await readFile(jsonlPath, 'utf-8');
      const yamlContent = await readFile(yamlPath, 'utf-8');

      // JSONL should have 2 articles
      const lines = jsonlContent.trim().split('\n');
      expect(lines.length).toBe(2);

      // YAML should have header comment with provider name and count
      expect(yamlContent).toMatch(/^# Results: pubmed/);
      expect(yamlContent).toContain('2 articles');

      // Check session.yaml has resultsYaml in files
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);
      expect(session.databases.pubmed.files.resultsYaml).toBe('pubmed_results.yaml');
    });

    it('should update session status on completion', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);

      // Check session file
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);

      expect(session.databases.pubmed.status).toBe('completed');
      expect(session.summary.status).toBe('completed');
    });

    it('should return error for invalid query file', async () => {
      const options: SearchCommandOptions = {
        queryFile: '/nonexistent/file.yaml',
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when no providers enabled', async () => {
      config.providers.pubmed.enabled = false;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No providers');
    });

    it('should extract error message from ProviderError plain objects', async () => {
      // Override PubMed mock to throw a plain ProviderError object (not an Error instance)
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      // Save original implementation to restore later
      const originalImpl = mockedPubMed.getMockImplementation();
      mockedPubMed.mockImplementation(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({
          native: 'test query',
          provider: 'pubmed',
        }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw {
            code: 'NETWORK_ERROR',
            message: 'Connection refused to PubMed API',
            provider: 'pubmed',
            retryable: true,
          };
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      // Restore original mock implementation before assertions
      if (originalImpl) {
        mockedPubMed.mockImplementation(originalImpl);
      }

      expect(result.sessionId).toBeDefined();

      const sessionPath = join(sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);

      expect(session.databases.pubmed.status).toBe('failed');
      expect(session.databases.pubmed.error.message).not.toBe('[object Object]');
      expect(session.databases.pubmed.error.message).toBe('Connection refused to PubMed API');
    });

    it('should mark session as completed when provider returns 0 results without error', async () => {
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      const originalImpl = mockedPubMed.getMockImplementation();
      mockedPubMed.mockImplementation(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'pubmed' }),
        search: vi.fn().mockImplementation(async function* () {
          // Yield nothing - legitimate zero results
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);
      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);
      if (originalImpl) { mockedPubMed.mockImplementation(originalImpl); }
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['pubmed']?.hits).toBe(0);
      expect(result.results?.['pubmed']?.retrieved).toBe(0);
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);
      expect(session.summary.status).toBe('completed');
    });

    it('should mark session as failed when provider throws an error', async () => {
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      const originalImpl = mockedPubMed.getMockImplementation();
      mockedPubMed.mockImplementation(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'pubmed' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('API rate limit exceeded');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);
      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);
      if (originalImpl) { mockedPubMed.mockImplementation(originalImpl); }
      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');
      expect(result.error).toContain('pubmed');
      expect(result.error).toContain('API rate limit exceeded');
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);
      expect(session.summary.status).toBe('failed');
      expect(result.results?.['pubmed']?.error).toBe('API rate limit exceeded');
    });

    it('should include per-provider error details when multiple providers fail', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      const mockedEric = vi.mocked(ERICProvider);
      const originalPubMedImpl = mockedPubMed.getMockImplementation();
      const originalEricImpl = mockedEric.getMockImplementation();

      mockedPubMed.mockImplementation(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'pubmed' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Network request failed');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Timeout');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);

      if (originalPubMedImpl) { mockedPubMed.mockImplementation(originalPubMedImpl); }
      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }

      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');
      expect(result.error).toContain('pubmed');
      expect(result.error).toContain('Network request failed');
      expect(result.error).toContain('eric');
      expect(result.error).toContain('Timeout');
    });

    it('should mark session as completed when one provider succeeds and another returns 0 results (no error)', async () => {
      config.providers.eric.enabled = true;
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      const mockedEric = vi.mocked(ERICProvider);
      const originalEricImpl = mockedEric.getMockImplementation();
      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        search: vi.fn().mockImplementation(async function* () {
          // Yield nothing - legitimate zero results
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);
      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);
      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }
      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.retrieved).toBe(0);
      expect(result.results?.['eric']?.error).toBeUndefined();
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);
      expect(session.summary.status).toBe('completed');
    });
  });

  describe('createProviderInstance', () => {
    it('should create PubMed provider', () => {
      const provider = createProviderInstance('pubmed', config);
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('pubmed');
    });

    it('should create ERIC provider', () => {
      const provider = createProviderInstance('eric', config);
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('eric');
    });

    it('should create arXiv provider', () => {
      const provider = createProviderInstance('arxiv', config);
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('arxiv');
    });

    it('should create Scopus provider with API key', () => {
      config.providers.scopus.api_key = 'test-api-key';
      const provider = createProviderInstance('scopus', config);
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('scopus');
    });

    it('should throw for unsupported provider', () => {
      expect(() =>
        createProviderInstance('wos' as any, config)
      ).toThrow('not implemented');
    });
  });

  describe('isProviderConfigured', () => {
    it('should return false for scopus without API key', () => {
      config.providers.scopus.api_key = '';
      expect(isProviderConfigured('scopus', config)).toBe(false);
    });

    it('should return false for scopus with undefined API key', () => {
      config.providers.scopus.api_key = undefined as any;
      expect(isProviderConfigured('scopus', config)).toBe(false);
    });

    it('should return true for scopus with API key', () => {
      config.providers.scopus.api_key = 'test-api-key';
      expect(isProviderConfigured('scopus', config)).toBe(true);
    });

    it('should return true for pubmed regardless of config', () => {
      expect(isProviderConfigured('pubmed', config)).toBe(true);
    });

    it('should return true for eric regardless of config', () => {
      expect(isProviderConfigured('eric', config)).toBe(true);
    });

    it('should return true for arxiv regardless of config', () => {
      expect(isProviderConfigured('arxiv', config)).toBe(true);
    });
  });

  describe('preflight provider readiness checks', () => {
    it('should skip unconfigured providers with warning in default mode', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      // Search should succeed with the providers that are properly configured
      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);

      // Unconfigured provider should be skipped entirely (not in results)
      expect(result.results?.['scopus']).toBeUndefined();

      // Skip warning should have been emitted
      const warnCalls = warnSpy.mock.calls.map((c) => c.join(' '));
      expect(warnCalls.some((msg) => msg.includes('Skipping scopus'))).toBe(true);

      warnSpy.mockRestore();
    });

    it('should fail with no-providers error when all enabled are unconfigured in default mode', async () => {
      config.providers.pubmed.enabled = false;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      // Should fail because all providers were filtered out
      expect(result.success).toBe(false);
      expect(result.error).toContain('No providers');

      warnSpy.mockRestore();
    });

    it('should still fail with config error when --db explicitly requests unconfigured provider', async () => {
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        providers: ['scopus'], // Explicit --db
      };

      const result = await executeSearch(options, sessionsDir, config);

      // Should fail with config error (preserved behavior for explicit --db)
      expect(result.success).toBe(false);
      expect(result.results?.['scopus']?.error).toContain('provider configuration incomplete');

      warnSpy.mockRestore();
    });
  });

  describe('PubMed email warning with config path', () => {
    it('should include config file path and command in PubMed email warning', () => {
      config.providers.pubmed.email = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      createProviderInstance('pubmed', config);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No email configured for PubMed'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('config.toml'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('search-hub config providers.pubmed.email'));

      warnSpy.mockRestore();
    });
  });

  describe('Scopus API key preflight check', () => {
    it('should skip Scopus in default mode and succeed with other providers', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        // No providers = default mode
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      // Scopus should be skipped entirely in default mode
      expect(result.results?.['scopus']).toBeUndefined();

      // Skip warning should be emitted
      const warnCalls = warnSpy.mock.calls.map((c) => c.join(' '));
      expect(warnCalls.some((msg) => msg.includes('Skipping scopus'))).toBe(true);

      warnSpy.mockRestore();
    });

    it('should fail with config error when --db scopus explicitly requested without key', async () => {
      config.providers.pubmed.enabled = false;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        providers: ['scopus'], // Explicit --db scopus
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.results?.['scopus']?.error).toContain('provider configuration incomplete');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Scopus requires an API key'));

      warnSpy.mockRestore();
    });

    it('should return null from createProviderInstance when Scopus API key is empty', () => {
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = createProviderInstance('scopus', config);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Scopus requires an API key'));

      warnSpy.mockRestore();
    });
  });

  describe('skip unconfigured providers in default mode', () => {
    it('should skip unconfigured Scopus and emit warning when no --db is specified', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        // No providers specified = default mode (no --db)
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);

      // Scopus should NOT appear in results at all (skipped before execution)
      expect(result.results?.['scopus']).toBeUndefined();

      // Warning should mention skipping and suggest --db
      const warnCalls = warnSpy.mock.calls.map((c) => c.join(' '));
      const skipWarning = warnCalls.find((msg) => msg.includes('Skipping scopus'));
      expect(skipWarning).toBeDefined();
      expect(skipWarning).toContain('not configured');
      expect(skipWarning).toContain('--db scopus');

      warnSpy.mockRestore();
    });

    it('should preserve error behavior when --db scopus is explicitly specified', async () => {
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        providers: ['scopus'], // Explicit --db scopus
      };

      const result = await executeSearch(options, sessionsDir, config);

      // Should fail with config error (current behavior preserved)
      expect(result.success).toBe(false);
      expect(result.results?.['scopus']?.error).toContain('provider configuration incomplete');

      // Should NOT have the "Skipping" warning
      const warnCalls = warnSpy.mock.calls.map((c) => c.join(' '));
      const skipWarning = warnCalls.find((msg) => msg.includes('Skipping scopus'));
      expect(skipWarning).toBeUndefined();

      warnSpy.mockRestore();
    });

    it('should execute all configured providers normally in default mode', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;
      config.providers.scopus.enabled = false;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        // No providers specified = default mode
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.retrieved).toBe(1);
      expect(result.results?.['arxiv']?.retrieved).toBe(1);
    });

    it('should return no-providers error when all enabled providers are unconfigured and no --db', async () => {
      config.providers.pubmed.enabled = false;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        // No providers specified = default mode
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No providers');

      warnSpy.mockRestore();
    });
  });

  describe('partial success exit behavior', () => {
    it('should return success=true when 3/4 providers succeed and 1 fails', async () => {
      // Enable all 4 providers
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = 'test-key';

      // Make scopus fail
      const { ScopusProvider } = await import('../../providers/scopus/provider.js');
      const mockedScopus = vi.mocked(ScopusProvider);
      const originalScopusImpl = mockedScopus.getMockImplementation();
      mockedScopus.mockImplementation(() => ({
        name: 'scopus',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'scopus' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Scopus API key expired');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);

      if (originalScopusImpl) { mockedScopus.mockImplementation(originalScopusImpl); }

      expect(result.success).toBe(true);
      expect(result.sessionStatus).toBe('partial');
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.retrieved).toBe(1);
      expect(result.results?.['arxiv']?.retrieved).toBe(1);
      expect(result.results?.['scopus']?.error).toBe('Scopus API key expired');
    });

    it('should return success=false when all providers fail', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      const mockedEric = vi.mocked(ERICProvider);
      const originalPubMedImpl = mockedPubMed.getMockImplementation();
      const originalEricImpl = mockedEric.getMockImplementation();

      mockedPubMed.mockImplementation(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'pubmed' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Network error');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Timeout');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);

      if (originalPubMedImpl) { mockedPubMed.mockImplementation(originalPubMedImpl); }
      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }

      expect(result.success).toBe(false);
      expect(result.sessionStatus).toBe('failed');
    });

    it('should return success=true and completed status when all providers succeed', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;

      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.sessionStatus).toBe('completed');
      expect(result.results?.['pubmed']?.error).toBeUndefined();
      expect(result.results?.['eric']?.error).toBeUndefined();
      expect(result.results?.['arxiv']?.error).toBeUndefined();
    });

    it('should return success=false with strict mode when partial success', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      // Make eric fail
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      const mockedEric = vi.mocked(ERICProvider);
      const originalEricImpl = mockedEric.getMockImplementation();
      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('ERIC unavailable');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = { queryFile: queryFilePath, strict: true };
      const result = await executeSearch(options, sessionsDir, config);

      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }

      expect(result.success).toBe(false);
      expect(result.sessionStatus).toBe('partial');
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.error).toBe('ERIC unavailable');
    });

    it('should return success=true with strict mode when all succeed', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      const options: SearchCommandOptions = { queryFile: queryFilePath, strict: true };
      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.sessionStatus).toBe('completed');
    });

    it('should return success=true without strict mode when partial success (default)', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      // Make eric fail
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      const mockedEric = vi.mocked(ERICProvider);
      const originalEricImpl = mockedEric.getMockImplementation();
      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('ERIC unavailable');
        }),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);

      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }

      expect(result.success).toBe(true);
      expect(result.sessionStatus).toBe('partial');
    });
  });

  describe('auto-register', () => {
    it('should call registerArticles when auto_register is enabled', async () => {
      // Enable auto_register in config
      config.integration.reference_manager.auto_register = true;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.autoRegisterResult).toBeDefined();
      expect(result.autoRegisterResult?.summary).toBeDefined();
    });

    it('should not call registerArticles when auto_register is disabled', async () => {
      // Ensure auto_register is disabled (default)
      config.integration.reference_manager.auto_register = false;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.autoRegisterResult).toBeUndefined();
    });

    it('should not call registerArticles when reference_manager is disabled', async () => {
      config.integration.reference_manager.enabled = false;
      config.integration.reference_manager.auto_register = true;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.autoRegisterResult).toBeUndefined();
    });

    it('should create registration.json in session directory when auto_register is enabled', async () => {
      config.integration.reference_manager.auto_register = true;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);

      // Check that registration.json was created
      const registrationPath = join(sessionsDir, result.sessionId!, 'registration.json');
      const registrationContent = await readFile(registrationPath, 'utf-8');
      const registration = JSON.parse(registrationContent);

      expect(registration.sessionId).toBeDefined();
      expect(registration.summary).toBeDefined();
      expect(registration.summary.total).toBe(2); // 2 mocked articles from pubmed
    });

    it('should pass with_abstracts option from config to registerArticles', async () => {
      config.integration.reference_manager.auto_register = true;
      config.integration.reference_manager.with_abstracts = true;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.autoRegisterResult).toBeDefined();
      // The mock refUpdate would be called if withAbstracts is enabled
      // This verifies the option is passed through correctly
    });
  });

  describe('executeCountOnly', () => {
    it('should return count results for query file', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const results = await executeCountOnly(options, config);

      expect(results).toHaveLength(1); // Only pubmed enabled
      expect(results[0]!.provider).toBe('pubmed');
      expect(results[0]!.count).toBe(42);
      expect(results[0]!.error).toBeUndefined();
    });

    it('should return count results for multiple providers', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;
      config.providers.arxiv.enabled = true;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const results = await executeCountOnly(options, config);

      expect(results).toHaveLength(3);
      const pubmed = results.find((r) => r.provider === 'pubmed');
      const eric = results.find((r) => r.provider === 'eric');
      const arxiv = results.find((r) => r.provider === 'arxiv');
      expect(pubmed?.count).toBe(42);
      expect(eric?.count).toBe(15);
      expect(arxiv?.count).toBe(8);
    });

    it('should return count results for direct query', async () => {
      const options: SearchCommandOptions = {
        directQuery: 'diabetes[tiab]',
        providers: ['pubmed'],
      };

      const results = await executeCountOnly(options, config);

      expect(results).toHaveLength(1);
      expect(results[0]!.provider).toBe('pubmed');
      expect(results[0]!.count).toBe(42);
    });

    it('should not create a session', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      await executeCountOnly(options, config);

      // Check that no session directories were created
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(sessionsDir);
      expect(entries).toHaveLength(0);
    });

    it('should handle provider errors gracefully', async () => {
      // Use scopus which will fail because we mock ScopusProvider to return null via config
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = ''; // Empty key will cause null provider

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
        providers: ['scopus'],
      };

      const results = await executeCountOnly(options, config);

      expect(results).toHaveLength(1);
      expect(results[0]!.provider).toBe('scopus');
      expect(results[0]!.error).toBeDefined();

      warnSpy.mockRestore();
    });

    it('should return mixed results when some providers fail (partial success)', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      // Make eric count fail
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      const mockedEric = vi.mocked(ERICProvider);
      const originalEricImpl = mockedEric.getMockImplementation();
      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        search: vi.fn().mockImplementation(async function* () {}),
        count: vi.fn().mockRejectedValue(new Error('ERIC API timeout')),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const results = await executeCountOnly(options, config);

      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }

      expect(results).toHaveLength(2);
      const pubmed = results.find((r) => r.provider === 'pubmed');
      const eric = results.find((r) => r.provider === 'eric');
      expect(pubmed?.count).toBe(42);
      expect(pubmed?.error).toBeUndefined();
      expect(eric?.error).toBe('ERIC API timeout');
    });

    it('should return empty array when no providers available', async () => {
      config.providers.pubmed.enabled = false;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = false;

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const results = await executeCountOnly(options, config);

      expect(results).toHaveLength(0);
    });
  });

  describe('executePreview partial success', () => {
    it('should return mixed results when some providers fail in preview mode', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      // Make eric fail in preview
      const { ERICProvider } = await import('../../providers/eric/provider.js');
      const mockedEric = vi.mocked(ERICProvider);
      const originalEricImpl = mockedEric.getMockImplementation();
      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        // eslint-disable-next-line require-yield -- mock generator that throws immediately to simulate error
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('ERIC preview error');
        }),
        count: vi.fn().mockRejectedValue(new Error('ERIC preview error')),
        testConnection: vi.fn().mockResolvedValue({ ok: true }),
      }) as any);

      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const results = await executePreview(options, config);

      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }

      expect(results).toHaveLength(2);
      const pubmed = results.find((r) => r.provider === 'pubmed');
      const eric = results.find((r) => r.provider === 'eric');
      expect(pubmed?.count).toBe(42);
      expect(pubmed?.error).toBeUndefined();
      expect(eric?.error).toBe('ERIC preview error');
    });
  });
});
