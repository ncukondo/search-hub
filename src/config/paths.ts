/**
 * Platform-specific paths using XDG Base Directory spec on Linux,
 * ~/Library on macOS, and AppData on Windows.
 */
import envPaths from 'env-paths';
import { join } from 'node:path';

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
