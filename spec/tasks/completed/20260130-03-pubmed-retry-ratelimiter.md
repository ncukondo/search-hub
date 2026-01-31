# Task: Add Retry Logic to PubMedProvider and Consolidate Rate Limiters

## Purpose

`PubMedProvider.search()` does not use `BaseProvider.withRetry()`, so transient HTTP 429 (rate
limit) and 500 (server error) responses from the PubMed API cause immediate failure instead of
retrying with exponential backoff.

Additionally, `BaseProvider` and `PubMedClient` each create independent `RateLimiter` instances.
This wastes token budgets and causes uncoordinated rate limiting — the actual request rate can be
up to 2x the intended limit.

These issues are the root cause of flaky real-API tests in `pubmed.e2e.test.ts` (now
`pubmed.api.test.ts` after Task #24) and contribute to failures in `cli-execution.api.test.ts`.

## Related Specs

- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface, retry behavior
- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed rate limits, API key behavior

## Related Source Files

- `src/providers/base/provider.ts` - `BaseProvider` with `withRetry()` (lines 138-173) and
  `rateLimiter` (line 67)
- `src/providers/base/rate-limiter.ts` - `RateLimiter` class
- `src/providers/pubmed/provider.ts` - `PubMedProvider.search()` (8 unwrapped client calls)
- `src/providers/pubmed/client.ts` - `PubMedClient` with independent `RateLimiter` (line 54)
- `src/providers/pubmed/provider.test.ts` - Existing unit tests

## Implementation Steps

### Step 1: Write failing tests for retry behavior

- [ ] Write tests: `src/providers/pubmed/provider.test.ts`
  - Test: `search()` retries on HTTP 429 (RATE_LIMIT_EXCEEDED) from client
  - Test: `search()` retries on HTTP 500 (SERVER_ERROR) from client
  - Test: `search()` does NOT retry on HTTP 400 (INVALID_QUERY) from client
  - Test: `search()` fails after exhausting configured retry count
- [ ] Verify tests fail (Red)
- [ ] Acceptance: Tests describe expected retry behavior

### Step 2: Consolidate rate limiters — inject from BaseProvider into PubMedClient

- [ ] Modify `src/providers/pubmed/client.ts`
  - Change constructor to accept external `RateLimiter`:
    ```typescript
    constructor(config: PubMedConfig, rateLimiter: RateLimiter) {
      this.config = config;
      this.rateLimiter = rateLimiter;
    }
    ```
  - Remove internal `RateLimiter` creation (line 54)
- [ ] Modify `src/providers/pubmed/provider.ts`
  - In constructor, pass `this.rateLimiter` (inherited from BaseProvider) to PubMedClient:
    ```typescript
    this.client = new PubMedClient(config, this.rateLimiter);
    ```
  - Override rate limit based on API key presence in super() call:
    ```typescript
    super({
      ...config,
      rateLimit: config.apiKey ? 10 : (config.rateLimit ?? 3),
    });
    ```
- [ ] Verify existing tests pass (no behavioral change yet)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Single RateLimiter governs all PubMed API calls

### Step 3: Wrap PubMedProvider API calls with `withRetry()`

- [ ] Modify `src/providers/pubmed/provider.ts`
  - Wrap each `this.client.*` call with `this.withRetry()`:
    - `this.client.search()` (initial search)
    - `this.client.fetch()` (fetch by ID list)
    - `this.client.fetchFromHistory()` (fetch from web env history)
    - All similar calls in `resumeSearch()` method
  - Approximately 8 call sites total
- [ ] Verify retry tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Transient errors trigger retry with exponential backoff

### Step 4: Add handleRateLimit to client error path

- [ ] Write test: `src/providers/pubmed/client.test.ts`
  - Test: when HTTP 429 with Retry-After header, `rateLimiter.handleRateLimit()` is called
- [ ] Modify `src/providers/pubmed/client.ts`
  - In `fetchWithErrorHandling()`, when 429 is received (lines 177-188):
    - Call `this.rateLimiter.handleRateLimit(retryAfter)` before throwing
    - This ensures the rate limiter backs off appropriately for the next retry
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Rate limiter adjusts backoff on 429 responses

### Step 5: Verify other providers (ERIC, arXiv, Scopus)

- [ ] Review `src/providers/eric/provider.ts` for similar issues
- [ ] Review `src/providers/arxiv/provider.ts` for similar issues
- [ ] Review `src/providers/scopus/provider.ts` for similar issues
- [ ] If other providers have the same dual-RateLimiter or missing-retry issues, fix them
- [ ] Acceptance: All providers consistently use `withRetry()` and single RateLimiter

### Step 6: API integration test verification

- [ ] Run `npm run test:api -- --run` (from Task #24) to verify real API stability
- [ ] Run `npm run test:all -- --run` to verify no regressions
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Real API tests are more stable, all existing tests pass

## Notes

- `PubMedClient` is only used by `PubMedProvider` (verify with `find_referencing_symbols`),
  so changing its constructor signature is safe
- `BaseProvider.withRetry()` already implements exponential backoff with configurable retries
  (from `config.retries`, default 3). No new retry logic needs to be written.
- The `rateLimiter.resetBackoff()` calls in `PubMedClient` (lines 93, 124, 153) suggest the
  original author intended retry integration but never completed it
- After this task, `withRetry()` handles transient errors transparently — callers don't need
  to change
