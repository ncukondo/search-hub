import { mkdir, writeFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyToml } from '@iarna/toml';
import { getDefaultConfig } from '../../config/index.js';
import { getConfigDir, getProjectDir } from '../../config/paths.js';
import type { Config } from '../../config/index.js';

/**
 * Options for the init command.
 */
export interface InitOptions {
  /** Directory to create .search-hub/ in (defaults to cwd) */
  directory?: string;
  /** Initialize global config instead of local project */
  global?: boolean;
  /** Config directory for global init (defaults to platform-specific via getConfigDir()) */
  configDir?: string;
  /** Force overwrite if directory already exists */
  force?: boolean;
}

/**
 * Result of the init command.
 */
export interface InitResult {
  /** Whether initialization was successful */
  success: boolean;
  /** Path to the created config file */
  configPath: string;
  /** Path to the .search-hub/ project directory (local init only) */
  projectDir?: string;
  /** Whether files already existed (only when success=false) */
  alreadyExists?: boolean;
  /** Whether existing files were overwritten (only when force=true) */
  overwritten?: boolean;
  /** Message describing the result */
  message?: string;
  /** Actionable hints for the user */
  hints?: string[];
}

/**
 * Check if a file or directory exists.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert Config to TOML-compatible object for local project config.
 * Excludes secrets (api_key, email, inst_token).
 */
function localConfigToToml(config: Config): Record<string, unknown> {
  return {
    providers: {
      pubmed: {
        enabled: config.providers.pubmed.enabled,
        rate_limit: config.providers.pubmed.rate_limit,
        timeout: config.providers.pubmed.timeout,
        retries: config.providers.pubmed.retries,
        max_results: config.providers.pubmed.max_results,
      },
      eric: {
        enabled: config.providers.eric.enabled,
        rate_limit: config.providers.eric.rate_limit,
        timeout: config.providers.eric.timeout,
        retries: config.providers.eric.retries,
        max_results: config.providers.eric.max_results,
      },
      arxiv: {
        enabled: config.providers.arxiv.enabled,
        rate_limit: config.providers.arxiv.rate_limit,
        timeout: config.providers.arxiv.timeout,
        retries: config.providers.arxiv.retries,
        max_results: config.providers.arxiv.max_results,
      },
      scopus: {
        enabled: config.providers.scopus.enabled,
        rate_limit: config.providers.scopus.rate_limit,
        timeout: config.providers.scopus.timeout,
        retries: config.providers.scopus.retries,
        max_results: config.providers.scopus.max_results,
      },
      wos: {
        enabled: config.providers.wos.enabled,
      },
      embase: {
        enabled: config.providers.embase.enabled,
      },
    },
    integration: {
      reference_manager: {
        enabled: config.integration.reference_manager.enabled,
        command: config.integration.reference_manager.command,
        auto_register: config.integration.reference_manager.auto_register,
      },
    },
  };
}

/**
 * Generate TOML config content for global config with credential hints as comments.
 */
function generateGlobalConfigContent(config: Config): string {
  const tomlObj = {
    session: {
      directory: '',
    },
    log: {
      level: config.log.level,
    },
    output: {
      color: config.output.color,
      progress_bar: config.output.progress_bar,
    },
    providers: {
      pubmed: {
        enabled: config.providers.pubmed.enabled,
        rate_limit: config.providers.pubmed.rate_limit,
        timeout: config.providers.pubmed.timeout,
        retries: config.providers.pubmed.retries,
        max_results: config.providers.pubmed.max_results,
      },
      eric: {
        enabled: config.providers.eric.enabled,
        rate_limit: config.providers.eric.rate_limit,
        timeout: config.providers.eric.timeout,
        retries: config.providers.eric.retries,
        max_results: config.providers.eric.max_results,
      },
      arxiv: {
        enabled: config.providers.arxiv.enabled,
        rate_limit: config.providers.arxiv.rate_limit,
        timeout: config.providers.arxiv.timeout,
        retries: config.providers.arxiv.retries,
        max_results: config.providers.arxiv.max_results,
      },
      scopus: {
        enabled: config.providers.scopus.enabled,
        rate_limit: config.providers.scopus.rate_limit,
        timeout: config.providers.scopus.timeout,
        retries: config.providers.scopus.retries,
        max_results: config.providers.scopus.max_results,
      },
      wos: {
        enabled: config.providers.wos.enabled,
      },
      embase: {
        enabled: config.providers.embase.enabled,
      },
    },
    integration: {
      reference_manager: {
        enabled: config.integration.reference_manager.enabled,
        command: config.integration.reference_manager.command,
        auto_register: config.integration.reference_manager.auto_register,
      },
    },
  };

  const header = `# search-hub global configuration
# See: https://github.com/search-hub/search-hub for documentation

`;

  const tomlContent = stringifyToml(tomlObj as Parameters<typeof stringifyToml>[0]);

  // Add credential hints as comments after provider sections
  const lines = tomlContent.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    result.push(line);
    if (line.startsWith('[providers.pubmed]')) {
      result.push('# api_key = ""    # Optional but recommended (NCBI E-utilities)');
      result.push('# email = ""      # Required by NCBI for tracking');
    } else if (line.startsWith('[providers.scopus]')) {
      result.push('# api_key = ""    # Required for Scopus access');
      result.push('# inst_token = "" # Optional institutional token');
    } else if (line.startsWith('[providers.wos]')) {
      result.push('# api_key = ""    # Required for Web of Science');
    }
  }

  return header + result.join('\n');
}

/**
 * Generate TOML config file content for local project config.
 */
function generateLocalConfigContent(config: Config): string {
  const tomlObj = localConfigToToml(config);
  const header = `# search-hub project configuration
# Project-specific overrides (no secrets - use env vars or global config for API keys)

`;
  return header + stringifyToml(tomlObj as Parameters<typeof stringifyToml>[0]);
}

/**
 * Initialize a local .search-hub/ project directory.
 */
async function initLocal(directory: string, force: boolean): Promise<InitResult> {
  const projectDir = getProjectDir(directory);
  const configPath = join(projectDir, 'config.toml');
  const sessionsDir = join(projectDir, 'sessions');
  const queriesDir = join(projectDir, 'queries');

  const result: InitResult = {
    success: false,
    configPath,
    projectDir,
  };

  // Check if .search-hub/ already exists
  if (await exists(projectDir)) {
    if (!force) {
      return {
        ...result,
        alreadyExists: true,
        message: `Project directory already exists at ${projectDir}. Use --force to overwrite.`,
      };
    }
    result.overwritten = true;
  }

  // Create directories
  await mkdir(projectDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });
  await mkdir(queriesDir, { recursive: true });

  // Generate and write local config (no secrets)
  const defaultConfig = getDefaultConfig();
  const configContent = generateLocalConfigContent(defaultConfig);
  await writeFile(configPath, configContent, 'utf-8');

  return {
    ...result,
    success: true,
    message: result.overwritten
      ? `Project re-initialized at ${projectDir}`
      : `Project initialized at ${projectDir}`,
    hints: [
      'Set up global credentials: search-hub init --global',
      'Or use environment variables: see search-hub config --env-vars',
      'API keys can also be set via .env file in the project root',
    ],
  };
}

/**
 * Initialize the global search-hub configuration.
 */
async function initGlobal(configDir: string, force: boolean): Promise<InitResult> {
  const configPath = join(configDir, 'config.toml');

  const result: InitResult = {
    success: false,
    configPath,
  };

  // Check if config directory already exists
  if (await exists(configDir)) {
    if (!force) {
      return {
        ...result,
        alreadyExists: true,
        message: `Global configuration already exists at ${configDir}. Use --force to overwrite.`,
      };
    }
    result.overwritten = true;
  }

  // Create directory
  await mkdir(configDir, { recursive: true });

  // Generate and write global config with credential hints
  const defaultConfig = getDefaultConfig();
  const configContent = generateGlobalConfigContent(defaultConfig);
  await writeFile(configPath, configContent, 'utf-8');

  return {
    ...result,
    success: true,
    message: result.overwritten
      ? `Global configuration overwritten at ${configDir}`
      : `Global configuration created at ${configDir}`,
    hints: [
      `Edit credentials: search-hub config --global set providers.pubmed.api_key <key>`,
      `Or edit directly: ${configPath}`,
    ],
  };
}

/**
 * Initialize search-hub configuration.
 *
 * By default, creates a `.search-hub/` project directory in the specified directory (or cwd).
 * With `--global`, creates the global config at the XDG-compliant path.
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const { force = false } = options;

  if (options.global) {
    const configDir = options.configDir ?? getConfigDir();
    return initGlobal(configDir, force);
  }

  const directory = options.directory ?? process.cwd();
  return initLocal(directory, force);
}
