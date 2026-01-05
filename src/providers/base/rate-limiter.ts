/**
 * Token bucket rate limiter for API request throttling.
 */

export interface RateLimiterOptions {
  /** Number of tokens added per second */
  tokensPerSecond?: number;
  /** Maximum tokens that can be stored (burst capacity) */
  burstSize?: number;
  /** Initial backoff time in ms for exponential backoff */
  initialBackoff?: number;
  /** Maximum backoff time in ms */
  maxBackoff?: number;
}

const DEFAULT_OPTIONS: Required<RateLimiterOptions> = {
  tokensPerSecond: 3,
  burstSize: 3,
  initialBackoff: 1000,
  maxBackoff: 60000,
};

/**
 * Token bucket rate limiter.
 *
 * Implements the token bucket algorithm for smooth rate limiting.
 * Tokens are added at a fixed rate up to a maximum (burst size).
 * Each request consumes one token.
 */
export class RateLimiter {
  private tokens: number;
  private readonly tokensPerSecond: number;
  private readonly burstSize: number;
  private lastRefill: number;
  private readonly initialBackoff: number;
  private readonly maxBackoff: number;
  private currentBackoff: number;

  constructor(options: RateLimiterOptions = {}) {
    this.tokensPerSecond = options.tokensPerSecond ?? DEFAULT_OPTIONS.tokensPerSecond;
    this.burstSize = options.burstSize ?? DEFAULT_OPTIONS.burstSize;
    this.initialBackoff = options.initialBackoff ?? DEFAULT_OPTIONS.initialBackoff;
    this.maxBackoff = options.maxBackoff ?? DEFAULT_OPTIONS.maxBackoff;
    this.tokens = this.burstSize;
    this.lastRefill = Date.now();
    this.currentBackoff = this.initialBackoff;
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 1000) * this.tokensPerSecond;

    this.tokens = Math.min(this.burstSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to acquire a token without waiting.
   * @returns true if token was acquired, false if would need to wait
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Get the time in milliseconds until the next token will be available.
   * @returns 0 if a token is available now, otherwise the wait time in ms
   */
  getWaitTime(): number {
    this.refill();

    if (this.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - this.tokens;
    const secondsToWait = tokensNeeded / this.tokensPerSecond;
    return Math.ceil(secondsToWait * 1000);
  }

  /**
   * Acquire a token, waiting if necessary.
   * @returns Promise that resolves when token is acquired
   */
  async acquire(): Promise<void> {
    const waitTime = this.getWaitTime();

    if (waitTime === 0) {
      this.tokens -= 1;
      return;
    }

    await this.sleep(waitTime);
    this.refill();
    this.tokens -= 1;
  }

  /**
   * Reset the rate limiter to full capacity.
   */
  reset(): void {
    this.tokens = this.burstSize;
    this.lastRefill = Date.now();
  }

  /**
   * Handle a rate limit response (429) by waiting.
   * If retryAfter is provided, waits that long.
   * Otherwise, uses exponential backoff.
   * @param retryAfter Optional time to wait in milliseconds (from Retry-After header)
   */
  async handleRateLimit(retryAfter?: number): Promise<void> {
    if (retryAfter !== undefined) {
      await this.sleep(retryAfter);
      return;
    }

    // Use exponential backoff
    await this.sleep(this.currentBackoff);

    // Increase backoff for next time (exponential with cap)
    this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);
  }

  /**
   * Reset the exponential backoff to initial value.
   * Call this after a successful request.
   */
  resetBackoff(): void {
    this.currentBackoff = this.initialBackoff;
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
