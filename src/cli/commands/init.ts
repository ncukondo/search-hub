import { mkdir, writeFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyToml } from '@iarna/toml';
import { getDefaultConfig } from '../../config/index.js';
import { getConfigDir, getDataDir } from '../../config/paths.js';
import type { Config } from '../../config/index.js';

/**
 * Options for the init command.
 */
export interface InitOptions {
  /** Config directory (defaults to platform-specific via getConfigDir()) */
  configDir?: string;
  /** Data directory (defaults to platform-specific via getDataDir()) */
  dataDir?: string;
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
  /** Path to the sessions directory */
  sessionsDir: string;
  /** Path to the config directory */
  configDir: string;
  /** Path to the data directory */
  dataDir: string;
  /** Whether files already existed (only when success=false) */
  alreadyExists?: boolean;
  /** Whether existing files were overwritten (only when force=true) */
  overwritten?: boolean;
  /** Message describing the result */
  message?: string;
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
 * Convert Config to TOML-compatible object.
 * Removes undefined values and converts to the expected format.
 */
function configToToml(config: Config): Record<string, unknown> {
  return {
    session: {
      directory: config.session.directory,
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
        api_key: config.providers.pubmed.api_key ?? '',
        email: config.providers.pubmed.email ?? '',
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
        api_key: config.providers.scopus.api_key ?? '',
        inst_token: config.providers.scopus.inst_token ?? '',
        rate_limit: config.providers.scopus.rate_limit,
        timeout: config.providers.scopus.timeout,
        retries: config.providers.scopus.retries,
        max_results: config.providers.scopus.max_results,
      },
      wos: {
        enabled: config.providers.wos.enabled,
        api_key: config.providers.wos.api_key ?? '',
        rate_limit: config.providers.wos.rate_limit,
        timeout: config.providers.wos.timeout,
        retries: config.providers.wos.retries,
        max_results: config.providers.wos.max_results,
      },
      embase: {
        enabled: config.providers.embase.enabled,
        rate_limit: config.providers.embase.rate_limit,
        timeout: config.providers.embase.timeout,
        retries: config.providers.embase.retries,
        max_results: config.providers.embase.max_results,
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
 * Generate TOML config file content with comments.
 */
function generateConfigContent(config: Config): string {
  const tomlObj = configToToml(config);
  const header = `# search-hub configuration file
# See: https://github.com/search-hub/search-hub for documentation

`;
  return header + stringifyToml(tomlObj as Parameters<typeof stringifyToml>[0]);
}

/**
 * Initialize the search-hub configuration directory.
 *
 * Creates:
 * - Config directory with config.toml
 * - Data directory with sessions/ subdirectory
 *
 * On Linux (XDG):
 * - ~/.config/search-hub/config.toml
 * - ~/.local/share/search-hub/sessions/
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const {
    configDir = getConfigDir(),
    dataDir = getDataDir(),
    force = false,
  } = options;

  const configPath = join(configDir, 'config.toml');
  const sessionsDir = join(dataDir, 'sessions');

  const result: InitResult = {
    success: false,
    configPath,
    sessionsDir,
    configDir,
    dataDir,
  };

  // Check if config directory already exists
  if (await exists(configDir)) {
    if (!force) {
      return {
        ...result,
        alreadyExists: true,
        message: `Configuration directory already exists at ${configDir}. Use --force to overwrite.`,
      };
    }
    result.overwritten = true;
  }

  // Create directories
  await mkdir(configDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });

  // Generate and write config file
  // Use the default sessions directory for the saved config
  const defaultConfig = getDefaultConfig();
  // Set session.directory to the actual sessions path for the config file
  defaultConfig.session.directory = sessionsDir;
  const configContent = generateConfigContent(defaultConfig);
  await writeFile(configPath, configContent, 'utf-8');

  return {
    ...result,
    success: true,
    message: result.overwritten
      ? `Configuration overwritten at ${configDir}`
      : `Configuration created at ${configDir}`,
  };
}
