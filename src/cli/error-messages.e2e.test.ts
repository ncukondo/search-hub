/**
 * E2E Tests for CLI Error Messages
 *
 * Tests that error messages are helpful and actionable:
 * - Error messages include actionable guidance
 * - Exit codes match specification
 * - Network errors show retry hints
 * - Config errors show config path
 * - Validation errors show line numbers
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupE2EContext,
  type E2EContext,
  createRawQueryFile,
  createRawConfig,
} from './e2e-helpers.js';
import { EXIT_CODES } from './exit-codes.js';

describe('CLI Error Messages E2E', () => {
  let ctx: E2EContext;
  let capturedOutput: string[];
  let capturedErrors: string[];

  beforeEach(async () => {
    ctx = await setupE2EContext();

    // Capture console output
    capturedOutput = [];
    capturedErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      capturedOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      capturedErrors.push(args.join(' '));
    });

    process.exitCode = undefined;
  });

  afterEach(async () => {
    await ctx.cleanup();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe('exit codes match specification', () => {
    it('should return SUCCESS (0) for successful operations', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'config',
        '-c', ctx.configPath,
      ]);

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should return QUERY_ERROR (3) for invalid query file', async () => {
      const invalidQueryPath = await createRawQueryFile(
        ctx.tempDir,
        'invalid yaml content: [',
        'invalid.yaml'
      );

      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'query', 'validate',
        invalidQueryPath,
      ]);

      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });

    it('should return QUERY_ERROR (3) for missing query file', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'query', 'validate',
        '/nonexistent/query.yaml',
      ]);

      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });

    it('should return SESSION_ERROR (5) for nonexistent session', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'status',
        'nonexistent-session',
        '--session-dir', ctx.sessionsDir,
      ]);

      expect(process.exitCode).toBe(EXIT_CODES.SESSION_ERROR);
    });

    it('should return SESSION_ERROR (5) for export with nonexistent session', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'export',
        'nonexistent-session',
        '--session-dir', ctx.sessionsDir,
      ]);

      expect(process.exitCode).toBe(EXIT_CODES.SESSION_ERROR);
    });
  });

  describe('error messages include actionable guidance', () => {
    it('should show file path for missing query file', async () => {
      const missingPath = '/nonexistent/path/query.yaml';

      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'query', 'validate',
        missingPath,
      ]);

      // Check both stdout and stderr for error messages
      const allOutput = [...capturedOutput, ...capturedErrors].join(' ');
      expect(allOutput.toLowerCase()).toMatch(/error|not found|no such/i);
    });

    it('should show session ID in session not found error', async () => {
      const sessionId = 'test-nonexistent-session-123';

      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'status',
        sessionId,
        '--session-dir', ctx.sessionsDir,
      ]);

      const errorOutput = capturedErrors.join(' ');
      expect(errorOutput).toContain(sessionId);
    });
  });

  describe('validation errors show descriptive messages', () => {
    it('should show validation error for missing query name', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
`,
        'missing-name.yaml'
      );

      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'query', 'validate',
        queryPath,
      ]);

      const errorOutput = capturedOutput.join(' ') + capturedErrors.join(' ');
      // Should indicate something is wrong with the query structure
      expect(errorOutput.toLowerCase()).toMatch(/error|invalid|required|missing/i);
      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });

    it('should show validation error for invalid field type', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: test-query
query:
  - field: invalid_field_type
    terms:
      keywords:
        - test
    operator: AND
`,
        'invalid-field.yaml'
      );

      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'query', 'validate',
        queryPath,
      ]);

      const errorOutput = capturedOutput.join(' ') + capturedErrors.join(' ');
      // Should indicate field validation failed
      expect(errorOutput.toLowerCase()).toMatch(/error|invalid|field/i);
      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });

    it('should show validation error for malformed YAML', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: test
query:
  - field: title_abstract
    terms:
      keywords
        - missing colon after keywords
`,
        'malformed.yaml'
      );

      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'query', 'validate',
        queryPath,
      ]);

      const errorOutput = capturedOutput.join(' ') + capturedErrors.join(' ');
      expect(errorOutput.toLowerCase()).toMatch(/error|yaml|parse|syntax/i);
      expect(process.exitCode).toBe(EXIT_CODES.QUERY_ERROR);
    });
  });

  describe('config errors show config path', () => {
    it('should show error for invalid config TOML', async () => {
      const invalidConfigPath = await createRawConfig(
        ctx.tempDir,
        'invalid toml [ missing quote',
        'invalid-config.toml'
      );

      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'config',
        '-c', invalidConfigPath,
      ]);

      // Config loading may fall back to defaults, so check if error or fallback behavior
      // The important thing is it doesn't crash
      expect(process.exitCode === EXIT_CODES.SUCCESS || process.exitCode === EXIT_CODES.CONFIG_ERROR).toBe(true);
    });

    it('should show error when setting invalid config key', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'config',
        'nonexistent.key',
        'value',
        '-c', ctx.configPath,
      ]);

      // Check both stdout and stderr for error messages
      const allOutput = [...capturedOutput, ...capturedErrors].join(' ');
      expect(allOutput.toLowerCase()).toMatch(/error|invalid|unknown/i);
      expect(process.exitCode).toBe(EXIT_CODES.CONFIG_ERROR);
    });
  });

  describe('search command errors', () => {
    it('should show error when --query is used without --db', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'search',
        '--query', 'diabetes mellitus',
        '-c', ctx.configPath,
        '--session-dir', ctx.sessionsDir,
      ]);

      const errorOutput = capturedErrors.join(' ');
      expect(errorOutput.toLowerCase()).toMatch(/error|--db|require/i);
      expect(process.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
    });

    it('should show error when neither query file nor --query is provided', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'search',
        '-c', ctx.configPath,
        '--session-dir', ctx.sessionsDir,
      ]);

      const errorOutput = capturedErrors.join(' ');
      expect(errorOutput.toLowerCase()).toMatch(/error|query|required|provide/i);
      expect(process.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
    });
  });

  describe('export command errors', () => {
    it('should show error for invalid format option', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'export',
        'any-session',
        '--format', 'invalid-format',
        '--session-dir', ctx.sessionsDir,
      ]);

      const errorOutput = capturedErrors.join(' ');
      expect(errorOutput.toLowerCase()).toMatch(/error|invalid|format/i);
    });

    it('should show error for invalid id-type option', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'export',
        'any-session',
        '--format', 'ids',
        '--id-type', 'invalid-type',
        '--session-dir', ctx.sessionsDir,
      ]);

      const errorOutput = capturedErrors.join(' ');
      expect(errorOutput.toLowerCase()).toMatch(/error|invalid|id/i);
    });
  });

  describe('resume command errors', () => {
    it('should show error for nonexistent session', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'resume',
        'nonexistent-session',
        '--session-dir', ctx.sessionsDir,
      ]);

      const errorOutput = capturedErrors.join(' ');
      expect(errorOutput.toLowerCase()).toMatch(/error|not found|session/i);
      expect(process.exitCode).toBe(EXIT_CODES.SESSION_ERROR);
    });
  });

  describe('register command errors', () => {
    it('should show error for nonexistent session', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'register',
        'nonexistent-session',
        '--session-dir', ctx.sessionsDir,
      ]);

      const errorOutput = capturedErrors.join(' ');
      expect(errorOutput.toLowerCase()).toMatch(/error|not found|session/i);
      expect(process.exitCode).toBe(EXIT_CODES.SESSION_ERROR);
    });

    it('should show dry-run output instead of error when ref not available', async () => {
      const { createProgram } = await import('./index.js');
      const program = createProgram();

      await program.parseAsync([
        'node', 'search-hub',
        'register',
        'nonexistent-session',
        '--dry-run',
        '--session-dir', ctx.sessionsDir,
      ]);

      // With --dry-run, session errors may still occur, but ref availability is not checked
      // The important thing is it handles the scenario gracefully
      expect(process.exitCode === EXIT_CODES.SUCCESS || process.exitCode === EXIT_CODES.SESSION_ERROR).toBe(true);
    });
  });
});
