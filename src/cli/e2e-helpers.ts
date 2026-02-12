/**
 * E2E Test Helpers
 *
 * Reusable utilities for E2E testing of CLI commands.
 * These helpers manage temp directories, query files, config files,
 * and CLI execution.
 */
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type SpawnOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { QueryAST } from '../query/types.js';
import type { ProviderConfig } from '../config/schema.js';

/**
 * Partial provider configuration for testing.
 * All fields are optional to allow minimal test configs.
 */
export type PartialProviderConfig = Partial<ProviderConfig>;

/**
 * Partial config type for creating test configurations.
 * All fields are optional to allow minimal test configs.
 */
export interface PartialConfig {
  session?: { directory?: string };
  log?: { level?: 'debug' | 'info' | 'warn' | 'error' };
  output?: { color?: boolean; progress_bar?: boolean };
  providers?: Partial<Record<string, PartialProviderConfig>>;
  integration?: {
    reference_manager?: {
      enabled?: boolean;
      command?: string;
      auto_register?: boolean;
      with_abstracts?: boolean;
    };
  };
}
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Result of CLI execution
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Options for CLI execution
 */
export interface ExecOptions {
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Input to pass to stdin */
  input?: string;
}

/**
 * E2E test context containing temp directories and cleanup
 */
export interface E2EContext {
  /** Root temp directory for this test */
  tempDir: string;
  /** Sessions directory */
  sessionsDir: string;
  /** Path to config file */
  configPath: string;
  /** Clean up all test artifacts */
  cleanup: () => Promise<void>;
}

/**
 * Create a temporary directory for E2E tests.
 * Returns a unique directory path that can be cleaned up later.
 */
export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'search-hub-e2e-'));
}

/**
 * Set up a complete E2E test context with temp dirs and config.
 * Call cleanup() after tests to remove all artifacts.
 */
export async function setupE2EContext(): Promise<E2EContext> {
  const tempDir = await createTempDir();
  const sessionsDir = join(tempDir, 'sessions');
  const configPath = join(tempDir, 'config.toml');

  await mkdir(sessionsDir, { recursive: true });

  // Create minimal config file
  const configContent = `
[session]
directory = "${sessionsDir}"

[providers.pubmed]
enabled = true
rate_limit = 3
timeout = 30000
retries = 2

[providers.eric]
enabled = true
rate_limit = 3
timeout = 30000
retries = 2

[providers.arxiv]
enabled = true
rate_limit = 3
timeout = 30000
retries = 2

[providers.scopus]
enabled = false
`;
  await writeFile(configPath, configContent, 'utf-8');

  return {
    tempDir,
    sessionsDir,
    configPath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * Execute CLI command as a subprocess.
 * Returns stdout, stderr, and exit code.
 */
export async function execCli(
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { env = {}, cwd, timeout = 30000, input } = options;

  // Path to the CLI entry point (dist/cli/index.js)
  const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd,
      env: { ...process.env, ...env, NO_COLOR: '1' },
      stdio: input ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe'],
    };

    const child = spawn('node', [cliPath, ...args], spawnOptions);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI execution timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Create a query YAML file from a QueryAST object.
 * Returns the path to the created file.
 */
export async function createQueryFile(
  tempDir: string,
  query: QueryAST,
  filename = 'query.yaml'
): Promise<string> {
  const filePath = join(tempDir, filename);

  // Convert QueryAST to YAML-compatible format (snake_case)
  const yamlContent = {
    name: query.name,
    description: query.description,
    query: query.blocks.map((block) => ({
      id: block.id,
      field: block.field,
      terms: {
        keywords: block.terms.keywords,
        ...(block.terms.mesh && { mesh: block.terms.mesh }),
        ...(block.terms.emtree && { emtree: block.terms.emtree }),
      },
      operator: block.operator,
    })),
    filters: {
      ...(query.filters.yearFrom !== undefined && {
        year_from: query.filters.yearFrom,
      }),
      ...(query.filters.yearTo !== undefined && {
        year_to: query.filters.yearTo,
      }),
      ...(query.filters.languages && { languages: query.filters.languages }),
      ...(query.filters.publicationTypes && {
        publication_types: query.filters.publicationTypes,
      }),
    },
    ...(query.providers && Object.keys(query.providers).length > 0 && {
      providers: query.providers,
    }),
  };

  await writeFile(filePath, YAML.stringify(yamlContent), 'utf-8');
  return filePath;
}

/**
 * Create a raw YAML query file from string content.
 * Useful for testing invalid queries.
 */
export async function createRawQueryFile(
  tempDir: string,
  content: string,
  filename = 'query.yaml'
): Promise<string> {
  const filePath = join(tempDir, filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Create a config TOML file.
 * Returns the path to the created file.
 */
export async function createConfig(
  tempDir: string,
  config: PartialConfig,
  filename = 'config.toml'
): Promise<string> {
  const filePath = join(tempDir, filename);

  // Build TOML content from config object
  const lines: string[] = [];

  if (config.session) {
    lines.push('[session]');
    if (config.session.directory) {
      lines.push(`directory = "${config.session.directory}"`);
    }
    lines.push('');
  }

  if (config.log) {
    lines.push('[log]');
    if (config.log.level) {
      lines.push(`level = "${config.log.level}"`);
    }
    lines.push('');
  }

  if (config.output) {
    lines.push('[output]');
    if (config.output.color !== undefined) {
      lines.push(`color = ${config.output.color}`);
    }
    if (config.output.progress_bar !== undefined) {
      lines.push(`progress_bar = ${config.output.progress_bar}`);
    }
    lines.push('');
  }

  if (config.providers) {
    for (const [name, provider] of Object.entries(config.providers)) {
      if (provider) {
        lines.push(`[providers.${name}]`);
        if (provider.enabled !== undefined) {
          lines.push(`enabled = ${provider.enabled}`);
        }
        if (provider.api_key) {
          lines.push(`api_key = "${provider.api_key}"`);
        }
        if (provider.email) {
          lines.push(`email = "${provider.email}"`);
        }
        if (provider.rate_limit !== undefined) {
          lines.push(`rate_limit = ${provider.rate_limit}`);
        }
        if (provider.timeout !== undefined) {
          lines.push(`timeout = ${provider.timeout}`);
        }
        if (provider.retries !== undefined) {
          lines.push(`retries = ${provider.retries}`);
        }
        lines.push('');
      }
    }
  }

  if (config.integration?.reference_manager) {
    lines.push('[integration.reference_manager]');
    const rm = config.integration.reference_manager;
    if (rm.enabled !== undefined) {
      lines.push(`enabled = ${rm.enabled}`);
    }
    if (rm.command) {
      lines.push(`command = "${rm.command}"`);
    }
    if (rm.auto_register !== undefined) {
      lines.push(`auto_register = ${rm.auto_register}`);
    }
    lines.push('');
  }

  await writeFile(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}

/**
 * Create a raw TOML config file from string content.
 * Useful for testing invalid configs.
 */
export async function createRawConfig(
  tempDir: string,
  content: string,
  filename = 'config.toml'
): Promise<string> {
  const filePath = join(tempDir, filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Create a simple test query for use in E2E tests.
 * This is a minimal valid query that can be used across all providers.
 */
export function createSimpleQuery(name = 'test-query'): QueryAST {
  return {
    name,
    description: 'Test query for E2E tests',
    blocks: [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes', 'mellitus'],
        },
        operator: 'AND',
      },
    ],
    filters: {
      yearFrom: 2024,
    },
  };
}

/**
 * Sample query fixtures for different test scenarios
 */
export const queryFixtures = {
  /** Simple single-block query */
  simple: createSimpleQuery('simple-test'),

  /** Multi-block query with filters */
  multiBlock: {
    name: 'multi-block-test',
    description: 'Multi-block query for testing',
    blocks: [
      {
        id: 'block-1',
        field: 'title_abstract' as const,
        terms: { keywords: ['diabetes'] },
        operator: 'AND' as const,
      },
      {
        id: 'block-2',
        field: 'keyword' as const,
        terms: { keywords: ['treatment', 'therapy'] },
        operator: 'OR' as const,
      },
    ],
    filters: {
      yearFrom: 2020,
      yearTo: 2024,
      languages: ['en'],
    },
  } satisfies QueryAST,

  /** Query with MeSH terms (PubMed-specific) */
  withMesh: {
    name: 'mesh-test',
    blocks: [
      {
        id: 'block-1',
        field: 'title_abstract' as const,
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus, Type 2'],
        },
        operator: 'AND' as const,
      },
    ],
    filters: {},
  } satisfies QueryAST,
};

/**
 * Invalid query fixtures for error testing
 */
export const invalidQueryFixtures = {
  /** Missing required name field */
  missingName: `
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
`,

  /** Invalid field type */
  invalidField: `
name: invalid-field-test
query:
  - field: invalid_field
    terms:
      keywords:
        - test
    operator: AND
`,

  /** Empty keywords */
  emptyKeywords: `
name: empty-keywords-test
query:
  - field: title_abstract
    terms:
      keywords: []
    operator: AND
`,

  /** Malformed YAML */
  malformedYaml: `
name: test
query:
  - field: title_abstract
    terms:
      keywords
        - missing colon
`,
};
