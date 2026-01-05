import { ConfigSchema, type Config } from './schema';

/**
 * Default configuration for search-hub.
 * This is the base configuration that gets merged with user settings.
 */
export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

/**
 * Get a fresh copy of the default configuration.
 * Returns a new object each time to prevent mutation issues.
 */
export function getDefaultConfig(): Config {
  return ConfigSchema.parse({});
}
