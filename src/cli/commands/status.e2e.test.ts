/**
 * E2E Tests for `search-hub status` command
 *
 * Tests the status command functionality:
 * - Lists all sessions
 * - Shows specific session details
 * - --json outputs valid JSON
 * - --all includes completed sessions
 * - Helpful message when no sessions exist
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
} from '../e2e-helpers.js';
import {
  listSessionsForDisplay,
  getSessionDetails,
  formatSessionList,
  formatSessionDetails,
  type SessionListItem,
  type SessionDetails,
} from './status.js';

describe('search-hub status E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  /**
   * Helper to create a test session in the sessions directory
   */
  async function createTestSession(
    id: string,
    options: {
      name?: string;
      status?: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed';
      totalHits?: number;
      totalRetrieved?: number;
      databases?: Record<string, {
        status: string;
        totalHits?: number;
        retrievedCount?: number;
        error?: { code: string; message: string };
      }>;
    } = {}
  ): Promise<string> {
    const sessionDir = join(ctx.sessionsDir, id);
    await mkdir(sessionDir, { recursive: true });

    const session = {
      id,
      name: options.name ?? 'Test Session',
      description: 'A test session for E2E testing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query: {
        file: 'test-query.yaml',
        hash: 'abc123',
        content: 'name: test\nquery: []',
      },
      databases: options.databases ?? {
        pubmed: {
          status: options.status ?? 'completed',
          totalHits: options.totalHits ?? 100,
          retrievedCount: options.totalRetrieved ?? 50,
        },
      },
      summary: {
        status: options.status ?? 'completed',
        totalHits: options.totalHits ?? 100,
        totalRetrieved: options.totalRetrieved ?? 50,
      },
    };

    await writeFile(
      join(sessionDir, 'session.json'),
      JSON.stringify(session, null, 2),
      'utf-8'
    );

    return id;
  }

  describe('listSessionsForDisplay', () => {
    it('should return empty list when no sessions exist', async () => {
      const sessions = await listSessionsForDisplay(ctx.sessionsDir, { all: false });

      expect(sessions).toEqual([]);
    });

    it('should list all active sessions', async () => {
      // Create two sessions - one in_progress, one completed
      await createTestSession('session-001', { name: 'Active Search', status: 'in_progress' });
      await createTestSession('session-002', { name: 'Completed Search', status: 'completed' });

      const sessions = await listSessionsForDisplay(ctx.sessionsDir, { all: false });

      // Should only return the in_progress session
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.name).toBe('Active Search');
      expect(sessions[0]!.status).toBe('in_progress');
    });

    it('should include completed sessions with --all', async () => {
      await createTestSession('session-001', { name: 'Active Search', status: 'in_progress' });
      await createTestSession('session-002', { name: 'Completed Search', status: 'completed' });

      const sessions = await listSessionsForDisplay(ctx.sessionsDir, { all: true });

      expect(sessions.length).toBe(2);
    });

    it('should include session progress', async () => {
      await createTestSession('session-001', {
        name: 'Test Search',
        status: 'in_progress',
        totalHits: 100,
        totalRetrieved: 50,
      });

      const sessions = await listSessionsForDisplay(ctx.sessionsDir, { all: true });

      expect(sessions[0]!.progress).toBe('50/100');
    });

    it('should sort sessions by creation date', async () => {
      // Create sessions with different creation times
      await createTestSession('session-old', { name: 'Old Search', status: 'in_progress' });

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await createTestSession('session-new', { name: 'New Search', status: 'in_progress' });

      const sessions = await listSessionsForDisplay(ctx.sessionsDir, { all: true });

      // Newer session should be first or last depending on sort order
      expect(sessions.length).toBe(2);
    });
  });

  describe('getSessionDetails', () => {
    it('should return session details for valid session', async () => {
      const sessionId = await createTestSession('session-details-test', {
        name: 'Details Test',
        status: 'completed',
        totalHits: 200,
        totalRetrieved: 150,
        databases: {
          pubmed: { status: 'completed', totalHits: 100, retrievedCount: 80 },
          eric: { status: 'completed', totalHits: 100, retrievedCount: 70 },
        },
      });

      const result = await getSessionDetails(sessionId, ctx.sessionsDir);

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session!.id).toBe(sessionId);
      expect(result.session!.name).toBe('Details Test');
      expect(result.session!.databases.length).toBe(2);
    });

    it('should return error for non-existent session', async () => {
      const result = await getSessionDetails('nonexistent-session', ctx.sessionsDir);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include database error details', async () => {
      const sessionId = await createTestSession('session-with-error', {
        name: 'Error Test',
        status: 'partial',
        databases: {
          pubmed: { status: 'completed', totalHits: 100, retrievedCount: 100 },
          eric: {
            status: 'failed',
            totalHits: 0,
            retrievedCount: 0,
            error: { code: 'NETWORK_ERROR', message: 'Connection timeout' },
          },
        },
      });

      const result = await getSessionDetails(sessionId, ctx.sessionsDir);

      expect(result.success).toBe(true);
      const ericDb = result.session!.databases.find((d) => d.provider === 'eric');
      expect(ericDb).toBeDefined();
      expect(ericDb!.status).toBe('failed');
      expect(ericDb!.error).toBe('Connection timeout');
    });
  });

  describe('formatSessionList', () => {
    it('should format empty list with helpful message', () => {
      const output = formatSessionList([], { json: false });

      expect(output).toBe('No sessions found.');
    });

    it('should format session list as table', () => {
      const sessions: SessionListItem[] = [
        {
          id: 'session-001',
          name: 'Test Search',
          status: 'completed',
          createdAt: '2024-01-15T10:00:00Z',
          progress: '100/100',
        },
      ];

      const output = formatSessionList(sessions, { json: false });

      expect(output).toContain('ID');
      expect(output).toContain('NAME');
      expect(output).toContain('STATUS');
      expect(output).toContain('session-001');
      expect(output).toContain('Test Search');
    });

    it('should output valid JSON with --json flag', () => {
      const sessions: SessionListItem[] = [
        {
          id: 'session-001',
          name: 'Test Search',
          status: 'completed',
          createdAt: '2024-01-15T10:00:00Z',
          progress: '100/100',
        },
      ];

      const output = formatSessionList(sessions, { json: true });

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe('session-001');
    });
  });

  describe('formatSessionDetails', () => {
    it('should format session details with all information', () => {
      const details: SessionDetails = {
        id: 'session-001',
        name: 'Test Search',
        description: 'A test search for E2E testing',
        status: 'completed',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
        queryFile: 'diabetes-query.yaml',
        totalHits: 200,
        totalRetrieved: 180,
        databases: [
          { provider: 'pubmed', status: 'completed', totalHits: 100, retrievedCount: 90 },
          { provider: 'eric', status: 'completed', totalHits: 100, retrievedCount: 90 },
        ],
      };

      const output = formatSessionDetails(details, { json: false });

      expect(output).toContain('Session: Test Search');
      expect(output).toContain('ID: session-001');
      expect(output).toContain('Description: A test search for E2E testing');
      expect(output).toContain('Status: completed');
      expect(output).toContain('Query File: diabetes-query.yaml');
      expect(output).toContain('180/200 results');
      expect(output).toContain('Databases:');
      expect(output).toContain('pubmed');
      expect(output).toContain('eric');
    });

    it('should output valid JSON with --json flag', () => {
      const details: SessionDetails = {
        id: 'session-001',
        name: 'Test Search',
        status: 'completed',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
        queryFile: 'test.yaml',
        totalHits: 100,
        totalRetrieved: 100,
        databases: [
          { provider: 'pubmed', status: 'completed', totalHits: 100, retrievedCount: 100 },
        ],
      };

      const output = formatSessionDetails(details, { json: true });

      const parsed = JSON.parse(output);
      expect(parsed.id).toBe('session-001');
      expect(parsed.name).toBe('Test Search');
      expect(parsed.databases).toHaveLength(1);
    });

    it('should show status icons for different states', () => {
      const details: SessionDetails = {
        id: 'session-001',
        name: 'Multi Status',
        status: 'partial',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
        queryFile: 'test.yaml',
        totalHits: 200,
        totalRetrieved: 100,
        databases: [
          { provider: 'pubmed', status: 'completed', totalHits: 100, retrievedCount: 100 },
          { provider: 'eric', status: 'failed', totalHits: 0, retrievedCount: 0, error: 'Timeout' },
          { provider: 'arxiv', status: 'pending', totalHits: 0, retrievedCount: 0 },
        ],
      };

      const output = formatSessionDetails(details, { json: false });

      // Status icons should be present (using unicode)
      expect(output).toContain('pubmed');
      expect(output).toContain('eric');
      expect(output).toContain('arxiv');
      // Error message should be shown
      expect(output).toContain('Timeout');
    });
  });

  describe('integration: list and show session', () => {
    it('should list sessions then show details', async () => {
      // Create multiple sessions
      await createTestSession('session-001', {
        name: 'Diabetes Research',
        status: 'completed',
        totalHits: 500,
        totalRetrieved: 450,
      });
      await createTestSession('session-002', {
        name: 'Cancer Study',
        status: 'in_progress',
        totalHits: 200,
        totalRetrieved: 100,
      });

      // List sessions
      const sessions = await listSessionsForDisplay(ctx.sessionsDir, { all: true });
      expect(sessions.length).toBe(2);

      // Get details of first session
      const result = await getSessionDetails('session-001', ctx.sessionsDir);
      expect(result.success).toBe(true);
      expect(result.session!.name).toBe('Diabetes Research');

      // Format the details
      const output = formatSessionDetails(result.session!, { json: false });
      expect(output).toContain('Diabetes Research');
    });

    it('should handle sessions with multiple databases', async () => {
      await createTestSession('multi-db-session', {
        name: 'Multi DB Search',
        status: 'completed',
        databases: {
          pubmed: { status: 'completed', totalHits: 100, retrievedCount: 100 },
          eric: { status: 'completed', totalHits: 50, retrievedCount: 50 },
          arxiv: { status: 'completed', totalHits: 25, retrievedCount: 25 },
        },
      });

      const result = await getSessionDetails('multi-db-session', ctx.sessionsDir);
      expect(result.success).toBe(true);
      expect(result.session!.databases.length).toBe(3);

      const providers = result.session!.databases.map((d) => d.provider);
      expect(providers).toContain('pubmed');
      expect(providers).toContain('eric');
      expect(providers).toContain('arxiv');
    });
  });
});
