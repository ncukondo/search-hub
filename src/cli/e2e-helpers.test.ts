/**
 * Tests for E2E helper functions.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createTempDir,
  cleanupTempDir,
  execCli,
  createQueryFile,
  createSimpleQueryFile,
  createConfig,
  createSessionsDir,
  createMockSession,
  createInvalidQueryFile,
} from './e2e-helpers.js';

describe('E2E Helpers', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await cleanupTempDir(dir);
    }
    tempDirs.length = 0;
  });

  describe('createTempDir', () => {
    it('should create a temp directory', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);
      expect(existsSync(tempDir)).toBe(true);
    });

    it('should use custom prefix', async () => {
      const tempDir = await createTempDir('custom-prefix-');
      tempDirs.push(tempDir);
      expect(tempDir).toContain('custom-prefix-');
    });
  });

  describe('cleanupTempDir', () => {
    it('should remove temp directory', async () => {
      const tempDir = await createTempDir();
      expect(existsSync(tempDir)).toBe(true);
      await cleanupTempDir(tempDir);
      expect(existsSync(tempDir)).toBe(false);
    });
  });

  describe('execCli', () => {
    it('should execute CLI and return result', async () => {
      const result = await execCli(['--version']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('0.1.0');
    });

    it('should return non-zero exit code for invalid command', async () => {
      const result = await execCli(['nonexistent-command']);
      expect(result.exitCode).not.toBe(0);
    });

    it('should capture output for non-existent file', async () => {
      const result = await execCli(['query', 'validate', '/nonexistent/path/query.yaml']);
      expect(result.exitCode).not.toBe(0);
      // Error may be in stdout or stderr depending on CLI implementation
      expect(result.stdout + result.stderr).toContain('ENOENT');
    });
  });

  describe('createQueryFile', () => {
    it('should create a query file', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);

      const queryPath = await createQueryFile(tempDir, {
        name: 'test-query',
        blocks: [{ field: 'title_abstract', terms: { keywords: ['test'] }, operator: 'AND' }],
        filters: { yearFrom: 2024 },
        overrides: {},
      });

      expect(existsSync(queryPath)).toBe(true);
      const content = await readFile(queryPath, 'utf-8');
      expect(content).toContain('test-query');
    });
  });

  describe('createSimpleQueryFile', () => {
    it('should create a simple query file with defaults', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);

      const queryPath = await createSimpleQueryFile(tempDir);

      expect(existsSync(queryPath)).toBe(true);
      const content = await readFile(queryPath, 'utf-8');
      expect(content).toContain('test-query');
      expect(content).toContain('diabetes');
    });

    it('should use custom options', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);

      const queryPath = await createSimpleQueryFile(tempDir, {
        name: 'custom-query',
        keyword: 'cancer',
        filename: 'custom.yaml',
      });

      expect(queryPath).toContain('custom.yaml');
      const content = await readFile(queryPath, 'utf-8');
      expect(content).toContain('custom-query');
      expect(content).toContain('cancer');
    });
  });

  describe('createConfig', () => {
    it('should create a config file', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);

      const configPath = await createConfig(tempDir, {
        session: { directory: '/tmp/sessions' },
        providers: {
          pubmed: {
            enabled: true,
            api_key: 'test-key',
            email: 'test@example.com',
            rate_limit: 3,
            timeout: 30000,
            retries: 2,
            max_results: 10000,
          },
        },
      });

      expect(existsSync(configPath)).toBe(true);
      const content = await readFile(configPath, 'utf-8');
      expect(content).toContain('[session]');
      expect(content).toContain('[providers.pubmed]');
    });
  });

  describe('createSessionsDir', () => {
    it('should create sessions directory', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);

      const sessionsDir = await createSessionsDir(tempDir);
      expect(existsSync(sessionsDir)).toBe(true);
      expect(sessionsDir).toContain('sessions');
    });
  });

  describe('createMockSession', () => {
    it('should create a mock session with results', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);
      const sessionsDir = await createSessionsDir(tempDir);

      const { sessionId, sessionDir } = await createMockSession(sessionsDir, {
        name: 'test-session',
        databases: ['pubmed'],
        articlesPerDb: 2,
      });

      expect(existsSync(sessionDir)).toBe(true);
      expect(existsSync(join(sessionDir, 'session.json'))).toBe(true);
      expect(existsSync(join(sessionDir, 'pubmed_results.jsonl'))).toBe(true);

      const sessionContent = await readFile(join(sessionDir, 'session.json'), 'utf-8');
      const session = JSON.parse(sessionContent);
      expect(session.id).toBe(sessionId);
      expect(session.name).toBe('test-session');
    });
  });

  describe('createInvalidQueryFile', () => {
    it('should create an invalid query file', async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);

      const queryPath = await createInvalidQueryFile(tempDir);

      expect(existsSync(queryPath)).toBe(true);
      const content = await readFile(queryPath, 'utf-8');
      expect(content).toContain('invalid_field');
    });
  });
});
