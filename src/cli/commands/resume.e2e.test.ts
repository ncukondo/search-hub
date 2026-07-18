/**
 * E2E Tests for `search-hub resume` command
 *
 * Tests the resume command functionality:
 * - Resumes interrupted sessions
 * - --db resumes specific database only
 * - --retry-failed retries failed databases
 * - Error for non-existent session
 * - Error for already-completed session (unless --retry-failed)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import {
  parseResumeOptions,
  validateResumeInput,
  getResumableProvidersForCommand,
} from './resume.js';

// Mock provider modules before importing executeResume
vi.mock('../../providers/pubmed/provider.js', () => ({
  PubMedProvider: vi.fn().mockImplementation(() => ({
    name: 'pubmed',
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Resumed Article 1',
        authors: [{ family: 'Smith', given: 'John' }],
        pmid: '99999991',
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
      };
      yield {
        title: 'Resumed Article 2',
        authors: [{ family: 'Doe', given: 'Jane' }],
        pmid: '99999992',
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
      };
    }),
    resumeSearch: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Continued Article',
        authors: [{ family: 'Continue', given: 'Test' }],
        pmid: '99999993',
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../../providers/eric/provider.js', () => ({
  ERICProvider: vi.fn().mockImplementation(() => ({
    name: 'eric',
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'ERIC Resumed',
        authors: [{ family: 'Teacher', given: 'Mary' }],
        ericId: 'ED999999',
        source: 'eric',
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../../providers/arxiv/provider.js', () => ({
  ArxivProvider: vi.fn().mockImplementation(() => ({
    name: 'arxiv',
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'arXiv Resumed',
        authors: [{ family: 'Chen', given: 'Wei' }],
        arxivId: '2401.99999',
        source: 'arxiv',
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

vi.mock('../../providers/scopus/provider.js', () => ({
  ScopusProvider: vi.fn().mockImplementation(() => ({
    name: 'scopus',
    search: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Scopus Resumed',
        authors: [{ family: 'Lee', given: 'James' }],
        scopusId: 'SCOPUS-999999',
        source: 'scopus',
        retrievedAt: new Date().toISOString(),
      };
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

// Import after mocking
const { executeResume } = await import('./resume-executor.js');
const { getDefaultConfig } = await import('../../config/index.js');

describe('search-hub resume E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  /**
   * Helper to create a test session with specific provider status
   */
  async function createTestSession(
    id: string,
    options: {
      name?: string;
      status?: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed';
      databases?: Record<
        string,
        {
          status: string;
          totalHits?: number;
          retrievedCount?: number;
          files?: { query: string; results: string };
          error?: { code: string; message: string; retryable?: boolean };
          pagination?: { cursor?: string; pageNumber?: number };
        }
      >;
    } = {},
  ): Promise<string> {
    const sessionDir = join(ctx.sessionsDir, id);
    await mkdir(sessionDir, { recursive: true });

    const databases = options.databases ?? {
      pubmed: {
        status: options.status ?? 'in_progress',
        totalHits: 100,
        retrievedCount: 50,
        files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
      },
    };

    // Calculate summary from databases
    let totalHits = 0;
    let totalRetrieved = 0;
    for (const db of Object.values(databases)) {
      totalHits += db.totalHits ?? 0;
      totalRetrieved += db.retrievedCount ?? 0;
    }

    const session = {
      id,
      name: options.name ?? 'Test Session',
      description: 'A test session for resume E2E testing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query: {
        file: 'test-query.yaml',
        hash: 'abc123',
        content: 'name: test\nquery: []',
      },
      databases,
      summary: {
        status: options.status ?? 'in_progress',
        totalHits,
        totalRetrieved,
      },
    };

    await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');

    // Create query files for each database
    for (const [provider, dbStatus] of Object.entries(databases)) {
      if (dbStatus.files?.query) {
        await writeFile(
          join(sessionDir, dbStatus.files.query),
          `${provider} native query string`,
          'utf-8',
        );
      }
      if (dbStatus.files?.results) {
        // Create empty results file
        await writeFile(join(sessionDir, dbStatus.files.results), '', 'utf-8');
      }
    }

    return id;
  }

  describe('parseResumeOptions', () => {
    it('should parse session ID', () => {
      const options = parseResumeOptions('session-001', {});

      expect(options.sessionId).toBe('session-001');
    });

    it('should parse --db option', () => {
      const options = parseResumeOptions('session-001', { db: 'pubmed' });

      expect(options.providers).toEqual(['pubmed']);
    });

    it('should parse multiple --db values', () => {
      const options = parseResumeOptions('session-001', { db: 'pubmed,eric' });

      expect(options.providers).toContain('pubmed');
      expect(options.providers).toContain('eric');
    });

    it('should parse --retry-failed flag', () => {
      const options = parseResumeOptions('session-001', { retryFailed: true });

      expect(options.retryFailed).toBe(true);
    });
  });

  describe('validateResumeInput', () => {
    it('should require session ID', () => {
      const result = validateResumeInput({ sessionId: '' });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('session ID');
    });

    it('should accept valid session ID', () => {
      const result = validateResumeInput({ sessionId: 'session-001' });

      expect(result.valid).toBe(true);
    });
  });

  describe('getResumableProvidersForCommand', () => {
    it('should return resumable providers for in_progress session', async () => {
      await createTestSession('session-in-progress', {
        status: 'in_progress',
        databases: {
          pubmed: {
            status: 'in_progress',
            totalHits: 100,
            retrievedCount: 50,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
          },
        },
      });

      const result = await getResumableProvidersForCommand(
        'session-in-progress',
        ctx.sessionsDir,
        {},
      );

      expect(result.success).toBe(true);
      expect(result.providers).toBeDefined();
      expect(result.providers!.length).toBeGreaterThan(0);
    });

    it('should return failed providers with retry strategy', async () => {
      await createTestSession('session-with-failure', {
        status: 'partial',
        databases: {
          pubmed: {
            status: 'completed',
            totalHits: 100,
            retrievedCount: 100,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
          },
          eric: {
            status: 'failed',
            totalHits: 0,
            retrievedCount: 0,
            files: { query: 'eric_query.txt', results: 'eric_results.jsonl' },
            error: { code: 'NETWORK_ERROR', message: 'Connection timeout', retryable: true },
          },
        },
      });

      const result = await getResumableProvidersForCommand(
        'session-with-failure',
        ctx.sessionsDir,
        { retryFailed: true },
      );

      expect(result.success).toBe(true);
      expect(result.providers!.some((p) => p.provider === 'eric')).toBe(true);
    });

    it('should return error for non-existent session', async () => {
      const result = await getResumableProvidersForCommand(
        'nonexistent-session',
        ctx.sessionsDir,
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should filter by specific provider with --db', async () => {
      await createTestSession('session-multi-db', {
        status: 'in_progress',
        databases: {
          pubmed: {
            status: 'in_progress',
            totalHits: 100,
            retrievedCount: 50,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
          },
          eric: {
            status: 'in_progress',
            totalHits: 50,
            retrievedCount: 25,
            files: { query: 'eric_query.txt', results: 'eric_results.jsonl' },
          },
        },
      });

      const result = await getResumableProvidersForCommand('session-multi-db', ctx.sessionsDir, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.providers!.length).toBe(1);
      expect(result.providers![0]!.provider).toBe('pubmed');
    });
  });

  describe('executeResume', () => {
    it('should resume interrupted session', async () => {
      await createTestSession('session-to-resume', {
        status: 'in_progress',
        databases: {
          pubmed: {
            status: 'in_progress',
            totalHits: 100,
            retrievedCount: 50,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
          },
        },
      });

      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;

      const result = await executeResume(
        { sessionId: 'session-to-resume' },
        ctx.sessionsDir,
        config,
        false,
      );

      expect(result.success).toBe(true);
      expect(result.resumed).toBeGreaterThan(0);
    });

    it('should resume only specified provider with --db', async () => {
      await createTestSession('session-multi-resume', {
        status: 'in_progress',
        databases: {
          pubmed: {
            status: 'in_progress',
            totalHits: 100,
            retrievedCount: 50,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
          },
          eric: {
            status: 'in_progress',
            totalHits: 50,
            retrievedCount: 25,
            files: { query: 'eric_query.txt', results: 'eric_results.jsonl' },
          },
        },
      });

      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      const result = await executeResume(
        { sessionId: 'session-multi-resume', providers: ['pubmed'] },
        ctx.sessionsDir,
        config,
        false,
      );

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']).toBeDefined();
      // ERIC should not be resumed since we specified only pubmed
      expect(result.results?.['eric']).toBeUndefined();
    });

    it('should retry failed databases with --retry-failed', async () => {
      await createTestSession('session-retry-failed', {
        status: 'partial',
        databases: {
          pubmed: {
            status: 'completed',
            totalHits: 100,
            retrievedCount: 100,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
          },
          eric: {
            status: 'failed',
            totalHits: 0,
            retrievedCount: 0,
            files: { query: 'eric_query.txt', results: 'eric_results.jsonl' },
            error: { code: 'NETWORK_ERROR', message: 'Connection timeout', retryable: true },
          },
        },
      });

      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      const result = await executeResume(
        { sessionId: 'session-retry-failed', retryFailed: true },
        ctx.sessionsDir,
        config,
        false,
      );

      expect(result.success).toBe(true);
      expect(result.resumed).toBeGreaterThan(0);
      expect(result.results?.['eric']).toBeDefined();
      // PubMed should not be in results because it was already completed
      expect(result.results?.['pubmed']).toBeUndefined();
    });

    it('should return error for non-existent session', async () => {
      const config = getDefaultConfig();

      const result = await executeResume(
        { sessionId: 'nonexistent-session-id' },
        ctx.sessionsDir,
        config,
        false,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load session');
    });

    it('should return no providers for completed session without --retry-failed', async () => {
      await createTestSession('session-completed', {
        status: 'completed',
        databases: {
          pubmed: {
            status: 'completed',
            totalHits: 100,
            retrievedCount: 100,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
          },
        },
      });

      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;

      const result = await executeResume(
        { sessionId: 'session-completed' },
        ctx.sessionsDir,
        config,
        false,
      );

      // Should succeed but with 0 resumed (nothing to resume)
      expect(result.success).toBe(true);
      expect(result.resumed).toBe(0);
      expect(result.error).toBe('No providers to resume');
    });
  });

  describe('integration: resume workflow', () => {
    it('should complete a full resume workflow', async () => {
      // Create a partially completed session
      await createTestSession('workflow-session', {
        name: 'Resume Workflow Test',
        status: 'partial',
        databases: {
          pubmed: {
            status: 'in_progress',
            totalHits: 100,
            retrievedCount: 50,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
            pagination: { pageNumber: 3 },
          },
          eric: {
            status: 'failed',
            totalHits: 0,
            retrievedCount: 0,
            files: { query: 'eric_query.txt', results: 'eric_results.jsonl' },
            error: { code: 'TIMEOUT', message: 'Request timeout', retryable: true },
          },
        },
      });

      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      // Resume all resumable providers
      const result = await executeResume(
        { sessionId: 'workflow-session' },
        ctx.sessionsDir,
        config,
        false,
      );

      expect(result.success).toBe(true);
      expect(result.resumed).toBeGreaterThan(0);
    });

    it('should handle session with only failed providers', async () => {
      await createTestSession('all-failed-session', {
        status: 'failed',
        databases: {
          pubmed: {
            status: 'failed',
            totalHits: 0,
            retrievedCount: 0,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
            error: { code: 'API_ERROR', message: 'API unavailable', retryable: true },
          },
          eric: {
            status: 'failed',
            totalHits: 0,
            retrievedCount: 0,
            files: { query: 'eric_query.txt', results: 'eric_results.jsonl' },
            error: { code: 'NETWORK_ERROR', message: 'Connection refused', retryable: true },
          },
        },
      });

      const config = getDefaultConfig();
      config.providers.pubmed.enabled = true;
      config.providers.eric.enabled = true;

      // Resume with --retry-failed
      const result = await executeResume(
        { sessionId: 'all-failed-session', retryFailed: true },
        ctx.sessionsDir,
        config,
        false,
      );

      // Both providers should be retried
      expect(result.resumed).toBe(2);
    });
  });
});
