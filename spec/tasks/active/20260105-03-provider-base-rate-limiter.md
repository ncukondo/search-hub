# Task: Provider Base & Rate Limiter

## Purpose

Create the base provider infrastructure including the abstract provider class, common types, and rate limiting utilities. This provides the foundation for implementing individual database providers (PubMed, ERIC, arXiv, Scopus).

## Related Specs

- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface specification
- [spec/models/common-types.md](../models/common-types.md) - Common type definitions
- [spec/architecture.md](../architecture.md) - Provider layer architecture

## Related Source Files

- `src/providers/base/types.ts` - Provider interfaces and common types
- `src/providers/base/provider.ts` - Abstract base class
- `src/providers/base/rate-limiter.ts` - Rate limiting utility
- `src/providers/base/index.ts` - Module exports
- `src/providers/base/*.test.ts` (co-located tests)

## Implementation Steps

### Step 1: Define Provider Types

- [x] Write test: `src/providers/base/types.test.ts`
  - Test that types compile correctly with valid data
  - Test Article type fields
  - Test Provider interface methods
- [x] Create types: `src/providers/base/types.ts`
  - Define `ProviderName` type
  - Define `Article` interface (from common-types.md)
  - Define `Author` interface
  - Define `TranslatedQuery` interface
  - Define `SearchOptions` interface
  - Define `Provider` interface
  - Define `ProviderConfig` interface
  - Define error types (`ProviderError`, `RateLimitError`, `AuthError`)
- [x] Verify types work with test data
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All types match spec/providers/_interface.md

### Step 2: Implement Token Bucket Rate Limiter

- [x] Write test: `src/providers/base/rate-limiter.test.ts`
  - Test allows requests within limit
  - Test blocks requests exceeding limit
  - Test tokens refill over time
  - Test multiple rate limiters are independent
  - Test configurable rate and burst
- [x] Create stub: `src/providers/base/rate-limiter.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `RateLimiter` class with token bucket algorithm
  - `acquire(): Promise<void>` - waits if needed
  - `tryAcquire(): boolean` - returns false if would block
  - `getWaitTime(): number` - ms until next token
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Rate limiter correctly throttles requests

### Step 3: Implement Rate Limiter with Backoff

- [x] Write test: `src/providers/base/rate-limiter.test.ts` (additional tests)
  - Test exponential backoff on 429 response
  - Test respects Retry-After header
  - Test backoff resets after success
  - Test max backoff cap
- [x] Verify tests fail (Red)
- [x] Implement:
  - `handleRateLimit(retryAfter?: number): Promise<void>`
  - Exponential backoff with jitter
  - Max backoff cap (configurable)
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Handles 429 responses gracefully

### Step 4: Create Abstract Provider Base Class

- [ ] Write test: `src/providers/base/provider.test.ts`
  - Test abstract class structure
  - Test constructor initializes rate limiter
  - Test name property
  - Test config merging (defaults + user config)
- [ ] Create stub: `src/providers/base/provider.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `abstract class BaseProvider implements Provider`
  - Constructor accepts config
  - Initialize rate limiter from config
  - Abstract methods: `search`, `translateQuery`, `testConnection`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Base class provides shared infrastructure

### Step 5: Implement Retry Logic

- [ ] Write test: `src/providers/base/provider.test.ts` (additional tests)
  - Test retries on network error
  - Test retries on 5xx server error
  - Test does not retry on 401/403
  - Test exponential backoff between retries
  - Test max retries limit
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `protected async withRetry<T>(fn: () => Promise<T>): Promise<T>`
  - Retry logic with configurable attempts
  - Handle different error types appropriately
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Retry logic handles all error scenarios from spec

### Step 6: Implement Provider Registry

- [ ] Write test: `src/providers/base/registry.test.ts`
  - Test register provider factory
  - Test get provider by name
  - Test list available providers
  - Test throws on unknown provider
- [ ] Create: `src/providers/base/registry.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `ProviderRegistry` singleton
  - `register(name: ProviderName, factory: ProviderFactory): void`
  - `get(name: ProviderName, config: ProviderConfig): Provider`
  - `list(): ProviderName[]`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Providers can register and be discovered

### Step 7: Create Mock Provider for Testing

- [ ] Write test: `src/providers/base/mock-provider.test.ts`
  - Test mock provider implements interface
  - Test returns configurable results
  - Test simulates rate limiting
  - Test simulates errors
- [ ] Create: `src/providers/base/mock-provider.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `MockProvider extends BaseProvider`
  - Configurable responses
  - Useful for testing search orchestration later
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Mock provider useful for testing

### Step 8: Create Module Index & Integration

- [ ] Write test: `src/providers/base/index.test.ts`
  - Test exports are correct
  - Test can create and use mock provider
- [ ] Create `src/providers/base/index.ts`
  - Export types
  - Export BaseProvider
  - Export RateLimiter
  - Export ProviderRegistry
  - Export MockProvider
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Module can be imported and used by provider implementations

## TDD Cycle Reference

```
+-----------------------------------------------------+
|  1. Write Test (Red)                                |
|     - Write test that describes expected behavior   |
|     - Run test -> should FAIL                       |
+-----------------------------------------------------+
|  2. Implement (Green)                               |
|     - Write minimal code to pass test               |
|     - Run test -> should PASS                       |
+-----------------------------------------------------+
|  3. Refactor                                        |
|     - npm run lint                                  |
|     - npm run typecheck                             |
|     - Clean up code if needed                       |
|     - Run test -> should still PASS                 |
+-----------------------------------------------------+
```

## Notes

- Rate limiter uses token bucket algorithm for smooth rate limiting
- Each provider type has its own rate limiter instance
- Provider implementations (PubMed, ERIC, etc.) will extend BaseProvider
- Mock provider is essential for testing higher-level components
- Error handling follows spec: network/5xx retry, 401/403 fail immediately
- Consider using `p-limit` or similar for concurrency control if needed
