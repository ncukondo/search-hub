/**
 * CLI Execution E2E Tests
 *
 * These tests execute actual search and resume commands with real API calls.
 * Run separately with: npm run test:e2e
 *
 * Requires: .env file with SEARCH_HUB_PUBMED_API_KEY, SEARCH_HUB_PUBMED_EMAIL
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
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
  let originalExit: typeof process.exit;
  let capturedOutput: string[];
  let capturedErrors: string[];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'search-hub-e2e-'));
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
    process.exit = vi.fn() as unknown as typeof process.exit;

    // Reset process.exitCode
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exit = originalExit;
    process.exitCode = undefined;
  });

  describe('search command (real API)', () => {
    it('should execute search with PubMed API', async () => {
      const queryFile = join(tempDir, 'pubmed-search.yaml');
      const queryContent = `name: pubmed-e2e-test
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

      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync([
          'node',
          'test',
          'search',
          queryFile,
          '--db',
          'pubmed',
          '--max-results',
          '5',
          '--session-dir',
          sessionsDir,
          '--config',
          configPath,
        ]);
      } catch {
        // exitOverride may throw
      }

      // Log output for debugging
      if (process.exitCode !== EXIT_CODES.SUCCESS) {
        console.log('Output:', capturedOutput);
        console.log('Errors:', capturedErrors);
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify a session was created
      const sessionDirs = await readdir(sessionsDir);
      expect(sessionDirs.length).toBeGreaterThan(0);

      // Verify session file exists and has results
      const sessionDirName = sessionDirs[0];
      if (!sessionDirName) {
        throw new Error('No session directory found');
      }
      const sessionDir = join(sessionsDir, sessionDirName);
      const sessionFile = JSON.parse(
        await readFile(join(sessionDir, 'session.json'), 'utf-8')
      ) as SessionFile;
      const pubmedDb = sessionFile.databases['pubmed'];
      expect(pubmedDb).toBeDefined();
      expect(pubmedDb?.retrievedCount).toBeGreaterThan(0);
    });

    it('should execute search with direct query', async () => {
      const program = createProgram();
      program.exitOverride();

      try {
        await program.parseAsync([
          'node',
          'test',
          'search',
          '--db',
          'pubmed',
          '--query',
          'COVID-19[tiab] AND vaccine[tiab]',
          '--max-results',
          '3',
          '--session-dir',
          sessionsDir,
          '--config',
          configPath,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify a session was created
      const sessionDirs = await readdir(sessionsDir);
      expect(sessionDirs.length).toBeGreaterThan(0);
    });
  });

  describe('resume command (real API)', () => {
    it('should resume interrupted session', async () => {
      // First, create a search session that we'll interrupt
      const queryFile = join(tempDir, 'resume-test.yaml');
      const queryContent = `name: resume-e2e-test
query:
  - field: title_abstract
    terms:
      keywords:
        - cancer
        - treatment
    operator: AND
filters:
  year_from: 2024
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      // Run initial search with small max-results
      const program1 = createProgram();
      program1.exitOverride();

      try {
        await program1.parseAsync([
          'node',
          'test',
          'search',
          queryFile,
          '--db',
          'pubmed',
          '--max-results',
          '3',
          '--session-dir',
          sessionsDir,
          '--config',
          configPath,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Get the session ID
      const sessionDirs = await readdir(sessionsDir);
      expect(sessionDirs.length).toBeGreaterThan(0);
      const sessionId = sessionDirs[0];
      if (!sessionId) {
        throw new Error('No session directory found');
      }

      // Modify session to simulate interruption (set status to in_progress)
      const sessionPath = join(sessionsDir, sessionId, 'session.json');
      const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as SessionFile;
      const pubmedDb = session.databases['pubmed'];

      // Only test resume if there are more results to fetch
      if (pubmedDb && pubmedDb.totalHits && pubmedDb.retrievedCount !== undefined &&
          pubmedDb.totalHits > pubmedDb.retrievedCount) {
        // Cast to mutable to update status
        (pubmedDb as DatabaseStatus).status = 'in_progress';
        session.summary.status = 'running';
        await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');

        // Reset for resume test
        process.exitCode = undefined;
        capturedOutput = [];
        capturedErrors = [];

        // Resume the session
        const program2 = createProgram();
        program2.exitOverride();

        try {
          await program2.parseAsync([
            'node',
            'test',
            'resume',
            sessionId,
            '--session-dir',
            sessionsDir,
            '--config',
            configPath,
          ]);
        } catch {
          // exitOverride may throw
        }

        expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

        // Verify session was updated
        const updatedSession = JSON.parse(await readFile(sessionPath, 'utf-8')) as SessionFile;
        const updatedPubmedDb = updatedSession.databases['pubmed'];
        expect(updatedPubmedDb?.retrievedCount).toBeGreaterThanOrEqual(
          pubmedDb.retrievedCount ?? 0
        );
      } else {
        // Skip resume test if all results were already fetched
        expect(pubmedDb?.status).toBe('completed');
      }
    });
  });

  describe('export command (after search)', () => {
    it('should export search results in jsonl format', async () => {
      // First, run a search
      const queryFile = join(tempDir, 'export-test.yaml');
      const queryContent = `name: export-e2e-test
query:
  - field: title_abstract
    terms:
      keywords:
        - hypertension
    operator: AND
filters:
  year_from: 2024
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program1 = createProgram();
      program1.exitOverride();

      try {
        await program1.parseAsync([
          'node',
          'test',
          'search',
          queryFile,
          '--db',
          'pubmed',
          '--max-results',
          '3',
          '--session-dir',
          sessionsDir,
          '--config',
          configPath,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Get the session ID
      const sessionDirs = await readdir(sessionsDir);
      const sessionId = sessionDirs[0];
      if (!sessionId) {
        throw new Error('No session directory found');
      }

      // Reset for export test
      process.exitCode = undefined;
      capturedOutput = [];

      // Export results
      const outputFile = join(tempDir, 'export.jsonl');
      const program2 = createProgram();
      program2.exitOverride();

      try {
        await program2.parseAsync([
          'node',
          'test',
          'export',
          sessionId,
          '--format',
          'jsonl',
          '-o',
          outputFile,
          '--session-dir',
          sessionsDir,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify export file exists and has content
      const exportContent = await readFile(outputFile, 'utf-8');
      expect(exportContent.trim().length).toBeGreaterThan(0);

      // Each line should be valid JSON
      const lines = exportContent.trim().split('\n');
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should export PMIDs in ids format', async () => {
      // First, run a search
      const queryFile = join(tempDir, 'ids-export-test.yaml');
      const queryContent = `name: ids-export-e2e-test
query:
  - field: title_abstract
    terms:
      keywords:
        - asthma
    operator: AND
filters:
  year_from: 2024
`;
      await writeFile(queryFile, queryContent, 'utf-8');

      const program1 = createProgram();
      program1.exitOverride();

      try {
        await program1.parseAsync([
          'node',
          'test',
          'search',
          queryFile,
          '--db',
          'pubmed',
          '--max-results',
          '3',
          '--session-dir',
          sessionsDir,
          '--config',
          configPath,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Get the session ID
      const sessionDirs = await readdir(sessionsDir);
      const sessionId = sessionDirs[0];
      if (!sessionId) {
        throw new Error('No session directory found');
      }

      // Reset for export test
      process.exitCode = undefined;
      capturedOutput = [];

      // Export PMIDs
      const outputFile = join(tempDir, 'pmids.txt');
      const program2 = createProgram();
      program2.exitOverride();

      try {
        await program2.parseAsync([
          'node',
          'test',
          'export',
          sessionId,
          '--format',
          'ids',
          '--id-type',
          'pmid',
          '-o',
          outputFile,
          '--session-dir',
          sessionsDir,
        ]);
      } catch {
        // exitOverride may throw
      }

      expect(process.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify export file contains PMIDs
      const idsContent = await readFile(outputFile, 'utf-8');
      const ids = idsContent.trim().split('\n');
      expect(ids.length).toBeGreaterThan(0);
      // PMIDs should be numeric
      for (const id of ids) {
        expect(/^\d+$/.test(id.trim())).toBe(true);
      }
    });
  });
});
