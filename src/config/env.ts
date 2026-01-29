import type { Config } from './schema';
import { deepMerge, type DeepPartial } from '../utils/deep-merge';

/**
 * Maps environment variable names to config paths.
 * Path format: "section.subsection.key"
 */
export const ENV_VAR_MAP: Record<string, string> = {
  SEARCH_HUB_PUBMED_API_KEY: 'providers.pubmed.api_key',
  SEARCH_HUB_SCOPUS_API_KEY: 'providers.scopus.api_key',
  SEARCH_HUB_WOS_API_KEY: 'providers.wos.api_key',
  SEARCH_HUB_SESSION_DIR: 'session.directory',
  SEARCH_HUB_PUBMED_EMAIL: 'providers.pubmed.email',
  SEARCH_HUB_SCOPUS_INST_TOKEN: 'providers.scopus.inst_token',
  SEARCH_HUB_LOG_LEVEL: 'log.level',
};

/**
 * Set a value at a dot-separated path in an object.
 */
function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: string
): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

/**
 * Apply environment variables to config.
 * Returns a new config object with env vars applied.
 */
export function applyEnvVars(config: Config): Config {
  const overrides: Record<string, unknown> = {};

  for (const [envVar, configPath] of Object.entries(ENV_VAR_MAP)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      setPath(overrides, configPath, value);
    }
  }

  return deepMerge(config, overrides as DeepPartial<Config>);
}
