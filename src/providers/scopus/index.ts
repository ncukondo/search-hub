/**
 * Scopus Provider Module
 *
 * Exports the Scopus provider implementation for use in search-hub.
 */

// Provider class
export { ScopusProvider } from './provider';

// Client class
export { ScopusClient } from './client';
export type { ScopusClientResponse, ScopusRateLimitInfo, ScopusSearchOptions } from './client';

// Query translator
export { translateQuery } from './translator';

// Response parser
export { parseSearchResponse, parseDocument } from './parser';

// Types
export type {
  ScopusConfig,
  ScopusDocument,
  ScopusAuthor,
  ScopusSearchResponse,
  ScopusRawEntry,
  ScopusProviderState,
} from './types';

// Registry integration
import type { ProviderRegistry } from '../base/registry';
import type { ScopusConfig } from './types';
import { ScopusProvider } from './provider';

/**
 * Register the Scopus provider with a registry.
 *
 * @param registry The provider registry to register with
 * @param defaultConfig Default configuration for the provider
 */
export function registerScopusProvider(
  registry: ProviderRegistry,
  defaultConfig: ScopusConfig,
): void {
  registry.register('scopus', (config) => {
    const mergedConfig: ScopusConfig = {
      ...defaultConfig,
      ...config,
    };
    return new ScopusProvider(mergedConfig);
  });
}
