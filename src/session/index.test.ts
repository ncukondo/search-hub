import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  // Types
  type ProviderName,
  // Manager functions
  createSession,
  loadSession,
  listSessions,
  sessionExists,
  saveSession,
  updateDatabaseStatus,
  updateSessionStatus,
  getResumableProviders,
  generateSessionId,
  sanitizeName,
  // Logger
  SessionLogger,
} from './index';

describe('Session Module', () => {
  describe('exports', () => {
    it('should export all manager functions', () => {
      expect(createSession).toBeDefined();
      expect(loadSession).toBeDefined();
      expect(listSessions).toBeDefined();
      expect(sessionExists).toBeDefined();
      expect(saveSession).toBeDefined();
      expect(updateDatabaseStatus).toBeDefined();
      expect(updateSessionStatus).toBeDefined();
      expect(getResumableProviders).toBeDefined();
      expect(generateSessionId).toBeDefined();
      expect(sanitizeName).toBeDefined();
    });

    it('should export SessionLogger class', () => {
      expect(SessionLogger).toBeDefined();
      expect(typeof SessionLogger).toBe('function');
    });

    it('should allow creating SessionLogger instance', () => {
      const logger = new SessionLogger('/tmp/test.jsonl');
      expect(logger).toBeInstanceOf(SessionLogger);
    });
  });

  describe('end-to-end workflow', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-e2e-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should support complete workflow: create -> update -> load', async () => {
      // Step 1: Create session
      const session = await createSession({
        name: 'E2E Test',
        description: 'End-to-end test session',
        queryFile: '/path/to/query.yaml',
        queryContent: 'name: E2E Test\nterms:\n  - test',
        queryHash: 'e2e123456789',
        targets: ['pubmed', 'eric'] as ProviderName[],
        sessionsDir: testDir,
      });

      expect(session.id).toContain('e2e-test');
      expect(session.summary.status).toBe('created');

      // Step 2: Update session status
      await updateSessionStatus(session.id, 'running', testDir);

      // Step 3: Update database status
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          totalHits: 500,
        },
        testDir
      );

      // Step 4: Update pagination state
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          pagination: {
            cursor: 'next-page-token',
            pageNumber: 2,
            isComplete: false,
          },
          retrievedCount: 200,
        },
        testDir
      );

      // Step 5: Load and verify
      const loaded = await loadSession(session.id, testDir);
      expect(loaded.summary.status).toBe('running');
      expect(loaded.databases.pubmed?.status).toBe('in_progress');
      expect(loaded.databases.pubmed?.totalHits).toBe(500);
      expect(loaded.databases.pubmed?.pagination?.cursor).toBe('next-page-token');

      // Step 6: Check resumable providers
      const resumable = getResumableProviders(loaded);
      const pubmedResumable = resumable.find((r) => r.provider === 'pubmed');
      expect(pubmedResumable?.strategy).toBe('continue');
      expect(pubmedResumable?.cursor).toBe('next-page-token');

      const ericResumable = resumable.find((r) => r.provider === 'eric');
      expect(ericResumable?.strategy).toBe('fresh');

      // Step 7: Complete a database
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'completed',
          completedAt: new Date().toISOString(),
          retrievedCount: 500,
          pagination: {
            cursor: null,
            pageNumber: 5,
            isComplete: true,
          },
        },
        testDir
      );

      // Step 8: Verify completion
      const final = await loadSession(session.id, testDir);
      expect(final.databases.pubmed?.status).toBe('completed');
      expect(final.summary.totalRetrieved).toBe(500);

      // Step 9: Verify session listing
      const sessions = await listSessions(testDir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.name).toBe('E2E Test');

      // Step 10: Verify session exists
      const exists = await sessionExists(session.id, testDir);
      expect(exists).toBe(true);

      const notExists = await sessionExists('nonexistent-id', testDir);
      expect(notExists).toBe(false);
    });
  });
});
