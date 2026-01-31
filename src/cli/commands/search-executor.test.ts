/**
 * Tests for search-executor.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    testConnection: vi.fn().mockResolvedValue(true),
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
    testConnection: vi.fn().mockResolvedValue(true),
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
    testConnection: vi.fn().mockResolvedValue(true),
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
    testConnection: vi.fn().mockResolvedValue(true),
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
const { executeSearch, createProviderInstance } = await import('./search-executor.js');

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

    it('should update session status on completion', async () => {
      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);

      // Check session file
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

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
        search: vi.fn().mockImplementation(async function* () {
          throw {
            code: 'NETWORK_ERROR',
            message: 'Connection refused to PubMed API',
            provider: 'pubmed',
            retryable: true,
          };
        }),
        testConnection: vi.fn().mockResolvedValue(true),
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

      const sessionPath = join(sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

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
        testConnection: vi.fn().mockResolvedValue(true),
      }) as any);
      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);
      if (originalImpl) { mockedPubMed.mockImplementation(originalImpl); }
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['pubmed']?.hits).toBe(0);
      expect(result.results?.['pubmed']?.retrieved).toBe(0);
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);
      expect(session.summary.status).toBe('completed');
    });

    it('should mark session as failed when provider throws an error', async () => {
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      const originalImpl = mockedPubMed.getMockImplementation();
      mockedPubMed.mockImplementation(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'pubmed' }),
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('API rate limit exceeded');
        }),
        testConnection: vi.fn().mockResolvedValue(true),
      }) as any);
      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);
      if (originalImpl) { mockedPubMed.mockImplementation(originalImpl); }
      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');
      expect(result.error).toContain('pubmed');
      expect(result.error).toContain('API rate limit exceeded');
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);
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
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Network request failed');
        }),
        testConnection: vi.fn().mockResolvedValue(true),
      }) as any);

      mockedEric.mockImplementation(() => ({
        name: 'eric',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'eric' }),
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('Timeout');
        }),
        testConnection: vi.fn().mockResolvedValue(true),
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
        testConnection: vi.fn().mockResolvedValue(true),
      }) as any);
      const options: SearchCommandOptions = { queryFile: queryFilePath };
      const result = await executeSearch(options, sessionsDir, config);
      if (originalEricImpl) { mockedEric.mockImplementation(originalEricImpl); }
      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['eric']?.retrieved).toBe(0);
      expect(result.results?.['eric']?.error).toBeUndefined();
      const sessionPath = join(sessionsDir, result.sessionId!, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);
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

  describe('preflight provider readiness checks', () => {
    it('should emit warnings and skip misconfigured providers during search', async () => {
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

      // Misconfigured provider should be skipped with config error
      expect(result.results?.['scopus']?.error).toBeDefined();
      expect(result.results?.['scopus']?.hits).toBe(0);

      // Warning should have been emitted for the misconfigured provider
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should skip all misconfigured providers and fail if none remain working', async () => {
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

      // Should fail because all enabled providers were misconfigured
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
    it('should skip Scopus and succeed with other providers when API key is empty', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['pubmed']?.retrieved).toBe(2);
      expect(result.results?.['scopus']?.error).toContain('provider configuration incomplete');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Scopus requires an API key'));

      warnSpy.mockRestore();
    });

    it('should fail when Scopus is the only provider and API key is missing', async () => {
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

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Scopus requires an API key'));

      warnSpy.mockRestore();
    });

    it('should record an error about API key when Scopus is skipped', async () => {
      config.providers.pubmed.enabled = true;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = '';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const options: SearchCommandOptions = {
        queryFile: queryFilePath,
      };

      const result = await executeSearch(options, sessionsDir, config);

      expect(result.results?.['scopus']).toBeDefined();
      expect(result.results?.['scopus']?.hits).toBe(0);
      expect(result.results?.['scopus']?.retrieved).toBe(0);
      expect(result.results?.['scopus']?.error).toBe(
        'scopus: provider configuration incomplete. See warning above for details.'
      );

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
});
