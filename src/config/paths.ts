/**
 * Platform-specific paths using XDG Base Directory spec on Linux,
 * ~/Library on macOS, and AppData on Windows.
 */
import envPaths from 'env-paths';
import { join } from 'node:path';
import { access } from 'node:fs/promises';

// Use empty suffix to get clean 'search-hub' directory names
const paths = envPaths('search-hub', { suffix: '' });

/**
 * Get the config directory for search-hub.
 * - Linux: ~/.config/search-hub
 * - macOS: ~/Library/Preferences/search-hub
 * - Windows: %APPDATA%\search-hub\Config
 */
export function getConfigDir(): string {
  return paths.config;
}

/**
 * Get the data directory for search-hub.
 * - Linux: ~/.local/share/search-hub
 * - macOS: ~/Library/Application Support/search-hub
 * - Windows: %LOCALAPPDATA%\search-hub\Data
 */
export function getDataDir(): string {
  return paths.data;
}

/**
 * Get the default config file path.
 */
export function getDefaultConfigPath(): string {
  return join(paths.config, 'config.toml');
}

/**
 * Get the default sessions directory.
 */
export function getDefaultSessionsDir(): string {
  return join(paths.data, 'sessions');
}

/** Name of the project-local directory. */
const PROJECT_DIR_NAME = '.search-hub';

/**
 * Get the project directory path (.search-hub/) relative to a base directory.
 * Defaults to cwd.
 */
export function getProjectDir(baseDir?: string): string {
  return join(baseDir ?? process.cwd(), PROJECT_DIR_NAME);
}

/**
 * Get the local config file path (.search-hub/config.toml).
 */
export function getLocalConfigPath(baseDir?: string): string {
  return join(getProjectDir(baseDir), 'config.toml');
}

/**
 * Get the local sessions directory (.search-hub/sessions/).
 */
export function getLocalSessionsDir(baseDir?: string): string {
  return join(getProjectDir(baseDir), 'sessions');
}

/**
 * Get the local queries directory (.search-hub/queries/).
 */
export function getLocalQueriesDir(baseDir?: string): string {
  return join(getProjectDir(baseDir), 'queries');
}

/**
 * Check if the given directory (default: cwd) contains a .search-hub/ project directory.
 */
export async function isInsideProject(baseDir?: string): Promise<boolean> {
  try {
    await access(getProjectDir(baseDir));
    return true;
  } catch {
    return false;
  }
}
