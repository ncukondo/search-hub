/**
 * Config command implementation.
 *
 * Provides functionality to view and edit configuration values.
 */
import type { Config } from '../../config/index.js';
import { ENV_VAR_MAP } from '../../config/env.js';

/**
 * Result of a config operation.
 */
export interface ConfigResult {
  success: boolean;
  value?: string;
  error?: string;
}

/**
 * Get a nested value from an object using dot notation.
 *
 * @example
 * getNestedValue({ a: { b: 1 } }, 'a.b') // returns 1
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Set a nested value in an object using dot notation.
 *
 * @example
 * setNestedValue({ a: { b: 1 } }, 'a.b', 2) // modifies obj to { a: { b: 2 } }
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1]!;
  current[lastKey] = value;
}

/**
 * Flatten a nested object into dot-notation keys.
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
): Array<{ key: string; value: unknown }> {
  const result: Array<{ key: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result.push({ key: fullKey, value });
    }
  }

  return result;
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * View all configuration values.
 */
export function viewConfig(config: Config): string {
  const flattened = flattenObject(config as unknown as Record<string, unknown>);
  const lines = flattened.map(({ key, value }) => {
    const formattedValue = formatValue(value);
    return `${key} = ${formattedValue}`;
  });
  return lines.join('\n');
}

/**
 * View a specific configuration key.
 */
export function viewConfigKey(config: Config, key: string): ConfigResult {
  const value = getNestedValue(config as unknown as Record<string, unknown>, key);

  if (value === undefined) {
    return {
      success: false,
      error: `Key "${key}" not found in configuration`,
    };
  }

  return {
    success: true,
    value: formatValue(value),
  };
}

/**
 * Parse a string value to its appropriate type.
 */
export function parseValue(value: string, existingValue: unknown): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number (if existing value is a number)
  if (typeof existingValue === 'number') {
    const num = Number(value);
    if (!isNaN(num)) return num;
  }

  // Default to string
  return value;
}

/**
 * Set a configuration key to a new value.
 * Only allows setting keys that already exist in the configuration.
 */
export function setConfigKey(config: Config, key: string, value: string): ConfigResult {
  if (!key) {
    return {
      success: false,
      error: 'Key cannot be empty',
    };
  }

  const existingValue = getNestedValue(config as unknown as Record<string, unknown>, key);

  // Reject unknown keys
  if (existingValue === undefined) {
    return {
      success: false,
      error: `Unknown configuration key: "${key}". Use "search-hub config" to see available keys.`,
    };
  }

  const parsedValue = parseValue(value, existingValue);

  setNestedValue(config as unknown as Record<string, unknown>, key, parsedValue);

  return {
    success: true,
    value: formatValue(parsedValue),
  };
}

/**
 * Write scope resolution result.
 */
export type WriteScope =
  | { scope: 'global' }
  | { scope: 'local' }
  | { scope: 'error'; error: string };

/**
 * Resolve the write scope based on flags and project context.
 */
export function resolveWriteScope(opts: {
  global: boolean;
  local: boolean;
  insideProject: boolean;
}): WriteScope {
  if (opts.global && opts.local) {
    return { scope: 'error', error: '--global and --local are mutually exclusive' };
  }
  if (opts.local && !opts.insideProject) {
    return {
      scope: 'error',
      error: '--local requires a project directory (.search-hub/). Run "search-hub init" first.',
    };
  }
  if (opts.global) return { scope: 'global' };
  if (opts.local) return { scope: 'local' };
  // Default: local if inside project, global otherwise
  return opts.insideProject ? { scope: 'local' } : { scope: 'global' };
}

/** Keys considered secrets that should not be stored in local config. */
const SECRET_KEY_SUFFIXES = ['api_key', 'inst_token', 'email'];

/**
 * Check if writing a key to local config should trigger a warning.
 * Returns warning message or null.
 */
export function checkSecretKeyWarning(key: string, scope: 'global' | 'local'): string | null {
  if (scope !== 'local') return null;
  const lastPart = key.split('.').pop() ?? '';
  if (SECRET_KEY_SUFFIXES.includes(lastPart)) {
    return `Warning: "${key}" contains sensitive data. Consider using --global to store it in the global config instead.`;
  }
  return null;
}

/**
 * Format a config value with its origin information.
 * Format: <origin>\t<path>\t<key> = <value>
 */
export function formatShowOrigin(key: string, value: string, origin: string, path: string): string {
  return `${origin}\t${path}\t${key} = ${value}`;
}

/**
 * Build show-origin output for all keys in a merged config.
 * Checks each key against env, local, global sources in priority order.
 */
export function viewConfigAllOrigins(
  merged: Config,
  envVarMap: Record<string, string>,
  localConfig: Record<string, unknown>,
  localPath: string,
  globalConfig: Record<string, unknown>,
  globalPath: string,
): string {
  const flattened = flattenObject(merged as unknown as Record<string, unknown>);
  const lines = flattened.map(({ key, value }) => {
    const formattedValue = formatValue(value);
    // Check env
    const envEntry = Object.entries(envVarMap).find(([, path]) => path === key);
    if (envEntry && process.env[envEntry[0]] !== undefined) {
      return formatShowOrigin(key, formattedValue, 'env', envEntry[0]);
    }
    // Check local
    const localVal = getNestedValue(localConfig, key);
    if (localVal !== undefined) {
      return formatShowOrigin(key, formattedValue, 'local', localPath);
    }
    // Check global
    const globalVal = getNestedValue(globalConfig, key);
    if (globalVal !== undefined) {
      return formatShowOrigin(key, formattedValue, 'global', globalPath);
    }
    // Default
    return formatShowOrigin(key, formattedValue, 'default', '');
  });
  return lines.join('\n');
}

/**
 * View config values from a partial (filtered) config object.
 */
export function viewConfigFiltered(partial: Record<string, unknown>): string {
  const flattened = flattenObject(partial);
  return flattened.map(({ key, value }) => `${key} = ${formatValue(value)}`).join('\n');
}

/**
 * Format the ENV_VAR_MAP as a human-readable table.
 */
export function formatEnvVars(): string {
  return Object.entries(ENV_VAR_MAP)
    .map(([envVar, configPath]) => `${envVar}  →  ${configPath}`)
    .join('\n');
}
