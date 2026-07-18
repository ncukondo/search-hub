/**
 * Provider base module.
 *
 * Provides the foundation for implementing database providers.
 */

// Types
export type {
  ProviderName,
  Author,
  Article,
  TranslatedQuery,
  SearchOptions,
  Provider,
  ProviderError,
  RateLimitError,
  AuthError,
  QueryAST,
  ResolvedAST,
  ProviderErrorCode,
  SearchState,
  SearchResumeResult,
} from './types';

// Type guards and helpers
export { createProviderError, isProviderError, isRateLimitError, isAuthError } from './types';

// Base provider class
export { BaseProvider, serializeState, deserializeState } from './provider';
export type { BaseProviderConfig } from './provider';

// Rate limiter
export { RateLimiter } from './rate-limiter';
export type { RateLimiterOptions } from './rate-limiter';

// Provider registry
export { ProviderRegistry, createProviderRegistry, globalRegistry } from './registry';
export type { ProviderFactory } from './registry';

// Mock provider for testing
export { MockProvider } from './mock-provider';
export type { MockProviderOptions } from './mock-provider';
