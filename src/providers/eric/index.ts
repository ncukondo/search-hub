/**
 * ERIC Provider module.
 *
 * Provides search functionality for the ERIC education database.
 */

// Provider class
export { ERICProvider } from './provider';
export type { IERICClient, ERICProviderOptions } from './provider';

// Types
export type {
  ERICDocument,
  ERICRawDocument,
  ERICSearchResponse,
  ERICConfig,
  ERICProviderState,
} from './types';

// Parser
export { parseSearchResponse, parseDocument } from './parser';
export type { ERICSearchResult } from './parser';

// Translator
export { translateQuery, translateQueryAST } from './translator';

// Client
export { ERICClient, ERIC_API_BASE_URL, DEFAULT_FIELDS } from './client';
export type { ERICSearchOptions, ERICClientConfig } from './client';

// Register provider in global registry
import { globalRegistry } from '../base';
import { ERICProvider } from './provider';

globalRegistry.register('eric', (config) => new ERICProvider(config));
