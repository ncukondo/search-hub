/**
 * CLI Execution API Tests
 *
 * These tests execute actual search and resume commands with real API calls.
 * Run separately with: npm run test:api
 *
 * Requires: .env file with SEARCH_HUB_PUBMED_API_KEY, SEARCH_HUB_PUBMED_EMAIL
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rm, writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { SessionFile, DatabaseStatus } from '../session/types.js';

// Load environment variables
loadDotenv();

const skip = !process.env['SEARCH_HUB_PUBMED_API_KEY'];

// Import CLI
const { createProgram } = await import('./index.js');
const { EXIT_CODES } = await import('./exit-codes.js');

describe.skipIf(skip)('CLI Execution E2E', () => {
  let tempDir: string;
  let sessionsDir: string;
  let configPath: string;
  let searchSessionId: string | null = null;
  let originalExit: typeof process.exit;

  beforeAll(async () => {
    tempDir = join(tmpdir(), `search-hub-api-${Date.now()}`);
    sessionsDir = join(tempDir, 'sessions');
    configPath = join(tempDir, 'config.toml');
    await mkdir(sessionsDir, { recursive: true });

    // Create config file with real API keys from environment
    const pubmedApiKey = process.env['SEARCH_HUB_PUBMED_API_KEY'] ?? '';
    const pubmedEmail = process.env['SEARCH_HUB_PUBMED_EMAIL'] ?? 'test@example.com';

    const configContent = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = true
api_key = "${pubmedApiKey}"
email = "${pubmedEmail}"
rate_limit = 3
timeout = 30000
retries = 2
`;
    await writeFile(configPath, configContent, 'utf-8');

    // Mock process.exit
    originalExit = process.exit;
    process.exit = vi.fn() as unknown as typeof process.exit;

    // Run initial search to create a shared session for dependent tests
    const queryFile = join(tempDir, 'setup-search.yaml');
    const queryContent = `name: api-test-setup
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - mellitus
    operator: AND
filters:
  year_from: 2024
`;
    await writeFile(queryFile, queryContent, 'utf-8');

    // Suppress console output during setup
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const program = createProgram();
    program.exitOverride();

    try {
      await program.parseAsync([
        'node', 'test', 'search', queryFile,
        '--db', 'pubmed',
        '--max-results', '5',
        '--session-dir', sessionsDir,
        '--config', configPath,
      ]);
    } catch {
      // exitOverride may throw
    }

    if (process.exitCode === EXIT_CODES.SUCCESS) {
      const sessionDirs = await readdir(sessionsDir);
      searchSessionId = sessionDirs[0] ?? null;
    }

    logSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = undefined;
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exit = originalExit;
    process.exitCode = undefined;
  });

  describe('search command (real API)', () => {
    it('should have created a session in beforeAll', () => {
      expect(searchSessionId).not.toBeNull();
    });

    it('should execute search with direct query', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      process.exitCode = undefined;

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync([
          'node', 'test', 'search',
          '--db', 'pubmed',
          '--query', 'COVID-19[tiab] AND vaccine[tiab]',
          '--max-results', '3',
          '--session-dir', sessionsDir,
          '--config', configPath,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      const sessionDirs = await readdir(sessionsDir);
      expect(sessionDirs.length).toBeGreaterThan(1);

      logSpy.mockRestore();
      vi.restoreAllMocks();
      process.exitCode = undefined;
    });
  });

  describe('resume command (real API)', () => {
    it.skipIf(!searchSessionId)('should resume interrupted session', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      process.exitCode = undefined;

      const sessionPath = join(sessionsDir, searchSessionId!, 'session.json');
      const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as SessionFile;
      const pubmedDb = session.databases['pubmed'];

      if (pubmedDb && pubmedDb.totalHits && pubmedDb.retrievedCount !== undefined &&
          pubmedDb.totalHits > pubmedDb.retrievedCount) {
        (pubmedDb as DatabaseStatus).status = 'in_progress';
        session.summary.status = 'running';
        await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');

        const program = createProgram();
        program.exitOverride();

        try {
          await program.parseAsync([
            'node', 'test', 'resume', searchSessionId!,
            '--session-dir', sessionsDir,
            '--config', configPath,
          ]);
        } catch {
          // exitOverride may throw
        }

        expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

        const updatedSession = JSON.parse(await readFile(sessionPath, 'utf-8')) as SessionFile;
        const updatedPubmedDb = updatedSession.databases['pubmed'];
        expect(updatedPubmedDb?.retrievedCount).toBeGreaterThanOrEqual(
          pubmedDb.retrievedCount ?? 0
        );
      } else {
        expect(pubmedDb?.status).toBe('completed');
      }

      logSpy.mockRestore();
      vi.restoreAllMocks();
      process.exitCode = undefined;
    });
  });

  describe('export command (after search)', () => {
    it.skipIf(!searchSessionId)('should export search results in jsonl format', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      process.exitCode = undefined;

      const outputFile = join(tempDir, 'export.jsonl');
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync([
          'node', 'test', 'export', searchSessionId!,
          '--format', 'jsonl',
          '-o', outputFile,
          '--session-dir', sessionsDir,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      const exportContent = await readFile(outputFile, 'utf-8');
      expect(exportContent.trim().length).toBeGreaterThan(0);

      const lines = exportContent.trim().split('\n');
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      logSpy.mockRestore();
      vi.restoreAllMocks();
      process.exitCode = undefined;
    });

    it.skipIf(!searchSessionId)('should export PMIDs in ids format', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      process.exitCode = undefined;

      const outputFile = join(tempDir, 'pmids.txt');
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync([
          'node', 'test', 'export', searchSessionId!,
          '--format', 'ids',
          '--id-type', 'pmid',
          '-o', outputFile,
          '--session-dir', sessionsDir,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      const idsContent = await readFile(outputFile, 'utf-8');
      const ids = idsContent.trim().split('\n');
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(/^\d+$/.test(id.trim())).toBe(true);
      }

      logSpy.mockRestore();
      vi.restoreAllMocks();
      process.exitCode = undefined;
    });
  });
});
