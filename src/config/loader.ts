import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from '@iarna/toml';
import { ConfigSchema, type Config } from './schema.js';
import { getDefaultConfig } from './defaults.js';
import { applyEnvVars } from './env.js';
import {
  getDefaultConfigPath,
  getDefaultSessionsDir,
  getLocalConfigPath,
  getLocalSessionsDir,
  isInsideProject,
} from './paths.js';
import { deepMerge, type DeepPartial } from '../utils/deep-merge.js';
import { expandPath } from '../utils/path.js';

export type RawConfig = Partial<Config>;

/**
 * Options for loadConfig function.
 */
export interface LoadConfigOptions {
  /** Path to global config file (default: platform-specific via getDefaultConfigPath()) */
  globalConfigPath?: string;
  /** Path to local config file (default: .search-hub/config.toml via getLocalConfigPath()) */
  localConfigPath?: string;
  /** Project directory for .search-hub/ resolution (default: cwd) */
  projectDir?: string;
  /**
   * Explicit config file path specified via CLI --config option.
   * Takes priority over global and local config files (applied after env vars).
   */
  explicitConfigPath?: string;
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
      `Invalid TOML in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Load configuration from all sources and merge them.
 *
 * Priority (highest to lowest):
 * 1. CLI options (cliOptions)
 * 2. Explicit --config file (explicitConfigPath)
 * 3. Environment variables
 * 4. Local config (.search-hub/config.toml)
 * 5. Global config (platform-specific, e.g. ~/.config/search-hub/config.toml on Linux)
 * 6. Default values
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<Config> {
  const {
    globalConfigPath = getDefaultConfigPath(),
    localConfigPath = getLocalConfigPath(),
    projectDir,
    explicitConfigPath,
    cliOptions,
  } = options;

  // 1. Start with defaults
  let config = getDefaultConfig();

  // 2. Load and merge global config (lowest file priority)
  const expandedGlobalPath = expandPath(globalConfigPath);
  const globalConfig = await loadTomlFile(expandedGlobalPath);
  config = deepMerge(config, globalConfig as DeepPartial<Config>);

  // 3. Load and merge local config (overrides global)
  const localConfig = await loadTomlFile(localConfigPath);
  config = deepMerge(config, localConfig as DeepPartial<Config>);

  // 4. Apply environment variables (overrides local)
  config = applyEnvVars(config);

  // 5. Apply explicit --config file (overrides env vars, local, and global)
  if (explicitConfigPath) {
    const expandedExplicitPath = expandPath(explicitConfigPath);
    const explicitConfig = await loadTomlFile(expandedExplicitPath);
    config = deepMerge(config, explicitConfig as DeepPartial<Config>);
  }

  // 6. Apply CLI options (highest priority)
  if (cliOptions) {
    config = deepMerge(config, cliOptions);
  }

  // 7. Validate
  config = ConfigSchema.parse(config);

  // 8. Resolve empty session.directory based on project context
  if (!config.session.directory) {
    const inProject = projectDir ? await isInsideProject(projectDir) : false;
    config.session.directory = inProject
      ? getLocalSessionsDir(projectDir)
      : getDefaultSessionsDir();
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
export async function saveConfig(config: Config, options: SaveConfigOptions = {}): Promise<void> {
  const { path = getDefaultConfigPath(), createDir = true } = options;

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
