import { readFile } from 'node:fs/promises';
import { parse as parseToml } from '@iarna/toml';
import { ConfigSchema, type Config } from './schema';
import { getDefaultConfig } from './defaults';
import { applyEnvVars } from './env';
import { deepMerge, type DeepPartial } from '../utils/deep-merge';
import { expandPath } from '../utils/path';

export type RawConfig = Partial<Config>;

/**
 * Options for loadConfig function.
 */
export interface LoadConfigOptions {
  /** Path to global config file (default: ~/.search-hub/config.toml) */
  globalConfigPath?: string;
  /** Path to local config file (default: ./search-hub.config.toml) */
  localConfigPath?: string;
  /** CLI options to apply (highest priority) */
  cliOptions?: DeepPartial<Config>;
}

/**
 * Load and parse a TOML config file.
 * Returns empty object if file doesn't exist.
 * Throws with clear message if TOML is invalid.
 */
export async function loadTomlFile(path: string): Promise<RawConfig> {
  let content: string;

  try {
    content = await readFile(path, 'utf-8');
  } catch (error) {
    // File doesn't exist or can't be read
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }

  // Empty file
  if (!content.trim()) {
    return {};
  }

  try {
    return parseToml(content) as RawConfig;
  } catch (error) {
    throw new Error(
      `Invalid TOML in ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Default config file paths.
 */
const DEFAULT_GLOBAL_CONFIG_PATH = '~/.search-hub/config.toml';
const DEFAULT_LOCAL_CONFIG_PATH = './search-hub.config.toml';

/**
 * Load configuration from all sources and merge them.
 *
 * Priority (highest to lowest):
 * 1. CLI options
 * 2. Environment variables
 * 3. Local config (./search-hub.config.toml)
 * 4. Global config (~/.search-hub/config.toml)
 * 5. Default values
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<Config> {
  const {
    globalConfigPath = DEFAULT_GLOBAL_CONFIG_PATH,
    localConfigPath = DEFAULT_LOCAL_CONFIG_PATH,
    cliOptions,
  } = options;

  // 1. Start with defaults
  let config = getDefaultConfig();

  // 2. Load and merge global config
  const expandedGlobalPath = expandPath(globalConfigPath);
  const globalConfig = await loadTomlFile(expandedGlobalPath);
  config = deepMerge(config, globalConfig as DeepPartial<Config>);

  // 3. Load and merge local config
  const localConfig = await loadTomlFile(localConfigPath);
  config = deepMerge(config, localConfig as DeepPartial<Config>);

  // 4. Apply environment variables
  config = applyEnvVars(config);

  // 5. Apply CLI options (if provided)
  if (cliOptions) {
    config = deepMerge(config, cliOptions);
  }

  // 6. Validate and return
  return ConfigSchema.parse(config);
}
