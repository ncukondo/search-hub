/**
 * CLI Execution Integration Tests
 *
 * Comprehensive integration tests for CLI commands that verify
 * actual execution with file system operations.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { SessionFile } from '../session/types.js';

// Note: Search and resume execution tests are covered in:
// - src/cli/commands/search-executor.test.ts (14 tests with mocked providers)
// - src/cli/commands/resume-executor.test.ts (7 tests with mocked providers)
// This integration test focuses on CLI command parsing and options.

// Import after mocking
const { createProgram } = await import('./index.js');
const { EXIT_CODES } = await import('./exit-codes.js');

describe('CLI Execution Integration', () => {
  let tempDir: string;
  let sessionsDir: string;
  let configPath: string;
  let originalExit: typeof process.exit;
  let capturedOutput: string[];
  let capturedErrors: string[];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'search-hub-exec-test-'));
    sessionsDir = join(tempDir, 'sessions');
    configPath = join(tempDir, 'config.toml');
    await mkdir(sessionsDir, { recursive: true });

    // Create minimal config file
    const configContent = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = true
`;
    await writeFile(configPath, configContent, 'utf-8');

    // Capture console output
    capturedOutput = [];
    capturedErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      capturedOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      capturedErrors.push(args.join(' '));
    });

    // Mock process.exit
    originalExit = process.exit;
    process.exit = vi.fn() as any;

    // Reset process.exitCode
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exit = originalExit;
    process.exitCode = undefined;
  });

  describe('query validate command', () => {
    it('should validate a valid query file', async () => {
      const queryFile = join(tempDir, 'valid-query.yaml');
      const queryContent = `name: test-query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - AI
    operator: AND
filters:
  year_from: 2020
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'query', 'validate', queryFile]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(capturedOutput.some((o) => o.includes('valid') || o.includes('Valid'))).toBe(true);
    });

    it('should report error for invalid query file', async () => {
      const queryFile = join(tempDir, 'invalid-query.yaml');
      const queryContent = `name: test-query
# missing required fields
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'query', 'validate', queryFile]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });

    it('should report error for non-existent file', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'query', 'validate', '/nonexistent/file.yaml']);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });
  });

  describe('query translate command', () => {
    it('should translate query for all providers', async () => {
      const queryFile = join(tempDir, 'translate-query.yaml');
      const queryContent = `name: test-query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
    operator: AND
filters: {}
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'query', 'translate', queryFile]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      const output = capturedOutput.join('\n');
      expect(output).toContain('PUBMED');
    });

    it('should translate query for specific provider', async () => {
      const queryFile = join(tempDir, 'translate-query.yaml');
      const queryContent = `name: test-query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
    operator: AND
filters: {}
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'query', 'translate', queryFile, '--db', 'pubmed']);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      const output = capturedOutput.join('\n');
      expect(output).toContain('PUBMED');
    });
  });

  describe('status command', () => {
    it('should list empty sessions', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'status', '--session-dir', sessionsDir]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(capturedOutput.some((o) => o.includes('No sessions') || o.includes('no sessions'))).toBe(true);
    });

    it('should list sessions when present', async () => {
      // Create a test session
      const sessionId = '20260107_test-session_abc123';
      const sessionDir = join(sessionsDir, sessionId);
      await mkdir(sessionDir, { recursive: true });

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
      await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'status', '--session-dir', sessionsDir, '--all']);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should show session details', async () => {
      // Create a test session
      const sessionId = '20260107_test-session_abc123';
      const sessionDir = join(sessionsDir, sessionId);
      await mkdir(sessionDir, { recursive: true });

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
      await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'status', sessionId, '--session-dir', sessionsDir]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should return error for non-existent session', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'status', 'nonexistent-session', '--session-dir', sessionsDir]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SESSION_ERROR);
    });
  });

  describe('search --dry-run command', () => {
    it('should show dry-run output from file', { timeout: 15000 }, async () => {
      const queryFile = join(tempDir, 'search-query.yaml');
      const queryContent = `name: test-query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
    operator: AND
filters: {}
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'search', queryFile, '--dry-run']);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(capturedOutput.some((o) => o.includes('Translated'))).toBe(true);
    });

    it('should show dry-run output for direct query', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'search', '--dry-run', '--db', 'pubmed', '--query', 'diabetes']);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(capturedOutput.some((o) => o.includes('Translated') || o.includes('pubmed'))).toBe(true);
    });
  });

  describe('export command', () => {
    it('should export in jsonl format', async () => {
      // Create a test session with results
      const sessionId = '20260107_export-test_abc123';
      const sessionDir = join(sessionsDir, sessionId);
      await mkdir(sessionDir, { recursive: true });

      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'export-test',
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
            totalHits: 2,
            retrievedCount: 2,
            files: {
              query: 'pubmed_query.txt',
              results: 'pubmed_results.jsonl',
            },
          },
        },
        summary: {
          totalHits: 2,
          totalRetrieved: 2,
          status: 'completed',
        },
      };
      await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');

      // Create results file
      const article1 = { title: 'Article 1', authors: [], pmid: '12345', doi: '10.1234/test1', source: 'pubmed', retrievedAt: new Date().toISOString() };
      const article2 = { title: 'Article 2', authors: [], pmid: '12346', doi: '10.1234/test2', source: 'pubmed', retrievedAt: new Date().toISOString() };
      await writeFile(
        join(sessionDir, 'pubmed_results.jsonl'),
        JSON.stringify(article1) + '\n' + JSON.stringify(article2) + '\n',
        'utf-8'
      );

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'export', sessionId, '--session-dir', sessionsDir, '--format', 'jsonl']);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should export in ids format', async () => {
      // Create a test session with results
      const sessionId = '20260107_export-ids_abc123';
      const sessionDir = join(sessionsDir, sessionId);
      await mkdir(sessionDir, { recursive: true });

      const session: SessionFile = {
        version: 1,
        id: sessionId,
        name: 'export-ids',
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
            totalHits: 1,
            retrievedCount: 1,
            files: {
              query: 'pubmed_query.txt',
              results: 'pubmed_results.jsonl',
            },
          },
        },
        summary: {
          totalHits: 1,
          totalRetrieved: 1,
          status: 'completed',
        },
      };
      await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');

      // Create results file
      const article = { title: 'Article', authors: [], pmid: '12345', doi: '10.1234/test', source: 'pubmed', retrievedAt: new Date().toISOString() };
      await writeFile(
        join(sessionDir, 'pubmed_results.jsonl'),
        JSON.stringify(article) + '\n',
        'utf-8'
      );

      const outputFile = join(tempDir, 'ids.txt');
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'export', sessionId, '--session-dir', sessionsDir, '--format', 'ids', '-o', outputFile]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      const output = await readFile(outputFile, 'utf-8');
      expect(output).toContain('12345');
    });

    it('should return error for non-existent session', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'export', 'nonexistent-session', '--session-dir', sessionsDir]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SESSION_ERROR);
    });
  });

  describe('config command', () => {
    it('should view all config', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'config', '--config', configPath]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(capturedOutput.some((o) => o.includes('session') || o.includes('providers'))).toBe(true);
    });

    it('should view specific config key', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'config', 'session.directory', '--config', configPath]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should set config key with persistence', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'config', 'providers.pubmed.max_results', '500', '--config', configPath]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
      // Verify persistence by reading the config file
      const configContent = await readFile(configPath, 'utf-8');
      expect(configContent).toContain('500');
    });
  });

  // Note: search execution and resume execution tests are covered in:
  // - src/cli/commands/search-executor.test.ts (14 tests)
  // - src/cli/commands/resume-executor.test.ts (7 tests)
  // These test the actual provider interactions with proper mocks.

  describe('Exit codes', () => {
    it('should return SUCCESS (0) for successful operations', async () => {
      const queryFile = join(tempDir, 'success-query.yaml');
      const queryContent = `name: test-query
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
filters: {}
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'query', 'validate', queryFile]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should return QUERY_ERROR (3) for invalid queries', async () => {
      const queryFile = join(tempDir, 'bad-query.yaml');
      const queryContent = 'invalid: yaml: syntax:';
      await writeFile(queryFile, queryContent, 'utf-8');

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'query', 'validate', queryFile]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });

    it('should return SESSION_ERROR (5) for session issues', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync(['node', 'test', 'resume', 'nonexistent-session', '--session-dir', sessionsDir]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SESSION_ERROR);
    });
  });
});
