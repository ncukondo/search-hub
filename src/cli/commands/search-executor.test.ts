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
  });

  describe('createProviderInstance', () => {
    it('should create PubMed provider', () => {
      const provider = createProviderInstance('pubmed', config);
      expect(provider).toBeDefined();
      expect(provider.name).toBe('pubmed');
    });

    it('should create ERIC provider', () => {
      const provider = createProviderInstance('eric', config);
      expect(provider).toBeDefined();
      expect(provider.name).toBe('eric');
    });

    it('should create arXiv provider', () => {
      const provider = createProviderInstance('arxiv', config);
      expect(provider).toBeDefined();
      expect(provider.name).toBe('arxiv');
    });

    it('should create Scopus provider', () => {
      const provider = createProviderInstance('scopus', config);
      expect(provider).toBeDefined();
      expect(provider.name).toBe('scopus');
    });

    it('should throw for unsupported provider', () => {
      expect(() =>
        createProviderInstance('wos' as any, config)
      ).toThrow('not implemented');
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
  });
});
