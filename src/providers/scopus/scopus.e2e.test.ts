/**
 * E2E Tests for Scopus Authentication Diagnostics
 *
 * Verifies that:
 * - dry-run with invalid API key shows failure with actionable message
 * - search with invalid API key produces detailed error in session
 * - 401 vs 403 error distinction is preserved through the full stack
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
  createQueryFile,
  queryFixtures,
} from '../../cli/e2e-helpers.js';
import {
  formatDryRunOutput,
  formatProviderReadiness,
  type TranslationResult,
} from '../../cli/commands/search.js';
import type { ProviderName } from '../../session/types.js';
import type { ConnectionTestResult } from '../base/types.js';

/**
 * Scopus dry-run diagnostics E2E
 *
 * These tests verify that dry-run output correctly reflects Scopus
 * authentication status by mocking the ScopusProvider.
 */

// Mock the Scopus provider to simulate auth failures
vi.mock('../scopus/provider.js', () => ({
  ScopusProvider: vi.fn(),
}));

// Mock other providers to avoid real API calls
vi.mock('../pubmed/provider.js', () => ({
  PubMedProvider: vi.fn().mockImplementation(() => ({
    name: 'pubmed',
    translateQuery: vi.fn().mockReturnValue({
      native: 'diabetes[tiab]',
      provider: 'pubmed',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Test Article',
        authors: [{ family: 'Smith', given: 'John' }],
        pmid: '12345678',
        source: 'pubmed',
        year: 2024,
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../eric/provider.js', () => ({
  ERICProvider: vi.fn().mockImplementation(() => ({
    name: 'eric',
    translateQuery: vi.fn().mockReturnValue({
      native: 'diabetes AND education',
      provider: 'eric',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Test ERIC Article',
        authors: [{ family: 'Jones', given: 'Bob' }],
        ericId: 'ED111111',
        source: 'eric',
        year: 2023,
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../arxiv/provider.js', () => ({
  ArxivProvider: vi.fn().mockImplementation(() => ({
    name: 'arxiv',
    translateQuery: vi.fn().mockReturnValue({
      native: 'ti:diabetes',
      provider: 'arxiv',
    }),
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Test arXiv Article',
        authors: [{ family: 'Chen', given: 'Wei' }],
        arxivId: '2401.00001',
        source: 'arxiv',
        year: 2024,
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

// Mock ref-cli
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
const { getDefaultConfig } = await import('../../config/index.js');
const { executeSearch } = await import('../../cli/commands/search-executor.js');

describe('Scopus authentication diagnostics E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('dry-run with invalid API key shows failure with actionable message', () => {
    it('should show ✗ scopus not ready when connection test returns 401 error', async () => {
      const translations: TranslationResult[] = [
        { provider: 'scopus', query: 'TITLE-ABS-KEY(diabetes)' },
      ];

      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'invalid-key-12345';
      const providers: ProviderName[] = ['scopus'];

      // Simulate connection test failure (as if testProviderConnections was called)
      const connectionResults: Record<string, ConnectionTestResult> = {
        scopus: {
          ok: false,
          error: 'Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/',
        },
      };

      const readiness = formatProviderReadiness(providers, config, connectionResults);

      expect(readiness).toContain('✗');
      expect(readiness).toContain('scopus');
      expect(readiness).toContain('not ready');
      expect(readiness).toContain('invalid or expired');
      expect(readiness).toContain('401');
      expect(readiness).toContain('dev.elsevier.com');

      // Full dry-run output should include the readiness section
      const output = await formatDryRunOutput(translations, {
        config,
        providers,
        skipConnectionTest: true,
      });
      // With skipConnectionTest, no live connection test is run.
      // Verify the translated queries are still present.
      expect(output).toContain('Translated queries:');
      expect(output).toContain('[scopus]');
      expect(output).toContain('TITLE-ABS-KEY(diabetes)');
    });

    it('should show ✗ scopus not ready when connection test returns 403 error', async () => {
      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'valid-key-no-permissions';
      const providers: ProviderName[] = ['scopus'];

      const connectionResults: Record<string, ConnectionTestResult> = {
        scopus: {
          ok: false,
          error: 'Scopus API access denied (HTTP 403). Your key may lack permissions for this resource.',
        },
      };

      const readiness = formatProviderReadiness(providers, config, connectionResults);

      expect(readiness).toContain('✗');
      expect(readiness).toContain('scopus');
      expect(readiness).toContain('not ready');
      expect(readiness).toContain('access denied');
      expect(readiness).toContain('403');
    });

    it('should show ✓ scopus ready (verified) when connection test passes', async () => {
      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'valid-api-key';
      const providers: ProviderName[] = ['scopus'];

      const connectionResults: Record<string, ConnectionTestResult> = {
        scopus: { ok: true },
      };

      const readiness = formatProviderReadiness(providers, config, connectionResults);

      expect(readiness).toContain('✓');
      expect(readiness).toContain('scopus');
      expect(readiness).toContain('ready (verified)');
    });

    it('should show scopus as missing api_key when key is absent', async () => {
      const config = getDefaultConfig();
      // No api_key set
      const providers: ProviderName[] = ['scopus'];

      const readiness = formatProviderReadiness(providers, config);

      expect(readiness).toContain('✗');
      expect(readiness).toContain('scopus');
      expect(readiness).toContain('missing api_key (required)');
    });

    it('should include full dry-run output with readiness + translated queries for Scopus', async () => {
      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'invalid-key';
      config.providers.pubmed.email = 'test@example.com';
      const providers: ProviderName[] = ['scopus', 'pubmed'];

      // Simulate mixed connection results
      const connectionResults: Record<string, ConnectionTestResult> = {
        scopus: {
          ok: false,
          error: 'Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/',
        },
        pubmed: { ok: true },
      };

      const readiness = formatProviderReadiness(providers, config, connectionResults);

      // Scopus should show failure
      expect(readiness).toContain('✗');
      expect(readiness).toContain('not ready');
      // PubMed should show success
      expect(readiness).toContain('✓');
      expect(readiness).toContain('ready (verified');
    });
  });

  describe('search with invalid API key produces detailed error in session', () => {
    it('should mark scopus as failed with actionable 401 error in session', async () => {
      // Mock ScopusProvider to simulate 401 auth failure during search
      const { ScopusProvider } = await import('../scopus/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ScopusProvider).mockImplementationOnce(() => ({
        name: 'scopus',
        translateQuery: vi.fn().mockReturnValue({
          native: 'TITLE-ABS-KEY(diabetes)',
          provider: 'scopus',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            const error = Object.assign(
              new Error(
                'Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/'
              ),
              { code: 'API_KEY_INVALID', retryable: false }
            );
            throw error;
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({
          ok: false,
          error: 'Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/',
        }),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = false;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = 'invalid-key-12345';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      warnSpy.mockRestore();

      // Search should fail because Scopus is the only provider and it has an invalid key
      expect(result.success).toBe(false);
      expect(result.sessionId).toBeDefined();

      // The error message should contain actionable information
      expect(result.error).toContain('All providers failed');
      expect(result.error).toContain('scopus');
      expect(result.error).toContain('401');
      expect(result.error).toContain('dev.elsevier.com');

      // Verify session.yaml reflects the failure
      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);

      expect(session.databases.scopus.status).toBe('failed');
      expect(session.databases.scopus.error).toBeDefined();
      expect(session.databases.scopus.error.message).toContain('401');
      expect(session.databases.scopus.error.message).toMatch(/invalid|expired/i);
    });

    it('should mark scopus as failed with actionable 403 error in session', async () => {
      // Mock ScopusProvider to simulate 403 access denied during search
      const { ScopusProvider } = await import('../scopus/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ScopusProvider).mockImplementationOnce(() => ({
        name: 'scopus',
        translateQuery: vi.fn().mockReturnValue({
          native: 'TITLE-ABS-KEY(diabetes)',
          provider: 'scopus',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            const error = Object.assign(
              new Error(
                'Scopus API access denied (HTTP 403). Your key may lack permissions for this resource.'
              ),
              { code: 'ACCESS_DENIED', retryable: false }
            );
            throw error;
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({
          ok: false,
          error: 'Scopus API access denied (HTTP 403). Your key may lack permissions for this resource.',
        }),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = false;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = 'key-without-permissions';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      warnSpy.mockRestore();

      expect(result.success).toBe(false);
      expect(result.sessionId).toBeDefined();

      // The error message should contain the 403-specific information
      expect(result.error).toContain('scopus');
      expect(result.error).toContain('403');
      expect(result.error).toContain('access denied');

      // Verify session.yaml reflects the failure
      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);

      expect(session.databases.scopus.status).toBe('failed');
      expect(session.databases.scopus.error).toBeDefined();
      expect(session.databases.scopus.error.message).toContain('403');
      expect(session.databases.scopus.error.message).toMatch(/access denied|permissions/i);
    });

    it('should succeed with other providers when scopus fails with auth error', async () => {
      // Mock ScopusProvider to simulate 401 failure
      const { ScopusProvider } = await import('../scopus/provider.js');
      // @ts-expect-error - Mocking only the properties we need for testing
      vi.mocked(ScopusProvider).mockImplementationOnce(() => ({
        name: 'scopus',
        translateQuery: vi.fn().mockReturnValue({
          native: 'TITLE-ABS-KEY(diabetes)',
          provider: 'scopus',
        }),
        search: vi.fn().mockReturnValue({
          async next() {
            throw new Error(
              'Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/'
            );
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
        testConnection: vi.fn().mockResolvedValue({
          ok: false,
          error: 'Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/',
        }),
      }));

      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = false;
      config.providers.arxiv.enabled = false;
      config.providers.scopus.enabled = true;
      config.providers.scopus.api_key = 'invalid-key';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await executeSearch(
        { queryFile: queryPath },
        ctx.sessionsDir,
        config,
        false
      );

      warnSpy.mockRestore();

      // Overall search should succeed because PubMed worked
      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']?.retrieved).toBe(1);
      expect(result.results?.['scopus']?.error).toContain('401');

      // Verify session reflects partial success
      const sessionPath = join(ctx.sessionsDir, result.sessionId!, 'session.yaml');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = parseYaml(sessionContent);

      expect(session.databases.pubmed.status).toBe('completed');
      expect(session.databases.scopus.status).toBe('failed');
      expect(session.summary.status).toBe('partial');
    });
  });
});
