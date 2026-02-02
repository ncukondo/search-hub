import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listSessionsForDisplay,
  getSessionDetails,
  formatSessionList,
  formatSessionDetails,
  type SessionListItem,
  type SessionDetails,
} from './status.js';
import type { SessionFile, SessionSummary, DatabaseStatus } from '../../session/types.js';

// Mock the session manager
vi.mock('../../session/manager.js', () => ({
  listSessions: vi.fn(),
  loadSession: vi.fn(),
}));

import { listSessions, loadSession } from '../../session/manager.js';

const mockSessionSummary: SessionSummary = {
  id: '20240115_diabetes-ai_a3f2c1',
  name: 'diabetes-ai',
  status: 'running',
  createdAt: '2024-01-15T10:30:00Z',
  totalHits: 1500,
  totalRetrieved: 800,
};

const mockCompletedSummary: SessionSummary = {
  id: '20240114_cancer-ml_b4g3d2',
  name: 'cancer-ml',
  status: 'completed',
  createdAt: '2024-01-14T09:00:00Z',
  totalHits: 500,
  totalRetrieved: 500,
};

const mockDatabaseStatus: DatabaseStatus = {
  status: 'completed',
  totalHits: 750,
  retrievedCount: 750,
  startedAt: '2024-01-15T10:31:00Z',
  completedAt: '2024-01-15T10:45:00Z',
  files: {
    query: 'pubmed_query.txt',
    results: 'pubmed_results.jsonl',
  },
  pagination: {
    cursor: null,
    pageNumber: 2,
    isComplete: true,
  },
};

const mockFailedDbStatus: DatabaseStatus = {
  status: 'failed',
  totalHits: 500,
  retrievedCount: 200,
  startedAt: '2024-01-15T10:31:00Z',
  files: {
    query: 'arxiv_query.txt',
    results: 'arxiv_results.jsonl',
  },
  pagination: {
    cursor: 'page2cursor',
    pageNumber: 1,
    isComplete: false,
  },
  error: {
    code: 'NETWORK_ERROR',
    message: 'Connection timeout',
    retryable: true,
  },
};

const mockSessionFile: SessionFile = {
  version: 1,
  id: '20240115_diabetes-ai_a3f2c1',
  name: 'diabetes-ai',
  description: 'Search for diabetes AI studies',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:45:00Z',
  query: {
    file: 'diabetes-ai.yaml',
    hash: 'abc123',
    targets: ['pubmed', 'arxiv'],
  },
  databases: {
    pubmed: mockDatabaseStatus,
    arxiv: mockFailedDbStatus,
  },
  summary: {
    totalHits: 1250,
    totalRetrieved: 950,
    status: 'running',
  },
};

describe('status command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listSessionsForDisplay', () => {
    it('should return list of sessions from session manager', async () => {
      vi.mocked(listSessions).mockResolvedValue([mockSessionSummary, mockCompletedSummary]);

      const result = await listSessionsForDisplay('/sessions', { all: true });

      expect(listSessions).toHaveBeenCalledWith('/sessions');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('20240115_diabetes-ai_a3f2c1');
    });

    it('should filter out completed sessions when all is false', async () => {
      vi.mocked(listSessions).mockResolvedValue([mockSessionSummary, mockCompletedSummary]);

      const result = await listSessionsForDisplay('/sessions', { all: false });

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('running');
    });

    it('should include completed sessions when all is true', async () => {
      vi.mocked(listSessions).mockResolvedValue([mockSessionSummary, mockCompletedSummary]);

      const result = await listSessionsForDisplay('/sessions', { all: true });

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no sessions exist', async () => {
      vi.mocked(listSessions).mockResolvedValue([]);

      const result = await listSessionsForDisplay('/sessions', { all: true });

      expect(result).toEqual([]);
    });
  });

  describe('getSessionDetails', () => {
    it('should load and return session details', async () => {
      vi.mocked(loadSession).mockResolvedValue(mockSessionFile);

      const result = await getSessionDetails('20240115_diabetes-ai_a3f2c1', '/sessions');

      expect(loadSession).toHaveBeenCalledWith('20240115_diabetes-ai_a3f2c1', '/sessions');
      expect(result.success).toBe(true);
      expect(result.session!.id).toBe('20240115_diabetes-ai_a3f2c1');
      expect(result.session!.databases).toHaveLength(2);
    });

    it('should return error for non-existent session', async () => {
      vi.mocked(loadSession).mockRejectedValue(new Error('Session not found: invalid-id'));

      const result = await getSessionDetails('invalid-id', '/sessions');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should include database status details', async () => {
      vi.mocked(loadSession).mockResolvedValue(mockSessionFile);

      const result = await getSessionDetails('20240115_diabetes-ai_a3f2c1', '/sessions');

      expect(result.session!.databases).toContainEqual(
        expect.objectContaining({
          provider: 'pubmed',
          status: 'completed',
          totalHits: 750,
          retrievedCount: 750,
        })
      );
      expect(result.session!.databases).toContainEqual(
        expect.objectContaining({
          provider: 'arxiv',
          status: 'failed',
          error: 'Connection timeout',
        })
      );
    });
  });

  describe('formatSessionList', () => {
    it('should format sessions as human-readable table', () => {
      const sessions: SessionListItem[] = [
        {
          id: '20240115_diabetes-ai_a3f2c1',
          name: 'diabetes-ai',
          status: 'running',
          createdAt: '2024-01-15T10:30:00Z',
          progress: '800/1500',
        },
      ];

      const result = formatSessionList(sessions, { json: false });

      expect(result).toContain('diabetes-ai');
      expect(result).toContain('running');
      expect(result).toContain('800/1500');
    });

    it('should format sessions as JSON when json option is true', () => {
      const sessions: SessionListItem[] = [
        {
          id: '20240115_diabetes-ai_a3f2c1',
          name: 'diabetes-ai',
          status: 'running',
          createdAt: '2024-01-15T10:30:00Z',
          progress: '800/1500',
        },
      ];

      const result = formatSessionList(sessions, { json: true });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('20240115_diabetes-ai_a3f2c1');
    });

    it('should return "No sessions found" message when empty', () => {
      const result = formatSessionList([], { json: false });

      expect(result).toContain('No sessions found');
    });

    it('should return empty array JSON when empty and json option is true', () => {
      const result = formatSessionList([], { json: true });

      expect(JSON.parse(result)).toEqual([]);
    });
  });

  describe('formatSessionDetails', () => {
    it('should format session details as human-readable output', () => {
      const details: SessionDetails = {
        id: '20240115_diabetes-ai_a3f2c1',
        name: 'diabetes-ai',
        description: 'Search for diabetes AI studies',
        status: 'running',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:45:00Z',
        queryFile: 'diabetes-ai.yaml',
        totalHits: 1250,
        totalRetrieved: 950,
        databases: [
          {
            provider: 'pubmed',
            status: 'completed',
            totalHits: 750,
            retrievedCount: 750,
          },
          {
            provider: 'arxiv',
            status: 'failed',
            totalHits: 500,
            retrievedCount: 200,
            error: 'Connection timeout',
          },
        ],
      };

      const result = formatSessionDetails(details, { json: false });

      expect(result).toContain('diabetes-ai');
      expect(result).toContain('running');
      expect(result).toContain('pubmed');
      expect(result).toContain('arxiv');
      expect(result).toContain('completed');
      expect(result).toContain('failed');
    });

    it('should format session details as JSON when json option is true', () => {
      const details: SessionDetails = {
        id: '20240115_diabetes-ai_a3f2c1',
        name: 'diabetes-ai',
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:45:00Z',
        queryFile: 'diabetes-ai.yaml',
        totalHits: 500,
        totalRetrieved: 500,
        databases: [],
      };

      const result = formatSessionDetails(details, { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe('20240115_diabetes-ai_a3f2c1');
      expect(parsed.name).toBe('diabetes-ai');
    });

    it('should show deduplication stats when uniqueArticles is provided', () => {
      const details: SessionDetails = {
        id: '20240115_diabetes-ai_a3f2c1',
        name: 'diabetes-ai',
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:45:00Z',
        queryFile: 'diabetes-ai.yaml',
        totalHits: 500,
        totalRetrieved: 150,
        databases: [],
        uniqueArticles: 142,
        duplicatesRemoved: 8,
      };

      const result = formatSessionDetails(details, { json: false });

      expect(result).toContain('150 raw');
      expect(result).toContain('142 unique');
      expect(result).toContain('8 duplicates');
    });

    it('should not show dedup info when uniqueArticles equals totalRetrieved', () => {
      const details: SessionDetails = {
        id: '20240115_diabetes-ai_a3f2c1',
        name: 'diabetes-ai',
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:45:00Z',
        queryFile: 'diabetes-ai.yaml',
        totalHits: 500,
        totalRetrieved: 150,
        databases: [],
        uniqueArticles: 150,
        duplicatesRemoved: 0,
      };

      const result = formatSessionDetails(details, { json: false });

      expect(result).toContain('150/500 results');
      expect(result).not.toContain('duplicates');
    });
  });
});
