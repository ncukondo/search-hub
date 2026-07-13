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

  describe('handleRateLimit', () => {
    it('waits for specified retryAfter time', async () => {
      const limiter = new RateLimiter();

      const promise = limiter.handleRateLimit(2000);

      // Should not resolve immediately
      let resolved = false;
      promise.then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);

      // Advance time by 2 seconds
      vi.advanceTimersByTime(2000);
      await promise;
      expect(resolved).toBe(true);
    });

    it('uses exponential backoff when no retryAfter provided', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random: () => 0.5, // jitter factor 1.0 for exact timing
      });

      // First call should wait initialBackoff
      const p1 = limiter.handleRateLimit();
      vi.advanceTimersByTime(100);
      await p1;

      // Second call should wait 2x
      const p2 = limiter.handleRateLimit();
      vi.advanceTimersByTime(200);
      await p2;

      // Third call should wait 4x
      const p3 = limiter.handleRateLimit();
      vi.advanceTimersByTime(400);
      await p3;
    });

    it('caps backoff at maxBackoff', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 1000,
        maxBackoff: 2000,
        random: () => 0.5, // jitter factor 1.0 for exact timing
      });

      // First call
      const p1 = limiter.handleRateLimit();
      vi.advanceTimersByTime(1000);
      await p1;

      // Second call (would be 2000, equal to max)
      const p2 = limiter.handleRateLimit();
      vi.advanceTimersByTime(2000);
      await p2;

      // Third call (would be 4000, but capped at 2000)
      const p3 = limiter.handleRateLimit();
      vi.advanceTimersByTime(2000);
      await p3;
    });

    it('resets backoff after resetBackoff is called', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random: () => 0.5, // jitter factor 1.0 for exact timing
      });

      // Build up backoff
      const p1 = limiter.handleRateLimit();
      vi.advanceTimersByTime(100);
      await p1;

      const p2 = limiter.handleRateLimit();
      vi.advanceTimersByTime(200);
      await p2;

      // Reset
      limiter.resetBackoff();

      // Should be back to initial
      const p3 = limiter.handleRateLimit();
      vi.advanceTimersByTime(100);
      await p3;
    });

    it('uses the injected random source for backoff', async () => {
      const random = vi.fn().mockReturnValue(0.5);
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random,
      });

      const promise = limiter.handleRateLimit();
      vi.advanceTimersByTime(100);
      await promise;

      expect(random).toHaveBeenCalled();
    });

    it('respects Retry-After even when backoff is higher', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 5000,
        maxBackoff: 10000,
      });

      // Retry-After of 1000ms should be used even though initialBackoff is 5000
      const promise = limiter.handleRateLimit(1000);
      vi.advanceTimersByTime(1000);
      await promise;
    });
  });

  describe('backoff jitter', () => {
    /** Assert that the promise resolves after exactly `ms` (not before). */
    async function expectSleepsFor(promise: Promise<void>, ms: number): Promise<void> {
      let resolved = false;
      void promise.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
    }

    it('sleeps exactly currentBackoff when random() = 0.5 (factor 1.0)', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random: () => 0.5,
      });

      await expectSleepsFor(limiter.handleRateLimit(), 100);
    });

    it('sleeps 0.75 * currentBackoff when random() = 0', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random: () => 0,
      });

      await expectSleepsFor(limiter.handleRateLimit(), 75);
    });

    it('sleeps 1.25 * currentBackoff when random() = 1', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random: () => 1,
      });

      await expectSleepsFor(limiter.handleRateLimit(), 125);
    });

    it('jittered delay never exceeds maxBackoff', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 110,
        random: () => 1,
      });

      // 100 * 1.25 = 125, capped at maxBackoff 110
      await expectSleepsFor(limiter.handleRateLimit(), 110);
    });

    it('currentBackoff still doubles deterministically regardless of jitter', async () => {
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random: () => 0,
      });

      // Growth is 100 -> 200 -> 400; sleep is always 0.75x of the current value
      await expectSleepsFor(limiter.handleRateLimit(), 75);
      await expectSleepsFor(limiter.handleRateLimit(), 150);
      await expectSleepsFor(limiter.handleRateLimit(), 300);
    });

    it('default Math.random produces varying delays within [0.75, 1.25) * backoff', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const delays: number[] = [];

      for (let i = 0; i < 100; i++) {
        // No random option: default Math.random is used
        const limiter = new RateLimiter({ initialBackoff: 1000, maxBackoff: 60000 });
        const promise = limiter.handleRateLimit();

        const lastCall = setTimeoutSpy.mock.calls.at(-1);
        delays.push(Number(lastCall?.[1]));

        await vi.advanceTimersByTimeAsync(1250);
        await promise;
      }

      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(750);
        expect(delay).toBeLessThan(1250);
      }

      // Sanity check that jitter actually varies the delays
      expect(new Set(delays).size).toBeGreaterThan(1);

      setTimeoutSpy.mockRestore();
    });

    it('does not apply jitter to the retryAfter path', async () => {
      const random = vi.fn().mockReturnValue(0);
      const limiter = new RateLimiter({
        initialBackoff: 100,
        maxBackoff: 10000,
        random,
      });

      await expectSleepsFor(limiter.handleRateLimit(1000), 1000);
      expect(random).not.toHaveBeenCalled();
    });
  });
});
