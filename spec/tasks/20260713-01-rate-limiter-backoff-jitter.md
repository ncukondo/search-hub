# Task: Rate Limiter Exponential Backoff Jitter (#4)

## Purpose

The exponential backoff in `RateLimiter.handleRateLimit()` is deterministic. When multiple clients hit a rate limit at the same time, they all retry at identical intervals, causing the "thundering herd" problem. Add random jitter (±25%) to the backoff calculation so retries spread out over time.

Resolves issue #4.

## Related Specs

- [spec/providers/_interface.md](../providers/_interface.md) - provider rate limiting behavior
- Original task: [completed/20260105-03-provider-base-rate-limiter.md](completed/20260105-03-provider-base-rate-limiter.md) - spec mentioned "Exponential backoff with jitter"

## Related Source Files

- `src/providers/base/rate-limiter.ts`
- `src/providers/base/rate-limiter.test.ts` (co-located)

## Design

In `handleRateLimit()` (currently `src/providers/base/rate-limiter.ts:123-134`), apply jitter to the sleep duration:

```typescript
// jitter factor in [0.75, 1.25)
const jitter = 1 + (Math.random() - 0.5) * 0.5;
const delay = Math.min(this.currentBackoff * jitter, this.maxBackoff);
await this.sleep(delay);
this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);
```

Notes:
- Keep `currentBackoff` growth deterministic (×2, capped at `maxBackoff`); apply jitter only to the actual sleep duration. This keeps behavior easy to reason about and test.
- The `retryAfter` path (explicit Retry-After header) must NOT get jitter — the server told us exactly how long to wait.
- Make the random source injectable (e.g. optional `random?: () => number` in `RateLimiterOptions`, defaulting to `Math.random`) so tests are deterministic.

## Implementation Steps

Each step follows the TDD cycle: Red → Green → Refactor.

- [x] Step 1: Injectable random source
  - [x] Write test: `RateLimiterOptions.random` is used by `handleRateLimit` (pass a stub returning fixed values)
  - [x] Verify test fails (Red)
  - [x] Add `random?: () => number` option, default `Math.random`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: stubbed random source is observed by handleRateLimit

- [x] Step 2: Jitter applied to backoff sleep
  - [x] Write tests (use fake timers + stubbed random):
    - `random() = 0.5` → jitter factor 1.0 → sleeps exactly `currentBackoff`
    - `random() = 0` → factor 0.75 → sleeps `0.75 * currentBackoff`
    - `random() = 1` (or close) → factor ~1.25 → sleeps `~1.25 * currentBackoff`
    - Jittered delay never exceeds `maxBackoff`
    - `currentBackoff` still doubles deterministically after each call (unaffected by jitter)
    - `handleRateLimit(retryAfter)` sleeps exactly `retryAfter` (no jitter)
  - [x] Verify tests fail (Red)
  - [x] Implement jitter in `handleRateLimit`
  - [x] Verify tests pass (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: all above behaviors verified
  - Note: three pre-existing backoff tests advance timers by the exact
    nominal backoff; they now stub `random: () => 0.5` (factor 1.0) so
    their exponential-growth assertions remain exact under default jitter.

### Final Step: E2E Integration Tests (MANDATORY)

- [x] Verify existing rate limiter tests still pass unchanged (backward compatibility)
      (three exact-timing tests stub `random: () => 0.5` — see Step 2 note)
- [x] Statistical test with real `Math.random` (no stub): over many calls, sleep durations vary within [0.75, 1.25] × backoff
- [x] Run full test suite: `npm test`
      (unit + e2e pass; api-project failures are environmental `fetch failed`
      network errors, unrelated to this change)
- [x] Acceptance: all tests pass, default behavior (no `random` option) uses jitter

## Notes

- Low priority / small change; no CLI-facing behavior change
- Do not change default backoff parameters
