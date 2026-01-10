import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from '@iarna/toml';
import { ConfigSchema, type Config } from './schema.js';
import { getDefaultConfig } from './defaults.js';
import { applyEnvVars } from './env.js';
import { getDefaultConfigPath, getDefaultSessionsDir } from './paths.js';
import { deepMerge, type DeepPartial } from '../utils/deep-merge.js';
import { expandPath } from '../utils/path.js';

export type RawConfig = Partial<Config>;

/**
 * Options for loadConfig function.
 */
export interface LoadConfigOptions {
  /** Path to global config file (default: platform-specific via getDefaultConfigPath()) */
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
 * Default local config file path.
 */
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
    globalConfigPath = getDefaultConfigPath(),
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

  // 6. Validate
  config = ConfigSchema.parse(config);

  // 7. Resolve empty session.directory to platform default
  if (!config.session.directory) {
    config.session.directory = getDefaultSessionsDir();
  }

  return config;
}

/**
 * Options for saveConfig function.
 */
export interface SaveConfigOptions {
  /** Path to save config file (default: platform-specific via getDefaultConfigPath()) */
  path?: string;
  /** Create directory if it doesn't exist (default: true) */
  createDir?: boolean;
}

// Re-define JsonMap type to match @iarna/toml's expected input
// This is necessary because the library's JsonMap type is not exported
type TomlValue = boolean | number | string | Date | TomlMap | TomlValue[];
interface TomlMap {
  [key: string]: TomlValue;
}

/**
 * Save configuration to a TOML file.
 *
 * @param config - Configuration object to save
 * @param options - Save options
 * @throws Error if config is invalid or file write fails
 */
export async function saveConfig(
  config: Config,
  options: SaveConfigOptions = {}
): Promise<void> {
  const {
    path = getDefaultConfigPath(),
    createDir = true,
  } = options;

  // Validate config before saving
  ConfigSchema.parse(config);

  // Expand path and ensure directory exists
  const expandedPath = expandPath(path);
  if (createDir) {
    await mkdir(dirname(expandedPath), { recursive: true });
  }

  // Convert to TOML and write
  // Config structure is compatible with TOML's JsonMap type
  // The cast is safe because Config only contains TOML-compatible types
  const tomlContent = stringifyToml(config as TomlMap);
  await writeFile(expandedPath, tomlContent, 'utf-8');
}
