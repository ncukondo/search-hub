/**
 * Tests for resume-executor.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResumeCommandOptions } from './resume.js';
import type { Config } from '../../config/index.js';
import { getDefaultConfig } from '../../config/index.js';
import type { Article } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';

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
    resumeSearch: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Resumed Article',
        authors: [{ family: 'Resume', given: 'Test' }],
        pmid: '99999',
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
    resumeSearch: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Resumed ERIC Article',
        authors: [{ family: 'Resume', given: 'ERIC' }],
        ericId: 'ED999999',
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
    resumeSearch: vi.fn().mockImplementation(async function* () {
      // No results for resume
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
    resumeSearch: vi.fn().mockImplementation(async function* () {
      yield {
        title: 'Resumed Scopus Article',
        authors: [{ family: 'Resume', given: 'Scopus' }],
        scopusId: 'SCOPUS999',
        source: 'scopus',
        retrievedAt: new Date().toISOString(),
      } as Article;
    }),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));

// Import after mocking
const { executeResume } = await import('./resume-executor.js');

describe('resume-executor', () => {
  let tempDir: string;
  let sessionsDir: string;
  let sessionId: string;
  let config: Config;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'search-hub-resume-test-'));
    sessionsDir = join(tempDir, 'sessions');
    sessionId = '20260107_test-session_abc123';
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    // Create a test session file with in_progress provider
    const session: SessionFile = {
      version: 1,
      id: sessionId,
      name: 'test-session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query: {
        file: 'test-query.yaml',
        hash: 'abc123',
        targets: ['pubmed'],
      },
      databases: {
        pubmed: {
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          totalHits: 100,
          retrievedCount: 50,
          files: {
            query: 'pubmed_query.txt',
            results: 'pubmed_results.jsonl',
          },
          pagination: {
            cursor: null,
            pageNumber: 5,
            isComplete: false,
          },
        },
      },
      summary: {
        totalHits: 100,
        totalRetrieved: 50,
        status: 'running',
      },
    };
    await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');

    // Create query file
    await writeFile(join(sessionDir, 'pubmed_query.txt'), 'diabetes[tiab]', 'utf-8');

    // Create results file with some existing results
    await writeFile(join(sessionDir, 'pubmed_results.jsonl'), '', 'utf-8');

    config = getDefaultConfig();
    config.providers.pubmed.enabled = true;
    config.providers.eric.enabled = false;
    config.providers.arxiv.enabled = false;
    config.providers.scopus.enabled = false;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('executeResume', () => {
    it('should resume an interrupted session', async () => {
      const options: ResumeCommandOptions = {
        sessionId,
      };

      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(true);
      expect(result.resumed).toBe(1);
      expect(result.results?.['pubmed']).toBeDefined();
    });

    it('should return error for non-existent session', async () => {
      const options: ResumeCommandOptions = {
        sessionId: 'nonexistent-session',
      };

      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load session');
    });

    it('should handle session with no resumable providers', async () => {
      // Update session to have completed provider
      const sessionDir = join(sessionsDir, sessionId);
      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'test-session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        query: {
          file: 'test-query.yaml',
          hash: 'abc123',
          targets: ['pubmed'],
        },
        databases: {
          pubmed: {
            status: 'completed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            totalHits: 100,
            retrievedCount: 100,
            files: {
              query: 'pubmed_query.txt',
              results: 'pubmed_results.jsonl',
            },
          },
        },
        summary: {
          totalHits: 100,
          totalRetrieved: 100,
          status: 'completed',
        },
      };
      await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');

      const options: ResumeCommandOptions = {
        sessionId,
      };

      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(true);
      expect(result.resumed).toBe(0);
      expect(result.error).toBe('No providers to resume');
    });

    it('should retry failed providers with retryFailed option', async () => {
      // Update session to have failed provider
      const sessionDir = join(sessionsDir, sessionId);
      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'test-session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        query: {
          file: 'test-query.yaml',
          hash: 'abc123',
          targets: ['pubmed'],
        },
        databases: {
          pubmed: {
            status: 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            totalHits: 0,
            retrievedCount: 0,
            files: {
              query: 'pubmed_query.txt',
              results: 'pubmed_results.jsonl',
            },
            error: {
              code: 'NETWORK_ERROR',
              message: 'Connection failed',
              retryable: true,
            },
          },
        },
        summary: {
          totalHits: 0,
          totalRetrieved: 0,
          status: 'failed',
        },
      };
      await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');

      const options: ResumeCommandOptions = {
        sessionId,
        retryFailed: true,
      };

      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(true);
      expect(result.resumed).toBe(1);
    });

    it('should filter by specific providers', async () => {
      // Add another provider to session
      const sessionDir = join(sessionsDir, sessionId);
      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'test-session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        query: {
          file: 'test-query.yaml',
          hash: 'abc123',
          targets: ['pubmed', 'eric'],
        },
        databases: {
          pubmed: {
            status: 'in_progress',
            startedAt: new Date().toISOString(),
            totalHits: 100,
            retrievedCount: 50,
            files: {
              query: 'pubmed_query.txt',
              results: 'pubmed_results.jsonl',
            },
          },
          eric: {
            status: 'in_progress',
            startedAt: new Date().toISOString(),
            totalHits: 50,
            retrievedCount: 25,
            files: {
              query: 'eric_query.txt',
              results: 'eric_results.jsonl',
            },
          },
        },
        summary: {
          totalHits: 150,
          totalRetrieved: 75,
          status: 'running',
        },
      };
      await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
      await writeFile(join(sessionDir, 'eric_query.txt'), 'diabetes', 'utf-8');
      await writeFile(join(sessionDir, 'eric_results.jsonl'), '', 'utf-8');

      config.providers.eric.enabled = true;

      const options: ResumeCommandOptions = {
        sessionId,
        providers: ['pubmed'],
      };

      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(true);
      expect(result.resumed).toBe(1);
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['eric']).toBeUndefined();
    });

    it('should update session status on completion', async () => {
      const options: ResumeCommandOptions = {
        sessionId,
      };

      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(true);

      // Check session file was updated
      const sessionPath = join(sessionsDir, sessionId, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(sessionContent);

      expect(session.databases.pubmed.status).toBe('completed');
    });


    it('should extract error message from ProviderError plain objects', async () => {
      // Override PubMed mock to throw a plain ProviderError object (not an Error instance)
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
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
        resumeSearch: vi.fn().mockImplementation(async function* () {
          throw {
            code: 'NETWORK_ERROR',
            message: 'Connection refused to PubMed API',
            provider: 'pubmed',
            retryable: true,
          };
        }),
        testConnection: vi.fn().mockResolvedValue(true),
      }) as any);

      // Update session to have failed provider for retry
      const sessionDir = join(sessionsDir, sessionId);
      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'test-session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        query: {
          file: 'test-query.yaml',
          hash: 'abc123',
          targets: ['pubmed'],
        },
        databases: {
          pubmed: {
            status: 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            totalHits: 0,
            retrievedCount: 0,
            files: {
              query: 'pubmed_query.txt',
              results: 'pubmed_results.jsonl',
            },
            error: {
              code: 'NETWORK_ERROR',
              message: 'Previous failure',
              retryable: true,
            },
          },
        },
        summary: {
          totalHits: 0,
          totalRetrieved: 0,
          status: 'failed',
        },
      };
      await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');

      const options: ResumeCommandOptions = {
        sessionId,
        retryFailed: true,
      };

      await executeResume(options, sessionsDir, config, false);

      // Restore original mock implementation
      if (originalImpl) {
        mockedPubMed.mockImplementation(originalImpl);
      }

      // Check that the session file records the actual error message, not [object Object]
      const sessionPath = join(sessionsDir, sessionId, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const updatedSession = JSON.parse(sessionContent);

      expect(updatedSession.databases.pubmed.status).toBe('failed');
      expect(updatedSession.databases.pubmed.error.message).not.toBe('[object Object]');
      expect(updatedSession.databases.pubmed.error.message).toBe('Connection refused to PubMed API');
    });

    it('should mark session as failed when resumed provider throws an error', async () => {
      // The existing ProviderError test (above) already verifies that when a provider
      // throws an error during resume, the session database status is set to 'failed'.
      // Here we verify that the overall session status is also 'failed' and the result
      // reflects the error properly via the error field in results.
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      const originalImpl = mockedPubMed.getMockImplementation();
      mockedPubMed.mockImplementation(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'pubmed' }),
        search: vi.fn().mockImplementation(async function* () {
          throw new Error('API rate limit exceeded');
        }),
        resumeSearch: vi.fn().mockImplementation(async function* () {
          throw new Error('API rate limit exceeded');
        }),
        testConnection: vi.fn().mockResolvedValue(true),
      }) as any);

      // Update session to have failed provider for retry
      const sessionDir = join(sessionsDir, sessionId);
      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'test-session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        query: { file: 'test-query.yaml', hash: 'abc123', targets: ['pubmed'] },
        databases: {
          pubmed: {
            status: 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            totalHits: 0,
            retrievedCount: 0,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
            error: { code: 'NETWORK_ERROR', message: 'Previous failure', retryable: true },
          },
        },
        summary: { totalHits: 0, totalRetrieved: 0, status: 'failed' },
      };
      await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');

      const options: ResumeCommandOptions = { sessionId, retryFailed: true };
      const result = await executeResume(options, sessionsDir, config, false);

      // Restore original mock
      if (originalImpl) {
        mockedPubMed.mockImplementation(originalImpl);
      }

      // Verify session file shows failed status
      const sessionPath = join(sessionsDir, sessionId, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const updatedSession = JSON.parse(sessionContent);
      expect(updatedSession.databases.pubmed.status).toBe('failed');
      expect(updatedSession.summary.status).toBe('failed');
      expect(updatedSession.databases.pubmed.error.message).toBe('API rate limit exceeded');
    });

    it('should mark session as completed when resumed provider returns 0 results without error', async () => {
      // Override PubMed mock to return 0 results (no error)
      const { PubMedProvider } = await import('../../providers/pubmed/provider.js');
      const mockedPubMed = vi.mocked(PubMedProvider);
      mockedPubMed.mockImplementationOnce(() => ({
        name: 'pubmed',
        translateQuery: vi.fn().mockReturnValue({ native: 'test query', provider: 'pubmed' }),
        search: vi.fn().mockImplementation(async function* () {
          // Yield nothing - legitimate zero results
        }),
        resumeSearch: vi.fn().mockImplementation(async function* () {
          // Yield nothing - legitimate zero results
        }),
        testConnection: vi.fn().mockResolvedValue(true),
      }) as any);

      // Update session to have failed provider for retry
      const sessionDir = join(sessionsDir, sessionId);
      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'test-session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        query: { file: 'test-query.yaml', hash: 'abc123', targets: ['pubmed'] },
        databases: {
          pubmed: {
            status: 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            totalHits: 0,
            retrievedCount: 0,
            files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
            error: { code: 'NETWORK_ERROR', message: 'Previous failure', retryable: true },
          },
        },
        summary: { totalHits: 0, totalRetrieved: 0, status: 'failed' },
      };
      await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');

      const options: ResumeCommandOptions = { sessionId, retryFailed: true };
      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(true);
      expect(result.results?.['pubmed']).toBeDefined();
      expect(result.results?.['pubmed']?.retrieved).toBe(0);
      expect(result.results?.['pubmed']?.error).toBeUndefined();

      const sessionPath = join(sessionsDir, sessionId, 'session.json');
      const sessionContent = await readFile(sessionPath, 'utf-8');
      const updatedSession = JSON.parse(sessionContent);
      expect(updatedSession.summary.status).toBe('completed');
    });

    it('should append results to existing results file', async () => {
      // Add existing results
      const resultsPath = join(sessionsDir, sessionId, 'pubmed_results.jsonl');
      const existingResult = { title: 'Existing', authors: [], pmid: '00001', source: 'pubmed', retrievedAt: new Date().toISOString() };
      await writeFile(resultsPath, JSON.stringify(existingResult) + '\n', 'utf-8');

      const options: ResumeCommandOptions = {
        sessionId,
      };

      const result = await executeResume(options, sessionsDir, config, false);

      expect(result.success).toBe(true);

      // Check results file has both old and new results
      const resultsContent = await readFile(resultsPath, 'utf-8');
      const lines = resultsContent.trim().split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });
  });
});
