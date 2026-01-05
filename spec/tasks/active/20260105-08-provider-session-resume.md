# Task: Provider Session Resume Extension

## Purpose

Extend the BaseProvider class to support search session resume functionality. This enables users to interrupt searches and resume from where they left off, handling network failures gracefully and persisting progress across application restarts.

## Related Specs

- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface contract
- [spec/models/session.md](../models/session.md) - Session storage specification
- [spec/decisions/005-provider-session-resume.md](../decisions/005-provider-session-resume.md) - Architecture decision

## Related Source Files

- `src/providers/base/types.ts` - Add SearchState types
- `src/providers/base/provider.ts` - Add abstract methods to BaseProvider
- `src/providers/base/*.test.ts` (co-located tests)

## Implementation Steps

### Step 1: Define SearchState Types

- [ ] Write test: `src/providers/base/types.test.ts` (additional tests)
  - Test SearchState interface structure
  - Test type compatibility with provider-specific states
- [ ] Update types: `src/providers/base/types.ts`
  - Add `SearchState` interface
    ```typescript
    interface SearchState {
      provider: ProviderName;
      query: TranslatedQuery;
      totalResults: number;
      retrievedCount: number;
      lastUpdated: Date;
      providerState?: unknown;
    }
    ```
  - Add `SearchResumeResult` for resume validation
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Types support both common and provider-specific state

### Step 2: Add Abstract Methods to BaseProvider

- [ ] Write test: `src/providers/base/provider.test.ts` (additional tests)
  - Test abstract methods are defined
  - Test MockProvider implements new methods
  - Test state serialization/deserialization
- [ ] Verify tests fail (Red)
- [ ] Update: `src/providers/base/provider.ts`
  - Add `abstract getSearchState(): SearchState | null`
  - Add `abstract resumeSearch(state: SearchState): AsyncIterable<Article>`
  - Add `abstract validateState(state: SearchState): Promise<boolean>`
  - Add protected helper: `protected createBaseState(query, total, retrieved): SearchState`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: BaseProvider defines session resume contract

### Step 3: Update MockProvider for Testing

- [ ] Write test: `src/providers/base/mock-provider.test.ts` (additional tests)
  - Test getSearchState returns current state
  - Test resumeSearch continues from offset
  - Test validateState returns configurable result
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - MockProvider implements new abstract methods
  - Configurable state validation behavior
  - Simulates resume from offset
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: MockProvider useful for testing session integration

### Step 4: Add State Persistence Helpers

- [ ] Write test: `src/providers/base/provider.test.ts` (additional tests)
  - Test state can be serialized to JSON
  - Test state can be deserialized from JSON
  - Test providerState is preserved through serialization
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `serializeState(state: SearchState): string`
  - `deserializeState(json: string): SearchState`
  - Handle Date serialization properly
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: State can be persisted to session storage

### Step 5: Update Module Exports

- [ ] Update `src/providers/base/index.ts`
  - Export `SearchState` type
  - Export serialization helpers
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: New types and methods available for provider implementations

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

- This task extends the completed Provider Base (Task 5)
- Each provider implementation (Tasks 6-9) will implement the abstract methods
- Session Manager integration happens at CLI level (Task 10)
- PubMed uses server-side history (webenv/querykey) - has expiration
- Other providers use simple offset-based pagination
- State validation ensures expired/invalid states are detected before resume
- See ADR-005 for architectural rationale
