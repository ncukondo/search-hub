import { describe, it, expect } from 'vitest';
import type {
  SessionStatus,
  DatabaseStatus,
  SessionFile,
  PaginationState,
  DatabaseError,
  LogEvent,
  ProviderName,
  SessionSource,
} from './types';
import { isMergedSession, isRelatedSession } from './types';
import type { SessionSeeds } from './types';

describe('Session Types', () => {
  describe('SessionStatus', () => {
    it('should allow valid session status values', () => {
      const statuses: SessionStatus[] = [
        'created',
        'running',
        'completed',
        'partial',
        'failed',
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  describe('ProviderName', () => {
    it('should allow valid provider names', () => {
      const providers: ProviderName[] = [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
        'wos',
        'embase',
      ];
      expect(providers).toHaveLength(6);
    });
  });

  describe('PaginationState', () => {
    it('should allow valid pagination state', () => {
      const pagination: PaginationState = {
        cursor: 'abc123',
        pageNumber: 1,
        isComplete: false,
      };
      expect(pagination.cursor).toBe('abc123');
      expect(pagination.pageNumber).toBe(1);
      expect(pagination.isComplete).toBe(false);
    });

    it('should allow null cursor', () => {
      const pagination: PaginationState = {
        cursor: null,
        pageNumber: 0,
        isComplete: true,
      };
      expect(pagination.cursor).toBeNull();
    });
  });

  describe('DatabaseError', () => {
    it('should allow valid error structure', () => {
      const error: DatabaseError = {
        code: 'RATE_LIMIT',
        message: 'Rate limit exceeded',
        retryable: true,
      };
      expect(error.code).toBe('RATE_LIMIT');
      expect(error.retryable).toBe(true);
    });
  });

  describe('DatabaseStatus', () => {
    it('should allow pending status', () => {
      const status: DatabaseStatus = {
        status: 'pending',
        files: {
          query: 'query_pubmed.txt',
          results: 'results_pubmed.jsonl',
        },
      };
      expect(status.status).toBe('pending');
    });

    it('should allow in_progress status with pagination', () => {
      const status: DatabaseStatus = {
        status: 'in_progress',
        startedAt: '2024-01-15T10:00:00Z',
        totalHits: 500,
        retrievedCount: 100,
        pagination: {
          cursor: 'next_page_token',
          pageNumber: 2,
          isComplete: false,
        },
        files: {
          query: 'query_pubmed.txt',
          results: 'results_pubmed.jsonl',
        },
      };
      expect(status.pagination?.cursor).toBe('next_page_token');
    });

    it('should allow completed status', () => {
      const status: DatabaseStatus = {
        status: 'completed',
        startedAt: '2024-01-15T10:00:00Z',
        completedAt: '2024-01-15T10:05:00Z',
        totalHits: 500,
        retrievedCount: 500,
        files: {
          query: 'query_pubmed.txt',
          results: 'results_pubmed.jsonl',
        },
      };
      expect(status.completedAt).toBeDefined();
    });

    it('should allow failed status with error', () => {
      const status: DatabaseStatus = {
        status: 'failed',
        startedAt: '2024-01-15T10:00:00Z',
        error: {
          code: 'API_ERROR',
          message: 'API returned 500',
          retryable: true,
        },
        files: {
          query: 'query_pubmed.txt',
          results: 'results_pubmed.jsonl',
        },
      };
      expect(status.error?.retryable).toBe(true);
    });
  });

  describe('SessionFile', () => {
    it('should allow valid session file structure', () => {
      const session: SessionFile = {
        version: 1,
        id: '20240115_diabetes-ai-scoping_a3f2c1',
        name: 'diabetes-ai-scoping',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        query: {
          file: '/path/to/query.yaml',
          hash: 'a3f2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
          targets: ['pubmed', 'eric'],
        },
        databases: {
          pubmed: {
            status: 'pending',
            files: {
              query: 'query_pubmed.txt',
              results: 'results_pubmed.jsonl',
            },
          },
          eric: {
            status: 'pending',
            files: {
              query: 'query_eric.txt',
              results: 'results_eric.jsonl',
            },
          },
        },
        summary: {
          totalHits: 0,
          totalRetrieved: 0,
          status: 'created',
        },
      };
      expect(session.version).toBe(1);
      expect(session.query!.targets).toContain('pubmed');
    });

    it('should allow optional description', () => {
      const session: SessionFile = {
        version: 1,
        id: '20240115_test_abc123',
        name: 'test',
        description: 'A test session',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        query: {
          file: '/path/to/query.yaml',
          hash: 'abc123',
          targets: ['pubmed'],
        },
        databases: {},
        summary: {
          totalHits: 0,
          totalRetrieved: 0,
          status: 'created',
        },
      };
      expect(session.description).toBe('A test session');
    });
  });

  describe('SessionSource', () => {
    it('should allow valid session source structure', () => {
      const source: SessionSource = {
        id: '20260208_wba-v4_ff6c52',
        name: 'wba-v4',
      };
      expect(source.id).toBe('20260208_wba-v4_ff6c52');
      expect(source.name).toBe('wba-v4');
    });
  });

  describe('Merged SessionFile', () => {
    it('should allow merged session with type and sources', () => {
      const session: SessionFile = {
        version: 1,
        id: '20260208_wba-merged_abc123',
        name: 'wba-merged',
        type: 'merge',
        createdAt: '2026-02-08T10:00:00Z',
        updatedAt: '2026-02-08T10:00:00Z',
        sources: [
          { id: '20260208_wba-v4_ff6c52', name: 'wba-v4' },
          { id: '20260208_wba-v9_251b24', name: 'wba-v9' },
        ],
        databases: {
          pubmed: {
            status: 'completed',
            retrievedCount: 95,
            files: {
              query: '',
              results: 'pubmed_results.jsonl',
              resultsYaml: 'pubmed_results.yaml',
            },
          },
        },
        summary: {
          totalHits: 0,
          totalRetrieved: 95,
          status: 'completed',
        },
      };
      expect(session.type).toBe('merge');
      expect(session.sources).toHaveLength(2);
      expect(session.sources![0]!.id).toBe('20260208_wba-v4_ff6c52');
    });

    it('should allow search session without type field', () => {
      const session: SessionFile = {
        version: 1,
        id: '20240115_test_abc123',
        name: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        query: {
          file: '/path/to/query.yaml',
          hash: 'abc123',
          targets: ['pubmed'],
        },
        databases: {},
        summary: {
          totalHits: 0,
          totalRetrieved: 0,
          status: 'created',
        },
      };
      expect(session.type).toBeUndefined();
      expect(session.sources).toBeUndefined();
    });
  });

  describe('isMergedSession', () => {
    it('should return true for merged sessions', () => {
      const session: SessionFile = {
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
        summary: { totalHits: 0, totalRetrieved: 0, status: 'completed' },
      };
      expect(isMergedSession(session)).toBe(true);
    });

    it('should return false for regular search sessions', () => {
      const session: SessionFile = {
        version: 1,
        id: '20240115_test_abc123',
        name: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        query: {
          file: '/path/to/query.yaml',
          hash: 'abc123',
          targets: ['pubmed'],
        },
        databases: {},
        summary: { totalHits: 0, totalRetrieved: 0, status: 'created' },
      };
      expect(isMergedSession(session)).toBe(false);
    });

    it('should return false for sessions with type search', () => {
      const session: SessionFile = {
        version: 1,
        id: '20240115_test_abc123',
        name: 'test',
        type: 'search',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        query: {
          file: '/path/to/query.yaml',
          hash: 'abc123',
          targets: ['pubmed'],
        },
        databases: {},
        summary: { totalHits: 0, totalRetrieved: 0, status: 'created' },
      };
      expect(isMergedSession(session)).toBe(false);
    });
  });

  describe('Related SessionFile', () => {
    it('should allow related session with type and seeds', () => {
      const session: SessionFile = {
        version: 1,
        id: '20260216_related-test_abc123',
        name: 'related-test',
        type: 'related',
        createdAt: '2026-02-16T10:00:00Z',
        updatedAt: '2026-02-16T10:00:00Z',
        seeds: {
          ids: ['12345678', '23456789'],
        },
        databases: {
          pubmed: {
            status: 'completed',
            retrievedCount: 20,
            files: {
              query: '',
              results: 'results_pubmed.jsonl',
              resultsYaml: 'results_pubmed.yaml',
            },
          },
        },
        summary: {
          totalHits: 0,
          totalRetrieved: 20,
          status: 'completed',
        },
      };
      expect(session.type).toBe('related');
      expect(session.seeds).toBeDefined();
      expect(session.seeds!.ids).toEqual(['12345678', '23456789']);
    });

    it('should allow seeds with sourceSession', () => {
      const seeds: SessionSeeds = {
        ids: ['12345678'],
        sourceSession: 'session-abc',
      };
      expect(seeds.sourceSession).toBe('session-abc');
    });

    it('should allow seeds without sourceSession', () => {
      const seeds: SessionSeeds = {
        ids: ['12345678', '23456789'],
      };
      expect(seeds.sourceSession).toBeUndefined();
    });
  });

  describe('isRelatedSession', () => {
    it('should return true for related sessions', () => {
      const session: SessionFile = {
        version: 1,
        id: '20260216_related_abc123',
        name: 'related',
        type: 'related',
        createdAt: '2026-02-16T10:00:00Z',
        updatedAt: '2026-02-16T10:00:00Z',
        seeds: { ids: ['12345678'] },
        databases: {},
        summary: { totalHits: 0, totalRetrieved: 0, status: 'completed' },
      };
      expect(isRelatedSession(session)).toBe(true);
    });

    it('should return false for search sessions', () => {
      const session: SessionFile = {
        version: 1,
        id: '20240115_test_abc123',
        name: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        databases: {},
        summary: { totalHits: 0, totalRetrieved: 0, status: 'created' },
      };
      expect(isRelatedSession(session)).toBe(false);
    });

    it('should return false for merged sessions', () => {
      const session: SessionFile = {
        version: 1,
        id: '20260208_merged_abc123',
        name: 'merged',
        type: 'merge',
        createdAt: '2026-02-08T10:00:00Z',
        updatedAt: '2026-02-08T10:00:00Z',
        databases: {},
        summary: { totalHits: 0, totalRetrieved: 0, status: 'completed' },
      };
      expect(isRelatedSession(session)).toBe(false);
    });
  });

  describe('LogEvent', () => {
    it('should allow session_created event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'session_created',
        data: { id: 'session-id', query: 'query.yaml' },
      };
      expect(event.event).toBe('session_created');
    });

    it('should allow search_started event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'search_started',
        provider: 'pubmed',
      };
      expect(event.provider).toBe('pubmed');
    });

    it('should allow page_fetched event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'page_fetched',
        provider: 'pubmed',
        page: 1,
        count: 100,
        cursor: 'next_cursor',
      };
      expect(event.page).toBe(1);
      expect(event.count).toBe(100);
    });

    it('should allow rate_limited event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'rate_limited',
        provider: 'pubmed',
        waitMs: 1000,
      };
      expect(event.waitMs).toBe(1000);
    });

    it('should allow retry event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'retry',
        provider: 'pubmed',
        attempt: 2,
        reason: 'API timeout',
      };
      expect(event.attempt).toBe(2);
    });

    it('should allow search_completed event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'search_completed',
        provider: 'pubmed',
        total: 500,
        duration: 60000,
      };
      expect(event.total).toBe(500);
    });

    it('should allow search_failed event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'search_failed',
        provider: 'pubmed',
        error: 'API returned 500',
      };
      expect(event.error).toBe('API returned 500');
    });

    it('should allow session_completed event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'session_completed',
        summary: { totalHits: 1000, totalRetrieved: 1000 },
      };
      expect(event.summary?.totalHits).toBe(1000);
    });

    it('should allow session_resumed event', () => {
      const event: LogEvent = {
        ts: '2024-01-15T10:00:00Z',
        event: 'session_resumed',
        fromProvider: 'eric',
        fromPage: 3,
      };
      expect(event.fromProvider).toBe('eric');
      expect(event.fromPage).toBe(3);
    });
  });
});
