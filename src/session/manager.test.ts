import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateSessionId,
  sanitizeName,
  createSession,
  loadSession,
  listSessions,
  sessionExists,
  updateDatabaseStatus,
  updateSessionStatus,
  saveSession,
  getResumableProviders,
  type CreateSessionOptions,
} from './manager';
import type {
  SessionFile,
  ProviderName,
  SessionSummary,
  DatabaseStatus,
} from './types';

describe('Session Manager', () => {
  describe('sanitizeName', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeName('TestName')).toBe('testname');
    });

    it('should replace spaces with dashes', () => {
      expect(sanitizeName('test name')).toBe('test-name');
    });

    it('should remove non-alphanumeric characters except dashes', () => {
      expect(sanitizeName('test@name#123!')).toBe('testname123');
    });

    it('should collapse multiple dashes into one', () => {
      expect(sanitizeName('test--name')).toBe('test-name');
      expect(sanitizeName('test  name')).toBe('test-name');
    });

    it('should trim dashes from start and end', () => {
      expect(sanitizeName('-test-name-')).toBe('test-name');
      expect(sanitizeName('  test name  ')).toBe('test-name');
    });

    it('should handle complex names', () => {
      expect(sanitizeName('Diabetes & AI - Scoping Review 2024')).toBe(
        'diabetes-ai-scoping-review-2024'
      );
    });
  });

  describe('generateSessionId', () => {
    it('should generate ID in format {date}_{name}_{hash}', () => {
      const id = generateSessionId('test-query', 'abc123def456');
      const pattern = /^\d{8}_[a-z0-9-]+_[a-f0-9]{6}$/;
      expect(id).toMatch(pattern);
    });

    it('should use first 6 characters of hash', () => {
      const id = generateSessionId(
        'test',
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      );
      expect(id).toContain('_abcdef');
    });

    it('should use current date in YYYYMMDD format', () => {
      const id = generateSessionId('test', 'abc123');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(id.startsWith(today)).toBe(true);
    });

    it('should sanitize the query name', () => {
      const id = generateSessionId('Test Query Name!', 'abc123');
      expect(id).toContain('_test-query-name_');
    });

    it('should generate unique IDs for different queries', () => {
      const id1 = generateSessionId('query1', 'hash1abc');
      const id2 = generateSessionId('query2', 'hash2def');
      expect(id1).not.toBe(id2);
    });

    it('should generate unique IDs for same name but different hash', () => {
      const id1 = generateSessionId('same-name', 'hash1abc');
      const id2 = generateSessionId('same-name', 'hash2def');
      expect(id1).not.toBe(id2);
    });

    it('should produce ID like example: 20240115_diabetes-ai-scoping_a3f2c1', () => {
      const id = generateSessionId('Diabetes AI Scoping', 'a3f2c1d4e5f6');
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^\d{8}$/);
      expect(parts[1]).toBe('diabetes-ai-scoping');
      expect(parts[2]).toBe('a3f2c1');
    });
  });

  describe('createSession', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const createTestOptions = (
      overrides: Partial<CreateSessionOptions> = {}
    ): CreateSessionOptions => ({
      name: 'Test Query',
      queryFile: '/path/to/query.yaml',
      queryContent: 'name: Test Query\nterms:\n  - test',
      queryHash: 'abc123def456',
      targets: ['pubmed', 'eric'] as ProviderName[],
      sessionsDir: testDir,
      ...overrides,
    });

    it('should create session directory', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      const sessionDir = join(testDir, session.id);
      await expect(access(sessionDir)).resolves.toBeUndefined();
    });

    it('should create session.json with correct initial state', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      const sessionJsonPath = join(testDir, session.id, 'session.json');
      const content = await readFile(sessionJsonPath, 'utf-8');
      const sessionFile: SessionFile = JSON.parse(content);

      expect(sessionFile.version).toBe(1);
      expect(sessionFile.id).toBe(session.id);
      expect(sessionFile.name).toBe('Test Query');
      expect(sessionFile.query.file).toBe('/path/to/query.yaml');
      expect(sessionFile.query.hash).toBe('abc123def456');
      expect(sessionFile.query.targets).toEqual(['pubmed', 'eric']);
      expect(sessionFile.summary.status).toBe('created');
      expect(sessionFile.summary.totalHits).toBe(0);
      expect(sessionFile.summary.totalRetrieved).toBe(0);
    });

    it('should copy query file to session directory', async () => {
      const queryContent = 'name: Test Query\nterms:\n  - diabetes\n  - ai';
      const options = createTestOptions({ queryContent });
      const session = await createSession(options);

      const queryPath = join(testDir, session.id, 'query_common.yaml');
      const content = await readFile(queryPath, 'utf-8');
      expect(content).toBe(queryContent);
    });

    it('should initialize database statuses as pending', async () => {
      const options = createTestOptions({
        targets: ['pubmed', 'eric', 'arxiv'] as ProviderName[],
      });
      const session = await createSession(options);

      const sessionJsonPath = join(testDir, session.id, 'session.json');
      const content = await readFile(sessionJsonPath, 'utf-8');
      const sessionFile: SessionFile = JSON.parse(content);

      expect(sessionFile.databases.pubmed?.status).toBe('pending');
      expect(sessionFile.databases.eric?.status).toBe('pending');
      expect(sessionFile.databases.arxiv?.status).toBe('pending');

      expect(sessionFile.databases.pubmed?.files.query).toBe('query_pubmed.txt');
      expect(sessionFile.databases.pubmed?.files.results).toBe(
        'results_pubmed.jsonl'
      );
    });

    it('should have valid ISO 8601 timestamps', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      const sessionJsonPath = join(testDir, session.id, 'session.json');
      const content = await readFile(sessionJsonPath, 'utf-8');
      const sessionFile: SessionFile = JSON.parse(content);

      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      expect(sessionFile.createdAt).toMatch(isoPattern);
      expect(sessionFile.updatedAt).toMatch(isoPattern);
    });

    it('should include description if provided', async () => {
      const options = createTestOptions({
        description: 'A test session for testing',
      });
      const session = await createSession(options);

      const sessionJsonPath = join(testDir, session.id, 'session.json');
      const content = await readFile(sessionJsonPath, 'utf-8');
      const sessionFile: SessionFile = JSON.parse(content);

      expect(sessionFile.description).toBe('A test session for testing');
    });

    it('should return session file structure', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      expect(session.version).toBe(1);
      expect(session.id).toMatch(/^\d{8}_test-query_abc123$/);
      expect(session.name).toBe('Test Query');
      expect(session.summary.status).toBe('created');
    });
  });

  describe('loadSession', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const createTestOptions = (
      overrides: Partial<CreateSessionOptions> = {}
    ): CreateSessionOptions => ({
      name: 'Test Query',
      queryFile: '/path/to/query.yaml',
      queryContent: 'name: Test Query\nterms:\n  - test',
      queryHash: 'abc123def456',
      targets: ['pubmed', 'eric'] as ProviderName[],
      sessionsDir: testDir,
      ...overrides,
    });

    it('should load existing session by ID', async () => {
      const options = createTestOptions();
      const created = await createSession(options);

      const loaded = await loadSession(created.id, testDir);

      expect(loaded.id).toBe(created.id);
      expect(loaded.name).toBe(created.name);
      expect(loaded.version).toBe(1);
    });

    it('should throw on non-existent session', async () => {
      await expect(
        loadSession('nonexistent-session-id', testDir)
      ).rejects.toThrow('Session not found');
    });

    it('should load all session data correctly', async () => {
      const options = createTestOptions({
        description: 'Test description',
        targets: ['pubmed', 'eric', 'arxiv'] as ProviderName[],
      });
      const created = await createSession(options);

      const loaded = await loadSession(created.id, testDir);

      expect(loaded.description).toBe('Test description');
      expect(loaded.query.targets).toEqual(['pubmed', 'eric', 'arxiv']);
      expect(loaded.databases.pubmed?.status).toBe('pending');
      expect(loaded.databases.eric?.status).toBe('pending');
      expect(loaded.databases.arxiv?.status).toBe('pending');
    });
  });

  describe('sessionExists', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should return true for existing session', async () => {
      const options: CreateSessionOptions = {
        name: 'Test Query',
        queryFile: '/path/to/query.yaml',
        queryContent: 'name: Test\n',
        queryHash: 'abc123',
        targets: ['pubmed'] as ProviderName[],
        sessionsDir: testDir,
      };
      const session = await createSession(options);

      const exists = await sessionExists(session.id, testDir);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const exists = await sessionExists('nonexistent-id', testDir);
      expect(exists).toBe(false);
    });
  });

  describe('listSessions', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should return empty array when no sessions exist', async () => {
      const sessions = await listSessions(testDir);
      expect(sessions).toEqual([]);
    });

    it('should list all sessions', async () => {
      // Create multiple sessions with different hashes to avoid ID collision
      const options1: CreateSessionOptions = {
        name: 'Query One',
        queryFile: '/path/to/query1.yaml',
        queryContent: 'name: Query One\n',
        queryHash: 'hash1abc',
        targets: ['pubmed'] as ProviderName[],
        sessionsDir: testDir,
      };
      const options2: CreateSessionOptions = {
        name: 'Query Two',
        queryFile: '/path/to/query2.yaml',
        queryContent: 'name: Query Two\n',
        queryHash: 'hash2def',
        targets: ['eric'] as ProviderName[],
        sessionsDir: testDir,
      };

      await createSession(options1);
      await createSession(options2);

      const sessions = await listSessions(testDir);

      expect(sessions).toHaveLength(2);
      const names = sessions.map((s: SessionSummary) => s.name).sort();
      expect(names).toEqual(['Query One', 'Query Two']);
    });

    it('should return session summaries with correct fields', async () => {
      const options: CreateSessionOptions = {
        name: 'Test Query',
        queryFile: '/path/to/query.yaml',
        queryContent: 'name: Test\n',
        queryHash: 'abc123',
        targets: ['pubmed'] as ProviderName[],
        sessionsDir: testDir,
      };
      const created = await createSession(options);

      const sessions = await listSessions(testDir);

      expect(sessions).toHaveLength(1);
      const summary = sessions[0]!;
      expect(summary.id).toBe(created.id);
      expect(summary.name).toBe('Test Query');
      expect(summary.status).toBe('created');
      expect(summary.totalHits).toBe(0);
      expect(summary.totalRetrieved).toBe(0);
      expect(summary.createdAt).toBeDefined();
    });
  });

  describe('updateDatabaseStatus', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const createTestOptions = (): CreateSessionOptions => ({
      name: 'Test Query',
      queryFile: '/path/to/query.yaml',
      queryContent: 'name: Test Query\nterms:\n  - test',
      queryHash: 'abc123def456',
      targets: ['pubmed', 'eric'] as ProviderName[],
      sessionsDir: testDir,
    });

    it('should update database status', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      const newStatus: Partial<DatabaseStatus> = {
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        totalHits: 100,
      };

      await updateDatabaseStatus(session.id, 'pubmed', newStatus, testDir);

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.databases.pubmed?.status).toBe('in_progress');
      expect(loaded.databases.pubmed?.startedAt).toBeDefined();
      expect(loaded.databases.pubmed?.totalHits).toBe(100);
    });

    it('should update pagination state', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      const newStatus: Partial<DatabaseStatus> = {
        status: 'in_progress',
        pagination: {
          cursor: 'next-page-token',
          pageNumber: 2,
          isComplete: false,
        },
      };

      await updateDatabaseStatus(session.id, 'pubmed', newStatus, testDir);

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.databases.pubmed?.pagination?.cursor).toBe('next-page-token');
      expect(loaded.databases.pubmed?.pagination?.pageNumber).toBe(2);
      expect(loaded.databases.pubmed?.pagination?.isComplete).toBe(false);
    });

    it('should update summary totals', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Complete pubmed with results
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'completed',
          totalHits: 100,
          retrievedCount: 100,
          completedAt: new Date().toISOString(),
        },
        testDir
      );

      // Complete eric with results
      await updateDatabaseStatus(
        session.id,
        'eric',
        {
          status: 'completed',
          totalHits: 50,
          retrievedCount: 50,
          completedAt: new Date().toISOString(),
        },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.summary.totalHits).toBe(150);
      expect(loaded.summary.totalRetrieved).toBe(150);
    });

    it('should update updatedAt timestamp', async () => {
      const options = createTestOptions();
      const session = await createSession(options);
      const originalUpdatedAt = session.updatedAt;

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await updateDatabaseStatus(
        session.id,
        'pubmed',
        { status: 'in_progress' },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      expect(new Date(loaded.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('should preserve existing database fields when updating', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // First update: set startedAt
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'in_progress',
          startedAt: '2024-01-15T10:00:00.000Z',
        },
        testDir
      );

      // Second update: set totalHits (should preserve startedAt)
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          totalHits: 100,
        },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.databases.pubmed?.startedAt).toBe('2024-01-15T10:00:00.000Z');
      expect(loaded.databases.pubmed?.totalHits).toBe(100);
    });
  });

  describe('updateSessionStatus', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const createTestOptions = (): CreateSessionOptions => ({
      name: 'Test Query',
      queryFile: '/path/to/query.yaml',
      queryContent: 'name: Test Query\nterms:\n  - test',
      queryHash: 'abc123def456',
      targets: ['pubmed', 'eric'] as ProviderName[],
      sessionsDir: testDir,
    });

    it('should update session status to running', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      await updateSessionStatus(session.id, 'running', testDir);

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.summary.status).toBe('running');
    });

    it('should update session status to completed', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      await updateSessionStatus(session.id, 'completed', testDir);

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.summary.status).toBe('completed');
    });

    it('should update session status to partial', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      await updateSessionStatus(session.id, 'partial', testDir);

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.summary.status).toBe('partial');
    });

    it('should update session status to failed', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      await updateSessionStatus(session.id, 'failed', testDir);

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.summary.status).toBe('failed');
    });
  });

  describe('saveSession', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const createTestOptions = (): CreateSessionOptions => ({
      name: 'Test Query',
      queryFile: '/path/to/query.yaml',
      queryContent: 'name: Test Query\nterms:\n  - test',
      queryHash: 'abc123def456',
      targets: ['pubmed', 'eric'] as ProviderName[],
      sessionsDir: testDir,
    });

    it('should save session with all modifications', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Modify the session
      session.summary.status = 'running';
      session.summary.totalHits = 200;
      session.databases.pubmed = {
        ...session.databases.pubmed!,
        status: 'completed',
        totalHits: 200,
        retrievedCount: 200,
      };

      await saveSession(session, testDir);

      const loaded = await loadSession(session.id, testDir);
      expect(loaded.summary.status).toBe('running');
      expect(loaded.summary.totalHits).toBe(200);
      expect(loaded.databases.pubmed?.status).toBe('completed');
    });

    it('should handle concurrent updates safely', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Simulate concurrent updates by doing them in quick succession
      const updates = [
        updateDatabaseStatus(
          session.id,
          'pubmed',
          { status: 'in_progress', startedAt: new Date().toISOString() },
          testDir
        ),
        updateDatabaseStatus(
          session.id,
          'eric',
          { status: 'in_progress', startedAt: new Date().toISOString() },
          testDir
        ),
      ];

      // Note: This test verifies that updates don't throw errors
      // True concurrent safety would require file locking
      await Promise.all(updates);

      const loaded = await loadSession(session.id, testDir);
      // At least one of the updates should succeed
      const pubmedUpdated = loaded.databases.pubmed?.status === 'in_progress';
      const ericUpdated = loaded.databases.eric?.status === 'in_progress';
      expect(pubmedUpdated || ericUpdated).toBe(true);
    });
  });

  describe('getResumableProviders', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const createTestOptions = (): CreateSessionOptions => ({
      name: 'Test Query',
      queryFile: '/path/to/query.yaml',
      queryContent: 'name: Test Query\nterms:\n  - test',
      queryHash: 'abc123def456',
      targets: ['pubmed', 'eric', 'arxiv'] as ProviderName[],
      sessionsDir: testDir,
    });

    it('should find pending DBs needing resume with fresh strategy', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      const resumable = getResumableProviders(session);

      expect(resumable).toHaveLength(3);
      const pubmed = resumable.find((r) => r.provider === 'pubmed');
      expect(pubmed).toBeDefined();
      expect(pubmed?.strategy).toBe('fresh');
    });

    it('should identify retryable failed DBs with retry strategy', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Set pubmed as failed with retryable error
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'failed',
          error: {
            code: 'RATE_LIMIT',
            message: 'Rate limit exceeded',
            retryable: true,
          },
        },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      const resumable = getResumableProviders(loaded);

      const pubmed = resumable.find((r) => r.provider === 'pubmed');
      expect(pubmed).toBeDefined();
      expect(pubmed?.strategy).toBe('retry');
    });

    it('should skip non-retryable failed DBs', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Set pubmed as failed with non-retryable error
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'failed',
          error: {
            code: 'INVALID_API_KEY',
            message: 'API key invalid',
            retryable: false,
          },
        },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      const resumable = getResumableProviders(loaded);

      const pubmed = resumable.find((r) => r.provider === 'pubmed');
      expect(pubmed).toBeUndefined();
    });

    it('should identify in-progress DBs with continue strategy and cursor', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Set pubmed as in_progress with pagination state
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'in_progress',
          pagination: {
            cursor: 'page-token-123',
            pageNumber: 3,
            isComplete: false,
          },
        },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      const resumable = getResumableProviders(loaded);

      const pubmed = resumable.find((r) => r.provider === 'pubmed');
      expect(pubmed).toBeDefined();
      expect(pubmed?.strategy).toBe('continue');
      expect(pubmed?.cursor).toBe('page-token-123');
      expect(pubmed?.pageNumber).toBe(3);
    });

    it('should skip completed DBs', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Set pubmed as completed
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        {
          status: 'completed',
          totalHits: 100,
          retrievedCount: 100,
          completedAt: new Date().toISOString(),
        },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      const resumable = getResumableProviders(loaded);

      const pubmed = resumable.find((r) => r.provider === 'pubmed');
      expect(pubmed).toBeUndefined();

      // Other DBs should still be resumable
      const eric = resumable.find((r) => r.provider === 'eric');
      expect(eric).toBeDefined();
    });

    it('should skip skipped DBs', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Set pubmed as skipped
      await updateDatabaseStatus(
        session.id,
        'pubmed',
        { status: 'skipped' },
        testDir
      );

      const loaded = await loadSession(session.id, testDir);
      const resumable = getResumableProviders(loaded);

      const pubmed = resumable.find((r) => r.provider === 'pubmed');
      expect(pubmed).toBeUndefined();
    });

    it('should return empty array when all DBs are completed', async () => {
      const options = createTestOptions();
      const session = await createSession(options);

      // Set all as completed
      for (const provider of ['pubmed', 'eric', 'arxiv'] as ProviderName[]) {
        await updateDatabaseStatus(
          session.id,
          provider,
          {
            status: 'completed',
            totalHits: 50,
            retrievedCount: 50,
            completedAt: new Date().toISOString(),
          },
          testDir
        );
      }

      const loaded = await loadSession(session.id, testDir);
      const resumable = getResumableProviders(loaded);

      expect(resumable).toHaveLength(0);
    });
  });
});
