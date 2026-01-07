/**
 * Config module public API.
 *
 * This module provides configuration loading and management for search-hub.
 */

export { loadConfig, saveConfig, type LoadConfigOptions, type SaveConfigOptions } from './loader';
export { ConfigSchema, type Config, type ProviderConfig } from './schema';
export { getDefaultConfig, DEFAULT_CONFIG } from './defaults';
