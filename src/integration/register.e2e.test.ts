/**
 * End-to-End tests for the register command.
 *
 * These tests execute real CLI commands and perform real file I/O
 * to verify the feature works in actual usage scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { stringify as stringifyYaml } from 'yaml';
import type { Article } from '../providers/base/types.js';
import type { SessionFile } from '../session/types.js';
import { checkRefAvailable } from './ref-cli.js';

const execAsync = promisify(exec);

/**
 * Helper to create a test session directory with session.yaml and result files.
 */
async function createTestSession(
  baseDir: string,
  sessionId: string,
  articles: Partial<Article>[],
): Promise<string> {
  const sessionDir = path.join(baseDir, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  // Create session.yaml
  const session: SessionFile = {
    version: 1,
    id: sessionId,
    name: 'test-session',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: {
      totalHits: articles.length,
      totalRetrieved: articles.length,
      status: 'completed',
    },
    databases: {
      pubmed: {
        status: 'completed',
        totalHits: articles.length,
        retrievedCount: articles.length,
        files: {
          query: 'pubmed_query.txt',
          results: 'pubmed_results.jsonl',
        },
      },
    },
    query: {
      file: 'query.yaml',
      hash: 'testhash123',
      targets: ['pubmed'],
    },
  };

  await fs.writeFile(path.join(sessionDir, 'session.yaml'), stringifyYaml(session));

  // Create results file as JSONL
  const fullArticles: Partial<Article>[] = articles.map((a, i) => {
    const article: Partial<Article> = {
      title: a.title ?? `Test Article ${i + 1}`,
      authors: a.authors ?? [{ family: 'Test', given: 'Author' }],
      source: a.source ?? 'pubmed',
      retrievedAt: a.retrievedAt ?? new Date().toISOString(),
    };
    if (a.pmid) article.pmid = a.pmid;
    if (a.doi) article.doi = a.doi;
    if (a.arxivId) article.arxivId = a.arxivId;
    if (a.ericId) article.ericId = a.ericId;
    if (a.scopusId) article.scopusId = a.scopusId;
    if (a.abstract) article.abstract = a.abstract;
    return article;
  });

  const jsonlContent = fullArticles.map((a) => JSON.stringify(a)).join('\n');
  await fs.writeFile(path.join(sessionDir, 'pubmed_results.jsonl'), jsonlContent);

  return sessionDir;
}

/**
 * Get the CLI command path for testing.
 */
function getCliCommand(): string {
  // Use tsx to run the TypeScript source directly
  return 'npx tsx src/cli/index.ts';
}

describe('register command e2e', () => {
  let tempDir: string;
  let sessionId: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-e2e-'));
    sessionId = '20240115_test-session_abc123';
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should show dry-run output for session with articles', async () => {
    await createTestSession(tempDir, sessionId, [
      { pmid: '12345678', title: 'Test Article 1', abstract: 'Abstract 1' },
      { doi: '10.1234/test', title: 'Test Article 2' },
      { pmid: '87654321', doi: '10.5678/test', title: 'Test Article 3' },
      { title: 'Article without IDs' },
    ]);

    const cliCmd = getCliCommand();
    const result = await execAsync(
      `${cliCmd} register ${sessionId} --session-dir ${tempDir} --dry-run`,
      { cwd: path.join(__dirname, '../..') },
    );

    expect(result.stdout).toContain('Would register 3 reference');
    expect(result.stdout).toContain('pmid:12345678');
    expect(result.stdout).toContain('pmid:87654321');
    expect(result.stdout).toContain('10.1234/test');
    expect(result.stdout).toContain('1 article');
    expect(result.stdout).toContain('no identifier');
  });

  it('should register alternative-ID articles and skip only no-ID articles in dry-run', async () => {
    await createTestSession(tempDir, sessionId, [
      { pmid: '12345678', title: 'Article with PMID' },
      { title: 'Article from arXiv', source: 'arxiv', arxivId: '2401.12345' },
      { title: 'Article from ERIC', source: 'eric', ericId: 'ED123456' },
      { title: 'Plain article without any IDs' },
    ]);

    const cliCmd = getCliCommand();
    const result = await execAsync(
      `${cliCmd} register ${sessionId} --session-dir ${tempDir} --dry-run`,
      { cwd: path.join(__dirname, '../..') },
    );

    // arXiv/ERIC-only articles are now registrable
    expect(result.stdout).toContain('Would register 3 reference');
    expect(result.stdout).toContain('arxiv:2401.12345');
    expect(result.stdout).toContain('eric:ED123456');
    // Only the truly identifier-less article is skipped
    expect(result.stdout).toContain('1 article will be skipped (no identifier)');
    expect(result.stdout).toContain('"Plain article without any IDs"');
    expect(result.stdout).toContain('source: pubmed');
  });

  it('should handle --dry-run without creating registration.json', async () => {
    await createTestSession(tempDir, sessionId, [{ pmid: '12345678', title: 'Test Article 1' }]);

    const cliCmd = getCliCommand();
    await execAsync(`${cliCmd} register ${sessionId} --session-dir ${tempDir} --dry-run`, {
      cwd: path.join(__dirname, '../..'),
    });

    const registrationPath = path.join(tempDir, sessionId, 'registration.json');
    let exists = false;
    try {
      await fs.access(registrationPath);
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it('should show PMID preference over DOI in dry-run', async () => {
    await createTestSession(tempDir, sessionId, [
      { pmid: '12345678', doi: '10.1234/both', title: 'Article with both IDs' },
    ]);

    const cliCmd = getCliCommand();
    const result = await execAsync(
      `${cliCmd} register ${sessionId} --session-dir ${tempDir} --dry-run`,
      { cwd: path.join(__dirname, '../..') },
    );

    // PMID should be used, not DOI
    expect(result.stdout).toContain('pmid:12345678');
    expect(result.stdout).not.toContain('10.1234/both');
  });

  it('should error on non-existent session', async () => {
    const cliCmd = getCliCommand();
    try {
      await execAsync(`${cliCmd} register nonexistent-session --session-dir ${tempDir} --dry-run`, {
        cwd: path.join(__dirname, '../..'),
      });
      expect.fail('Should have thrown an error');
    } catch (error: unknown) {
      const execError = error as { stderr: string };
      expect(execError.stderr).toContain('Session not found');
    }
  });

  it('should filter by provider with --db option', async () => {
    const sessionDir = path.join(tempDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    // Create session with multiple providers
    const session: SessionFile = {
      version: 1,
      id: sessionId,
      name: 'test-session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: { totalHits: 4, totalRetrieved: 4, status: 'completed' },
      databases: {
        pubmed: {
          status: 'completed',
          totalHits: 2,
          retrievedCount: 2,
          files: { query: 'pubmed_query.txt', results: 'pubmed_results.jsonl' },
        },
        eric: {
          status: 'completed',
          totalHits: 2,
          retrievedCount: 2,
          files: { query: 'eric_query.txt', results: 'eric_results.jsonl' },
        },
      },
      query: { file: 'query.yaml', hash: 'testhash123', targets: ['pubmed', 'eric'] },
    };

    await fs.writeFile(path.join(sessionDir, 'session.yaml'), stringifyYaml(session));

    // Create result files
    const pubmedArticles = [
      {
        pmid: '11111111',
        title: 'PubMed Article 1',
        authors: [],
        source: 'pubmed',
        retrievedAt: '',
      },
      {
        pmid: '22222222',
        title: 'PubMed Article 2',
        authors: [],
        source: 'pubmed',
        retrievedAt: '',
      },
    ];
    const ericArticles = [
      { ericId: 'ED111111', title: 'ERIC Article 1', authors: [], source: 'eric', retrievedAt: '' },
      { ericId: 'ED222222', title: 'ERIC Article 2', authors: [], source: 'eric', retrievedAt: '' },
    ];

    await fs.writeFile(
      path.join(sessionDir, 'pubmed_results.jsonl'),
      pubmedArticles.map((a) => JSON.stringify(a)).join('\n'),
    );
    await fs.writeFile(
      path.join(sessionDir, 'eric_results.jsonl'),
      ericArticles.map((a) => JSON.stringify(a)).join('\n'),
    );

    const cliCmd = getCliCommand();
    const result = await execAsync(
      `${cliCmd} register ${sessionId} --session-dir ${tempDir} --db pubmed --dry-run`,
      { cwd: path.join(__dirname, '../..') },
    );

    // Should only show PubMed articles
    expect(result.stdout).toContain('pmid:11111111');
    expect(result.stdout).toContain('pmid:22222222');
    expect(result.stdout).not.toContain('ERIC Article');
  });
});

// Tests using a stub ref command that captures the bulk import file.
// This exercises the real CLI register flow end-to-end without needing
// the actual reference-manager, and lets us inspect the CSL-JSON that
// would be imported.
describe('register with stubbed ref command', () => {
  let tempDir: string;
  let sessionId: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-stub-e2e-'));
    sessionId = '20240115_stub-test_xyz789';
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Create an executable `ref` stub that copies the bulk import file to
   * REF_STUB_CAPTURE and emits a valid RefAddOutput JSON for its content.
   */
  async function createRefStub(): Promise<string> {
    const stubDir = path.join(tempDir, 'stub-bin');
    await fs.mkdir(stubDir, { recursive: true });
    const stubPath = path.join(stubDir, 'ref');
    const script = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('0.0.0-stub');
  process.exit(0);
}
const i = args.indexOf('-i');
const file = args[i + 2];
fs.copyFileSync(file, process.env.REF_STUB_CAPTURE);
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
const added = items.map((it) => ({ source: it.id, id: it.id, title: it.title }));
console.log(JSON.stringify({
  summary: { total: items.length, added: added.length, skipped: 0, failed: 0 },
  added,
  skipped: [],
  failed: [],
}));
`;
    await fs.writeFile(stubPath, script, { mode: 0o755 });
    return stubDir;
  }

  it('should bulk-import arXiv-only articles with custom.arxiv_id and count identifier-less articles as noId', async () => {
    await createTestSession(tempDir, sessionId, [
      { pmid: '12345678', title: 'Article with PMID' },
      { title: 'arXiv Only Article', source: 'arxiv', arxivId: '2401.12345' },
      { title: 'Identifier-less Article' },
    ]);

    const captureFile = path.join(tempDir, 'captured_bulk_import.json');
    const stubDir = await createRefStub();

    const cliCmd = getCliCommand();
    const result = await execAsync(
      `${cliCmd} register ${sessionId} --session-dir ${tempDir} --no-attach-fulltext`,
      {
        cwd: path.join(__dirname, '../..'),
        env: {
          ...process.env,
          PATH: `${stubDir}:${process.env['PATH']}`,
          REF_STUB_CAPTURE: captureFile,
        },
      },
    );

    expect(result.stdout).toContain('Registration complete');

    // The arXiv-only article appears in the bulk import file with custom.arxiv_id
    const captured = JSON.parse(await fs.readFile(captureFile, 'utf-8')) as Array<{
      title: string;
      URL?: string;
      custom?: { arxiv_id?: string };
    }>;
    expect(captured).toHaveLength(2);
    const arxivItem = captured.find((item) => item.custom?.arxiv_id === '2401.12345');
    expect(arxivItem).toBeDefined();
    expect(arxivItem!.title).toBe('arXiv Only Article');
    expect(arxivItem!.URL).toBe('https://arxiv.org/abs/2401.12345');

    // The identifier-less article is skipped with noId count
    const registrationPath = path.join(tempDir, sessionId, 'registration.json');
    const registration = JSON.parse(await fs.readFile(registrationPath, 'utf-8'));
    expect(registration.summary.total).toBe(3);
    expect(registration.summary.added).toBe(2);
    expect(registration.summary.noId).toBe(1);
    expect(result.stdout).toContain('1 skipped (no identifier)');
  });
});

// Tests that require the real ref command
describe('register with real ref command', () => {
  let tempDir: string;
  let sessionId: string;
  let refAvailable = false;

  beforeEach(async () => {
    refAvailable = await checkRefAvailable();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-ref-e2e-'));
    sessionId = '20240115_ref-test_def456';
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should register to real reference-manager', async ({ skip }) => {
    if (!refAvailable) {
      skip();
      return;
    }
    await createTestSession(tempDir, sessionId, [
      { pmid: '30158200', title: 'Test Real Article' }, // Real PMID for testing
    ]);

    const libraryPath = path.join(tempDir, sessionId, 'references.json');
    const cliCmd = getCliCommand();

    const result = await execAsync(`${cliCmd} register ${sessionId} --session-dir ${tempDir}`, {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, REFERENCE_MANAGER_LIBRARY: libraryPath },
    });

    expect(result.stdout).toContain('Registration complete');

    // Verify registration.json was created
    const registrationPath = path.join(tempDir, sessionId, 'registration.json');
    const registrationContent = await fs.readFile(registrationPath, 'utf-8');
    const registration = JSON.parse(registrationContent);

    expect(registration.sessionId).toBe(sessionId);
    expect(registration.summary.total).toBe(1);
  });

  it('should save registration record with correct structure', async ({ skip }) => {
    if (!refAvailable) {
      skip();
      return;
    }
    await createTestSession(tempDir, sessionId, [
      { pmid: '30158200', title: 'Article 1' },
      { title: 'Article without ID' },
    ]);

    const libraryPath = path.join(tempDir, sessionId, 'references.json');
    const cliCmd = getCliCommand();

    await execAsync(`${cliCmd} register ${sessionId} --session-dir ${tempDir}`, {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, REFERENCE_MANAGER_LIBRARY: libraryPath },
    });

    const registrationPath = path.join(tempDir, sessionId, 'registration.json');
    const registration = JSON.parse(await fs.readFile(registrationPath, 'utf-8'));

    expect(registration).toHaveProperty('sessionId');
    expect(registration).toHaveProperty('timestamp');
    expect(registration).toHaveProperty('summary');
    expect(registration.summary).toHaveProperty('total');
    expect(registration.summary).toHaveProperty('added');
    expect(registration.summary).toHaveProperty('skipped');
    expect(registration.summary).toHaveProperty('failed');
    expect(registration.summary).toHaveProperty('noId');
    expect(registration.summary.noId).toBe(1);
  });
});
