import { readFile } from 'node:fs/promises';
import { parse as parseToml } from '@iarna/toml';
import type { Config } from './schema';

export type RawConfig = Partial<Config>;

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
