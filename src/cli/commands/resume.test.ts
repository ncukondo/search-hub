import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseResumeOptions,
  validateResumeInput,
  getResumableProvidersForCommand,
  type ResumeCommandOptions,
} from './resume.js';
import type { SessionFile, DatabaseStatus } from '../../session/types.js';

// Mock the session manager
vi.mock('../../session/manager.js', () => ({
  loadSession: vi.fn(),
  getResumableProviders: vi.fn(),
}));

import { loadSession, getResumableProviders } from '../../session/manager.js';

const createMockSession = (databases: Record<string, DatabaseStatus>): SessionFile => ({
  version: 1,
  id: '20240115_test_abc123',
  name: 'test',
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  query: {
    file: 'test.yaml',
    hash: 'abc123',
    targets: ['pubmed', 'eric', 'arxiv'],
  },
  databases,
  summary: {
    totalHits: 1000,
    totalRetrieved: 500,
    status: 'running',
  },
});

describe('resume command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseResumeOptions', () => {
    it('should parse session id', () => {
      const result = parseResumeOptions('20240115_test_abc123', {});

      expect(result.sessionId).toBe('20240115_test_abc123');
    });

    it('should parse provider filter', () => {
      const result = parseResumeOptions('session-id', {
        db: 'pubmed,eric',
      });

      expect(result.providers).toEqual(['pubmed', 'eric']);
    });

    it('should parse retry-failed option', () => {
      const result = parseResumeOptions('session-id', {
        retryFailed: true,
      });

      expect(result.retryFailed).toBe(true);
    });
  });

  describe('validateResumeInput', () => {
    it('should accept valid session id', () => {
      const options: ResumeCommandOptions = {
        sessionId: '20240115_test_abc123',
      };

      const result = validateResumeInput(options);

      expect(result.valid).toBe(true);
    });

    it('should reject empty session id', () => {
      const options: ResumeCommandOptions = {
        sessionId: '',
      };

      const result = validateResumeInput(options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('session');
    });

    it('should reject missing session id', () => {
      const options: ResumeCommandOptions = {} as ResumeCommandOptions;

      const result = validateResumeInput(options);

      expect(result.valid).toBe(false);
    });
  });

  describe('getResumableProvidersForCommand', () => {
    it('should return all resumable providers by default', async () => {
      const mockSession = createMockSession({
        pubmed: {
          status: 'in_progress',
          totalHits: 500,
          retrievedCount: 250,
          files: { query: 'q.txt', results: 'r.jsonl' },
          pagination: { cursor: null, pageNumber: 2, isComplete: false },
        },
        eric: {
          status: 'pending',
          files: { query: 'q.txt', results: 'r.jsonl' },
        },
      });

      vi.mocked(loadSession).mockResolvedValue(mockSession);
      vi.mocked(getResumableProviders).mockReturnValue([
        { provider: 'pubmed', strategy: 'continue', pageNumber: 2 },
        { provider: 'eric', strategy: 'fresh' },
      ]);

      const result = await getResumableProvidersForCommand(
        '20240115_test_abc123',
        '/sessions',
        {}
      );

      expect(result.success).toBe(true);
      expect(result.providers).toHaveLength(2);
    });

    it('should filter by specific providers', async () => {
      const mockSession = createMockSession({
        pubmed: {
          status: 'in_progress',
          totalHits: 500,
          retrievedCount: 250,
          files: { query: 'q.txt', results: 'r.jsonl' },
        },
        eric: {
          status: 'pending',
          files: { query: 'q.txt', results: 'r.jsonl' },
        },
      });

      vi.mocked(loadSession).mockResolvedValue(mockSession);
      vi.mocked(getResumableProviders).mockReturnValue([
        { provider: 'pubmed', strategy: 'continue' },
        { provider: 'eric', strategy: 'fresh' },
      ]);

      const result = await getResumableProvidersForCommand(
        '20240115_test_abc123',
        '/sessions',
        { providers: ['eric'] }
      );

      expect(result.success).toBe(true);
      expect(result.providers).toHaveLength(1);
      expect(result.providers![0]!.provider).toBe('eric');
    });

    it('should include failed providers when retryFailed is true', async () => {
      const mockSession = createMockSession({
        pubmed: {
          status: 'failed',
          totalHits: 500,
          retrievedCount: 100,
          files: { query: 'q.txt', results: 'r.jsonl' },
          error: { code: 'NETWORK', message: 'Timeout', retryable: true },
        },
        eric: {
          status: 'completed',
          totalHits: 200,
          retrievedCount: 200,
          files: { query: 'q.txt', results: 'r.jsonl' },
        },
      });

      vi.mocked(loadSession).mockResolvedValue(mockSession);
      vi.mocked(getResumableProviders).mockReturnValue([
        { provider: 'pubmed', strategy: 'retry' },
      ]);

      const result = await getResumableProvidersForCommand(
        '20240115_test_abc123',
        '/sessions',
        { retryFailed: true }
      );

      expect(result.success).toBe(true);
      expect(result.providers).toHaveLength(1);
      expect(result.providers![0]!.strategy).toBe('retry');
    });

    it('should return error for non-existent session', async () => {
      vi.mocked(loadSession).mockRejectedValue(new Error('Session not found'));

      const result = await getResumableProvidersForCommand(
        'invalid-session',
        '/sessions',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject merged sessions', async () => {
      const mergedSession: SessionFile = {
        version: 1,
        id: '20260208_merged_abc123',
        name: 'merged',
        type: 'merge',
        createdAt: '2026-02-08T10:00:00Z',
        updatedAt: '2026-02-08T10:00:00Z',
        sources: [
          { id: 'session-a', name: 'a' },
          { id: 'session-b', name: 'b' },
        ],
        databases: {},
        summary: { totalHits: 0, totalRetrieved: 50, status: 'completed' },
      };

      vi.mocked(loadSession).mockResolvedValue(mergedSession);

      const result = await getResumableProvidersForCommand(
        '20260208_merged_abc123',
        '/sessions',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('merged session');
      expect(result.error).toContain('Cannot resume');
    });

    it('should return empty providers when nothing to resume', async () => {
      const mockSession = createMockSession({
        pubmed: {
          status: 'completed',
          totalHits: 500,
          retrievedCount: 500,
          files: { query: 'q.txt', results: 'r.jsonl' },
        },
      });

      vi.mocked(loadSession).mockResolvedValue(mockSession);
      vi.mocked(getResumableProviders).mockReturnValue([]);

      const result = await getResumableProvidersForCommand(
        '20240115_test_abc123',
        '/sessions',
        {}
      );

      expect(result.success).toBe(true);
      expect(result.providers).toHaveLength(0);
    });
  });
});
