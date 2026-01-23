/**
 * Config command implementation.
 *
 * Provides functionality to view and edit configuration values.
 */
import type { Config } from '../../config/index.js';

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
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
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
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
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
function flattenObject(
  obj: Record<string, unknown>,
  prefix = ''
): Array<{ key: string; value: unknown }> {
  const result: Array<{ key: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(
        ...flattenObject(value as Record<string, unknown>, fullKey)
      );
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
  const value = getNestedValue(
    config as unknown as Record<string, unknown>,
    key
  );

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
function parseValue(value: string, existingValue: unknown): unknown {
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
export function setConfigKey(
  config: Config,
  key: string,
  value: string
): ConfigResult {
  if (!key) {
    return {
      success: false,
      error: 'Key cannot be empty',
    };
  }

  const existingValue = getNestedValue(
    config as unknown as Record<string, unknown>,
    key
  );

  // Reject unknown keys
  if (existingValue === undefined) {
    return {
      success: false,
      error: `Unknown configuration key: "${key}". Use "search-hub config" to see available keys.`,
    };
  }

  const parsedValue = parseValue(value, existingValue);

  setNestedValue(
    config as unknown as Record<string, unknown>,
    key,
    parsedValue
  );

  return {
    success: true,
    value: formatValue(parsedValue),
  };
}
