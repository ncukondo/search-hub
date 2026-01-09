import envPaths from 'env-paths';
import { join } from 'node:path';

/**
 * Application paths following XDG Base Directory Specification (Linux)
 * and platform conventions (macOS, Windows) via env-paths.
 *
 * Linux:
 *   config: ~/.config/search-hub/
 *   data: ~/.local/share/search-hub/
 *
 * macOS:
 *   config: ~/Library/Preferences/search-hub/
 *   data: ~/Library/Application Support/search-hub/
 *
 * Windows:
 *   config: %APPDATA%\search-hub\Config\
 *   data: %APPDATA%\search-hub\Data\
 */
const paths = envPaths('search-hub');

export const appPaths = {
  /** Directory for configuration files */
  config: paths.config,

  /** Directory for application data */
  data: paths.data,

  /** Full path to the main config file */
  configFile: join(paths.config, 'config.toml'),

  /** Directory for session storage */
  sessionsDir: join(paths.data, 'sessions'),
} as const;
