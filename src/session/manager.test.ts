import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateSessionId,
  sanitizeName,
  createSession,
  type CreateSessionOptions,
} from './manager';
import type { SessionFile, ProviderName } from './types';

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
});
