/**
 * PubMed Provider Module.
 *
 * Provides access to NCBI's PubMed database for biomedical literature searches.
 *
 * @example
 * ```typescript
 * import { PubMedProvider, translateQuery } from './providers/pubmed';
 *
 * const provider = new PubMedProvider({ email: 'your@email.com' });
 * const query = provider.translateQuery(ast);
 *
 * for await (const article of provider.search(query)) {
 *   console.log(article.title);
 * }
 * ```
 */

// Provider class
export { PubMedProvider } from './provider.js';

// Types
export type {
  PubMedArticle,
  PubMedConfig,
  ESearchResponse,
  EFetchResponse,
  ELinkOptions,
  ELinkResponse,
  RelatedArticle,
  PubMedProviderState,
} from './types.js';

// Query translator
export { translateQuery } from './translator.js';

// Parser functions
export { parseESearchResponse, parseEFetchResponse, parseELinkResponse } from './parser.js';
export type { EFetchResult } from './parser.js';

// HTTP client
export { PubMedClient } from './client.js';
export type { SearchOptions, HistoryFetchOptions } from './client.js';

// Re-export commonly used base types for convenience
export {
  createProviderRegistry,
  globalRegistry,
  BaseProvider,
  RateLimiter,
  createProviderError,
  isProviderError,
  isRateLimitError,
  isAuthError,
  serializeState,
  deserializeState,
} from '../base/index.js';

export type {
  ProviderName,
  Author,
  Article,
  TranslatedQuery,
  SearchOptions as BaseSearchOptions,
  Provider,
  ProviderError,
  SearchState,
  SearchResumeResult,
  QueryAST,
} from '../base/index.js';
