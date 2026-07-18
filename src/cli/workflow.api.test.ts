/**
 * Full Workflow API Test
 *
 * Tests a complete user workflow from init to export using subprocess execution.
 * This avoids module mocking issues by running actual CLI commands.
 * Run separately with: npm run test:api
 *
 * Requires: SEARCH_HUB_PUBMED_API_KEY (workflow tests use PubMed)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { createQueryFile, createSimpleQuery } from './e2e-helpers.js';

const execAsync = promisify(exec);

const skip = !process.env['SEARCH_HUB_PUBMED_API_KEY'];

/**
 * Get the CLI command path for testing.
 */
function getCliCommand(): string {
  return 'npx tsx src/cli/index.ts';
}

/**
 * Execute CLI command and return result.
 */
async function runCli(
  args: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cmd = `${getCliCommand()} ${args}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout: 30000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
      exitCode: execError.code ?? 1,
    };
  }
}

describe.skipIf(skip)('Full Workflow API', () => {
  let tempDir: string;
  let sessionsDir: string;
  let configPath: string;
  let queryPath: string;
  const projectRoot = join(import.meta.dirname, '../..');

  beforeAll(async () => {
    // Create temp directories
    tempDir = join(tmpdir(), `search-hub-workflow-e2e-${Date.now()}`);
    sessionsDir = join(tempDir, 'sessions');
    configPath = join(tempDir, 'config.toml');

    await mkdir(sessionsDir, { recursive: true });

    // Create a test query file
    queryPath = await createQueryFile(tempDir, createSimpleQuery('workflow-test'));

    // Create config file
    const testConfig = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = true
rate_limit = 10

[providers.eric]
enabled = false

[providers.arxiv]
enabled = false

[providers.scopus]
enabled = false
`;
    await writeFile(configPath, testConfig, 'utf-8');
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should complete workflow: validate -> search -> status -> export', async () => {
    // Step 1: Validate query file
    const validateResult = await runCli(`query validate "${queryPath}"`, projectRoot);
    expect(validateResult.exitCode).toBe(0);
    expect(validateResult.stdout).toContain('Valid');

    // Step 2: Execute search (with max-results to limit API calls)
    const searchResult = await runCli(
      `search "${queryPath}" --db pubmed --max-results 3 -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(searchResult.exitCode).toBe(0);
    expect(searchResult.stdout).toContain('Search completed');
    expect(searchResult.stdout).toContain('Session:');

    // Extract session ID
    const sessionMatch = searchResult.stdout.match(/Session:\s*(\S+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionId = sessionMatch![1];

    // Step 3: Check session status
    const statusResult = await runCli(
      `status "${sessionId}" -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(statusResult.exitCode).toBe(0);
    expect(statusResult.stdout).toContain(sessionId);

    // Step 4: Export results
    const exportPath = join(tempDir, 'export.jsonl');
    const exportResult = await runCli(
      `export "${sessionId}" --format jsonl -o "${exportPath}" -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(exportResult.exitCode).toBe(0);

    // Verify export file was created and has content
    const exportContent = await readFile(exportPath, 'utf-8');
    expect(exportContent.trim().length).toBeGreaterThan(0);

    // Verify export contains valid JSONL
    const lines = exportContent.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const firstLine = lines[0];
    expect(firstLine).toBeDefined();
    const firstArticle = JSON.parse(firstLine!);
    expect(firstArticle.title).toBeDefined();
  }, 60000);

  it('should handle dry-run workflow without API calls', async () => {
    // Dry-run should complete quickly without actual API calls
    const dryRunResult = await runCli(
      `search "${queryPath}" --dry-run --db pubmed -c "${configPath}"`,
      projectRoot,
    );
    expect(dryRunResult.exitCode).toBe(0);
    expect(dryRunResult.stdout).toContain('Translated queries');
    expect(dryRunResult.stdout).toContain('[pubmed]');
  });

  it('should export in different formats', async () => {
    // First, run a search to create a session
    const searchResult = await runCli(
      `search "${queryPath}" --db pubmed --max-results 2 -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(searchResult.exitCode).toBe(0);

    const sessionMatch = searchResult.stdout.match(/Session:\s*(\S+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionId = sessionMatch![1];

    // Export as JSON
    const jsonPath = join(tempDir, 'export.json');
    const jsonResult = await runCli(
      `export "${sessionId}" --format json -o "${jsonPath}" -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(jsonResult.exitCode).toBe(0);

    const jsonContent = await readFile(jsonPath, 'utf-8');
    const articles = JSON.parse(jsonContent);
    expect(Array.isArray(articles)).toBe(true);

    // Export as IDs
    const idsPath = join(tempDir, 'ids.txt');
    const idsResult = await runCli(
      `export "${sessionId}" --format ids --id-type all -o "${idsPath}" -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(idsResult.exitCode).toBe(0);
  }, 60000);

  it('should show helpful errors for invalid inputs', async () => {
    // Missing query file
    const missingFileResult = await runCli('query validate /nonexistent/query.yaml', projectRoot);
    expect(missingFileResult.exitCode).not.toBe(0);

    // Invalid session
    const invalidSessionResult = await runCli(
      `status nonexistent-session --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(invalidSessionResult.exitCode).not.toBe(0);
  });

  it('should handle register --dry-run', async () => {
    // First, run a search to create a session
    const searchResult = await runCli(
      `search "${queryPath}" --db pubmed --max-results 2 -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(searchResult.exitCode).toBe(0);

    const sessionMatch = searchResult.stdout.match(/Session:\s*(\S+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionId = sessionMatch![1];

    // Register with dry-run (should not require ref command)
    const registerResult = await runCli(
      `register "${sessionId}" --dry-run -c "${configPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(registerResult.exitCode).toBe(0);
    expect(registerResult.stdout.toLowerCase()).toMatch(/would|dry|reference/i);
  }, 60000);

  it('should search ERIC with real API', async () => {
    // Create ERIC-enabled config
    const ericConfigPath = join(tempDir, 'eric-config.toml');
    const ericConfig = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = false

[providers.eric]
enabled = true
rate_limit = 5

[providers.arxiv]
enabled = false

[providers.scopus]
enabled = false
`;
    await writeFile(ericConfigPath, ericConfig, 'utf-8');

    // Search ERIC with real API
    const searchResult = await runCli(
      `search "${queryPath}" --db eric --max-results 3 -c "${ericConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(searchResult.exitCode).toBe(0);
    expect(searchResult.stdout).toContain('Search completed');
    expect(searchResult.stdout).toContain('eric:');

    // Extract session ID and verify export
    const sessionMatch = searchResult.stdout.match(/Session:\s*(\S+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionId = sessionMatch![1];

    const exportPath = join(tempDir, 'eric-export.jsonl');
    const exportResult = await runCli(
      `export "${sessionId}" --format jsonl -o "${exportPath}" -c "${ericConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(exportResult.exitCode).toBe(0);

    const exportContent = await readFile(exportPath, 'utf-8');
    expect(exportContent.trim().length).toBeGreaterThan(0);
  }, 60000);

  it('should search arXiv with real API', async () => {
    // Create arXiv-enabled config
    const arxivConfigPath = join(tempDir, 'arxiv-config.toml');
    const arxivConfig = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = false

[providers.eric]
enabled = false

[providers.arxiv]
enabled = true
rate_limit = 3

[providers.scopus]
enabled = false
`;
    await writeFile(arxivConfigPath, arxivConfig, 'utf-8');

    // Search arXiv with real API
    const searchResult = await runCli(
      `search "${queryPath}" --db arxiv --max-results 3 -c "${arxivConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(searchResult.exitCode).toBe(0);
    expect(searchResult.stdout).toContain('Search completed');
    expect(searchResult.stdout).toContain('arxiv:');

    // Extract session ID and verify export
    const sessionMatch = searchResult.stdout.match(/Session:\s*(\S+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionId = sessionMatch![1];

    const exportPath = join(tempDir, 'arxiv-export.jsonl');
    const exportResult = await runCli(
      `export "${sessionId}" --format jsonl -o "${exportPath}" -c "${arxivConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(exportResult.exitCode).toBe(0);

    const exportContent = await readFile(exportPath, 'utf-8');
    expect(exportContent.trim().length).toBeGreaterThan(0);
  }, 60000);

  it('should search multiple providers simultaneously with real APIs', async () => {
    // Create multi-provider config (PubMed + ERIC + arXiv)
    const multiConfigPath = join(tempDir, 'multi-config.toml');
    const multiConfig = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = true
rate_limit = 3

[providers.eric]
enabled = true
rate_limit = 3

[providers.arxiv]
enabled = true
rate_limit = 3

[providers.scopus]
enabled = false
`;
    await writeFile(multiConfigPath, multiConfig, 'utf-8');

    // Search all three providers with real APIs
    const searchResult = await runCli(
      `search "${queryPath}" --db pubmed,eric,arxiv --max-results 2 -c "${multiConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(searchResult.exitCode).toBe(0);
    expect(searchResult.stdout).toContain('Search completed');
    // Check that results from multiple providers are reported
    expect(searchResult.stdout).toContain('pubmed:');
    expect(searchResult.stdout).toContain('eric:');
    expect(searchResult.stdout).toContain('arxiv:');

    // Extract session ID
    const sessionMatch = searchResult.stdout.match(/Session:\s*(\S+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionId = sessionMatch![1];

    // Verify status shows all providers
    const statusResult = await runCli(
      `status "${sessionId}" -c "${multiConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(statusResult.exitCode).toBe(0);

    // Export and verify combined results
    const exportPath = join(tempDir, 'multi-export.jsonl');
    const exportResult = await runCli(
      `export "${sessionId}" --format jsonl -o "${exportPath}" -c "${multiConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(exportResult.exitCode).toBe(0);

    const exportContent = await readFile(exportPath, 'utf-8');
    const lines = exportContent
      .trim()
      .split('\n')
      .filter((l) => l);
    // Should have results from multiple providers
    expect(lines.length).toBeGreaterThan(0);
  }, 120000);

  it('should resume an interrupted session with real API', async () => {
    // Create config with only PubMed
    const resumeConfigPath = join(tempDir, 'resume-config.toml');
    const resumeConfig = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = true
rate_limit = 3
max_results = 5

[providers.eric]
enabled = false

[providers.arxiv]
enabled = false

[providers.scopus]
enabled = false
`;
    await writeFile(resumeConfigPath, resumeConfig, 'utf-8');

    // First search with very limited results
    const searchResult = await runCli(
      `search "${queryPath}" --db pubmed --max-results 2 -c "${resumeConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(searchResult.exitCode).toBe(0);

    const sessionMatch = searchResult.stdout.match(/Session:\s*(\S+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionId = sessionMatch![1];

    // Check status before resume
    const statusBefore = await runCli(
      `status "${sessionId}" -c "${resumeConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    expect(statusBefore.exitCode).toBe(0);

    // Attempt resume (may say "no providers need resuming" if already complete)
    const resumeResult = await runCli(
      `resume "${sessionId}" -c "${resumeConfigPath}" --session-dir "${sessionsDir}"`,
      projectRoot,
    );
    // Resume should either succeed or indicate nothing to resume
    expect(resumeResult.exitCode).toBe(0);
    expect(
      resumeResult.stdout.toLowerCase().includes('no providers') ||
        resumeResult.stdout.toLowerCase().includes('resume') ||
        resumeResult.stdout.toLowerCase().includes('completed'),
    ).toBe(true);
  }, 60000);
});
