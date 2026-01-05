import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates limiter with default options', () => {
      const limiter = new RateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('creates limiter with custom rate', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 10 });
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('creates limiter with custom burst', () => {
      const limiter = new RateLimiter({ burstSize: 5 });
      expect(limiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('tryAcquire', () => {
    it('allows requests within limit', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 3, burstSize: 3 });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
    });

    it('blocks requests exceeding limit', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 2, burstSize: 2 });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('tokens refill over time', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 1, burstSize: 1 });

      // Use the token
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Token should be refilled
      expect(limiter.tryAcquire()).toBe(true);
    });

    it('partial token refill', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 2, burstSize: 2 });

      // Use both tokens
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      // Advance time by 500ms (should refill 1 token)
      vi.advanceTimersByTime(500);

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('tokens do not exceed burst size', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 10, burstSize: 3 });

      // Wait a long time - should still only have burstSize tokens
      vi.advanceTimersByTime(10000);

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });
  });

  describe('getWaitTime', () => {
    it('returns 0 when tokens available', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 3, burstSize: 3 });
      expect(limiter.getWaitTime()).toBe(0);
    });

    it('returns time until next token when empty', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 2, burstSize: 2 });

      // Exhaust tokens
      limiter.tryAcquire();
      limiter.tryAcquire();

      // Wait time should be around 500ms (1/2 second for 2 tokens/sec)
      const waitTime = limiter.getWaitTime();
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(500);
    });

    it('wait time decreases as time passes', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 1, burstSize: 1 });

      limiter.tryAcquire();
      const initialWait = limiter.getWaitTime();

      vi.advanceTimersByTime(500);
      const laterWait = limiter.getWaitTime();

      expect(laterWait).toBeLessThan(initialWait);
    });
  });

  describe('acquire', () => {
    it('resolves immediately when tokens available', async () => {
      const limiter = new RateLimiter({ tokensPerSecond: 3, burstSize: 3 });

      const start = Date.now();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it('waits when tokens exhausted', async () => {
      const limiter = new RateLimiter({ tokensPerSecond: 1, burstSize: 1 });

      // Exhaust tokens
      await limiter.acquire();

      // Start acquire that should wait
      const acquirePromise = limiter.acquire();

      // Advance time
      vi.advanceTimersByTime(1000);

      await acquirePromise;
      // If we get here, acquire completed after waiting
    });

    it('multiple acquires queue properly', async () => {
      const limiter = new RateLimiter({ tokensPerSecond: 1, burstSize: 1 });

      const results: number[] = [];

      // Start multiple acquires
      const p1 = limiter.acquire().then(() => results.push(1));
      const p2 = limiter.acquire().then(() => results.push(2));
      const p3 = limiter.acquire().then(() => results.push(3));

      // First should complete immediately
      await Promise.resolve();
      expect(results).toContain(1);

      // Advance time for second
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      // Advance time for third
      vi.advanceTimersByTime(1000);
      await Promise.all([p1, p2, p3]);

      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe('multiple rate limiters', () => {
    it('are independent', () => {
      const limiter1 = new RateLimiter({ tokensPerSecond: 1, burstSize: 1 });
      const limiter2 = new RateLimiter({ tokensPerSecond: 1, burstSize: 1 });

      // Exhaust limiter1
      expect(limiter1.tryAcquire()).toBe(true);
      expect(limiter1.tryAcquire()).toBe(false);

      // limiter2 should be unaffected
      expect(limiter2.tryAcquire()).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets tokens to burst size', () => {
      const limiter = new RateLimiter({ tokensPerSecond: 3, burstSize: 3 });

      // Exhaust tokens
      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.tryAcquire()).toBe(false);

      // Reset
      limiter.reset();

      // Should have full tokens again
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
    });
  });
});
