/**
 * Abstract base class for database providers.
 */

import { RateLimiter } from './rate-limiter';
import type {
  Provider,
  ProviderName,
  Article,
  TranslatedQuery,
  SearchOptions,
  QueryAstNode,
} from './types';

/**
 * Configuration options for BaseProvider.
 */
export interface BaseProviderConfig {
  /** Requests per second rate limit */
  rateLimit?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Initial backoff time in ms for exponential backoff */
  initialBackoff?: number;
  /** Maximum backoff time in ms */
  maxBackoff?: number;
}

const DEFAULT_CONFIG: Required<BaseProviderConfig> = {
  rateLimit: 3,
  timeout: 30000,
  retries: 3,
  initialBackoff: 1000,
  maxBackoff: 60000,
};

/**
 * Abstract base class for database providers.
 *
 * Provides common infrastructure:
 * - Rate limiting
 * - Configuration management
 * - Retry logic (implemented in subclass)
 */
export abstract class BaseProvider implements Provider {
  /** Provider name identifier */
  abstract readonly name: ProviderName;

  /** Rate limiter instance */
  protected readonly rateLimiter: RateLimiter;

  /** Merged configuration */
  protected readonly config: Required<BaseProviderConfig>;

  constructor(config: BaseProviderConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.rateLimiter = new RateLimiter({
      tokensPerSecond: this.config.rateLimit,
      burstSize: this.config.rateLimit,
      initialBackoff: this.config.initialBackoff,
      maxBackoff: this.config.maxBackoff,
    });
  }

  /**
   * Execute search and return results as async iterable (streaming).
   */
  abstract search(
    query: TranslatedQuery,
    options?: SearchOptions
  ): AsyncIterable<Article>;

  /**
   * Convert QueryAST to database-native syntax.
   */
  abstract translateQuery(ast: QueryAstNode): TranslatedQuery;

  /**
   * Verify API access and credentials.
   * Returns false on failure (doesn't throw).
   */
  abstract testConnection(): Promise<boolean>;
}
