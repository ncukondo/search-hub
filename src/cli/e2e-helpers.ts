/**
 * E2E Test Helper Functions
 *
 * Provides utilities for end-to-end testing of CLI commands.
 * These helpers create temp directories, manage test fixtures,
 * and execute CLI commands as subprocesses.
 */

import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { QueryAST } from '../query/types.js';

/**
 * Simplified config type for test helpers.
 * This is a subset of the full Config type that we use for generating TOML files.
 */
interface PartialProviderConfig {
  enabled?: boolean;
  api_key?: string;
  email?: string;
  rate_limit?: number;
  timeout?: number;
  retries?: number;
  max_results?: number;
}

interface PartialConfig {
  session?: {
    directory?: string;
  };
  providers?: Partial<Record<string, PartialProviderConfig>>;
}

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

/**
 * Creates a temporary directory for E2E tests.
 * Returns the absolute path to the directory.
 */
export async function createTempDir(prefix = 'search-hub-e2e-'): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

/**
 * Cleans up a temporary directory and all its contents.
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true });
}

/**
 * Executes a CLI command and returns the result.
 * Uses tsx to run the TypeScript source directly.
 */
export async function execCli(
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const cliPath = join(PROJECT_ROOT, 'src/cli/index.ts');
  const command = `npx tsx ${cliPath} ${args.join(' ')}`;

  const env = {
    ...process.env,
    ...options.env,
    // Disable color output for predictable test results
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  };

  try {
    const result = await execAsync(command, {
      cwd: options.cwd ?? PROJECT_ROOT,
      env,
      timeout: options.timeout ?? 30000,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
      exitCode: execError.code ?? 1,
    };
  }
}

/**
 * YAML format for query files (different from internal QueryAST).
 * Uses 'query' key instead of 'blocks', and snake_case for filters.
 */
interface QueryYaml {
  name: string;
  description?: string | undefined;
  query: QueryAST['blocks'];
  filters?: {
    year_from?: number | undefined;
    year_to?: number | undefined;
    language?: string[] | undefined;
    publication_types?: {
      include?: string[] | undefined;
      exclude?: string[] | undefined;
    } | undefined;
  } | undefined;
  overrides?: Record<string, unknown> | undefined;
}

/**
 * Creates a query YAML file in the temp directory.
 * Returns the absolute path to the created file.
 */
export async function createQueryFile(
  tempDir: string,
  query: QueryAST,
  filename = 'query.yaml'
): Promise<string> {
  const { stringify } = await import('yaml');
  const filePath = join(tempDir, filename);

  // Convert internal QueryAST format to YAML format
  const pubTypes = query.filters?.publicationTypes;
  const yamlObj: QueryYaml = {
    name: query.name,
    description: query.description,
    query: query.blocks,
    filters: {
      year_from: query.filters?.yearFrom,
      year_to: query.filters?.yearTo,
      language: query.filters?.languages,
      publication_types: pubTypes
        ? { include: pubTypes.include, exclude: pubTypes.exclude }
        : undefined,
    },
    overrides: query.overrides,
  };

  // Clean up undefined values
  if (!yamlObj.description) delete yamlObj.description;
  if (!yamlObj.filters?.year_from) delete yamlObj.filters?.year_from;
  if (!yamlObj.filters?.year_to) delete yamlObj.filters?.year_to;
  if (!yamlObj.filters?.language) delete yamlObj.filters?.language;
  if (!yamlObj.filters?.publication_types) delete yamlObj.filters?.publication_types;
  if (Object.keys(yamlObj.filters ?? {}).length === 0) delete yamlObj.filters;
  if (Object.keys(yamlObj.overrides ?? {}).length === 0) delete yamlObj.overrides;

  await writeFile(filePath, stringify(yamlObj), 'utf-8');
  return filePath;
}

/**
 * Creates a minimal query file for quick tests.
 */
export async function createSimpleQueryFile(
  tempDir: string,
  options: {
    name?: string;
    keyword?: string;
    filename?: string;
  } = {}
): Promise<string> {
  const { name = 'test-query', keyword = 'diabetes', filename = 'query.yaml' } = options;

  const query: QueryAST = {
    name,
    blocks: [
      {
        field: 'title_abstract',
        terms: {
          keywords: [keyword],
        },
        operator: 'AND',
      },
    ],
    filters: {
      yearFrom: 2024,
    },
    overrides: {},
  };

  return await createQueryFile(tempDir, query, filename);
}

/**
 * Creates a config file in the temp directory.
 * Returns the absolute path to the created file.
 */
export async function createConfig(
  tempDir: string,
  config: PartialConfig,
  filename = 'config.toml'
): Promise<string> {
  const filePath = join(tempDir, filename);

  // Build TOML content from config object
  const lines: string[] = [];

  if (config.session?.directory) {
    lines.push('[session]');
    lines.push(`directory = "${config.session.directory}"`);
    lines.push('');
  }

  if (config.providers) {
    for (const [provider, settings] of Object.entries(config.providers)) {
      if (settings) {
        lines.push(`[providers.${provider}]`);
        lines.push(`enabled = ${settings.enabled ?? true}`);
        if (settings.api_key) lines.push(`api_key = "${settings.api_key}"`);
        if (settings.email) lines.push(`email = "${settings.email}"`);
        if (settings.rate_limit) lines.push(`rate_limit = ${settings.rate_limit}`);
        if (settings.timeout) lines.push(`timeout = ${settings.timeout}`);
        if (settings.retries) lines.push(`retries = ${settings.retries}`);
        lines.push('');
      }
    }
  }

  await writeFile(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}

/**
 * Creates a minimal test config with sessions directory set.
 */
export async function createTestConfig(
  tempDir: string,
  sessionsDir: string,
  options: {
    pubmedApiKey?: string;
    pubmedEmail?: string;
  } = {}
): Promise<string> {
  const config: PartialConfig = {
    session: {
      directory: sessionsDir,
    },
    providers: {
      pubmed: {
        enabled: true,
        api_key: options.pubmedApiKey ?? process.env['PUBMED_API_KEY'] ?? '',
        email: options.pubmedEmail ?? process.env['PUBMED_EMAIL'] ?? 'test@example.com',
        rate_limit: 3,
        timeout: 30000,
        retries: 2,
        max_results: 10000,
      },
    },
  };

  return await createConfig(tempDir, config);
}

/**
 * Creates a sessions directory in the temp directory.
 * Returns the absolute path to the sessions directory.
 */
export async function createSessionsDir(tempDir: string): Promise<string> {
  const sessionsDir = join(tempDir, 'sessions');
  await mkdir(sessionsDir, { recursive: true });
  return sessionsDir;
}

/**
 * Creates a mock session with results in the sessions directory.
 */
export async function createMockSession(
  sessionsDir: string,
  options: {
    sessionId?: string;
    name?: string;
    status?: 'running' | 'completed' | 'failed';
    databases?: string[];
    articlesPerDb?: number;
  } = {}
): Promise<{ sessionId: string; sessionDir: string }> {
  const {
    sessionId = `${Date.now()}_test-session_abc123`,
    name = 'test-session',
    status = 'completed',
    databases = ['pubmed'],
    articlesPerDb = 3,
  } = options;

  const sessionDir = join(sessionsDir, sessionId);
  await mkdir(sessionDir, { recursive: true });

  const dbStatuses: Record<string, unknown> = {};

  for (const db of databases) {
    const articles = [];
    for (let i = 0; i < articlesPerDb; i++) {
      articles.push({
        title: `Test Article ${i + 1} from ${db}`,
        authors: [{ family: 'Test', given: 'Author' }],
        source: db,
        pmid: db === 'pubmed' ? `${30000000 + i}` : undefined,
        doi: `10.1234/${db}${i + 1}`,
        abstract: `Test abstract ${i + 1}`,
        retrievedAt: new Date().toISOString(),
      });
    }

    // Write results file
    const resultsFile = `${db}_results.jsonl`;
    await writeFile(
      join(sessionDir, resultsFile),
      articles.map((a) => JSON.stringify(a)).join('\n'),
      'utf-8'
    );

    dbStatuses[db] = {
      status: status === 'running' ? 'in_progress' : status,
      totalHits: articlesPerDb,
      retrievedCount: articlesPerDb,
      files: {
        query: `${db}_query.txt`,
        results: resultsFile,
      },
    };
  }

  // Create session.json
  const session = {
    version: 1,
    id: sessionId,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: {
      totalHits: databases.length * articlesPerDb,
      totalRetrieved: databases.length * articlesPerDb,
      status,
    },
    databases: dbStatuses,
    query: {
      file: 'query.yaml',
      hash: 'testhash123',
      targets: databases,
    },
  };

  await writeFile(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');

  return { sessionId, sessionDir };
}

/**
 * Reads a session.json file and returns its contents.
 */
export async function readSessionFile(sessionDir: string): Promise<Record<string, unknown>> {
  const content = await readFile(join(sessionDir, 'session.json'), 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Creates a sample invalid query file for testing validation errors.
 */
export async function createInvalidQueryFile(
  tempDir: string,
  filename = 'invalid-query.yaml'
): Promise<string> {
  const filePath = join(tempDir, filename);
  // Missing required 'name' field and invalid structure
  const content = `
query:
  - field: invalid_field
    terms:
      keywords: not_an_array
`;
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}
