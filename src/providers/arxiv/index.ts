/**
 * arXiv Provider Module
 *
 * Exports all arXiv provider components and registers the provider
 * with the global registry.
 */

// Export provider class
export { ArxivProvider } from './provider.js';

// Export translator
export { translateQuery, translateFieldPrefix, translateTerms } from './translator.js';

// Export parser
export { parseAtomFeed, parseEntry, extractArxivId } from './parser.js';

// Export client
export { ArxivClient } from './client.js';
export type { ArxivSearchOptions, ArxivClientConfig } from './client.js';

// Export types
export type {
  ArxivPaper,
  ArxivSearchResponse,
  ArxivConfig,
  ArxivCategory,
  ArxivVersion,
  ArxivProviderState,
} from './types.js';
export { DEFAULT_ARXIV_CONFIG } from './types.js';

// Register provider with global registry
import { globalRegistry } from '../base/registry.js';
import { ArxivProvider } from './provider.js';
import type { ArxivConfig } from './types.js';

globalRegistry.register('arxiv', (config?: ArxivConfig) => new ArxivProvider(config));
