# Task: Fix ProviderError Serialization to [object Object]

## Purpose

`createProviderError` (`src/providers/base/types.ts:162`) returns a plain object, not an
`Error` instance. When this object is thrown and caught by the search executor
(`src/cli/commands/search-executor.ts:337`), the error message extraction logic:

```typescript
const errorMessage = error instanceof Error ? error.message : String(error);
```

produces `"[object Object]"` because `String({code: "...", message: "..."})` serializes as
`"[object Object]"`. This affects **all providers** since they all use `createProviderError`.

### Evidence

Scopus search without API key produces:
```json
"error": {
  "code": "SEARCH_ERROR",
  "message": "[object Object]",
  "retryable": true
}
```

The actual error (`API_KEY_INVALID: Scopus API authentication failed: Unauthorized`) is lost.

### Affected Providers

- **Scopus**: `handleErrorResponse` throws plain object for 401/403/429/5xx errors
- **PubMed**: `createError` wraps `createProviderError` — same issue for 400/429/5xx errors
- **arXiv**: Uses `createProviderError` via base class `withRetry` error handling
- **ERIC**: Uses `createProviderError` via base class `withRetry` error handling

## Related Specs

- [spec/providers/_interface.md](../providers/_interface.md) - Error handling contract

## Related Source Files

- `src/providers/base/types.ts` - `createProviderError` function (line 162)
- `src/cli/commands/search-executor.ts` - Error message extraction (line 337)
- `src/cli/commands/resume-executor.ts` - Same pattern
- `src/providers/scopus/client.ts` - `handleErrorResponse` (line 178)
- `src/providers/pubmed/client.ts` - `createError` (line 203)

## Implementation Steps

### Step 1: Add failing test for error message extraction

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: when a provider throws a `ProviderError` (plain object), the error message
    recorded in session.json contains the actual message, not `"[object Object]"`
- [ ] Verify test fails (Red)
- [ ] Acceptance: Test demonstrates the `[object Object]` bug

### Step 2: Fix error message extraction in search-executor

- [ ] Modify `src/cli/commands/search-executor.ts` (line 337)
  - Check for `ProviderError` shape (has `message` property) before falling back to `String()`:
    ```typescript
    const errorMessage = error instanceof Error
      ? error.message
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as { message: unknown }).message)
        : String(error);
    ```
  - Alternatively, make `createProviderError` return an `Error` subclass (broader fix)
- [ ] Apply same fix to `src/cli/commands/resume-executor.ts`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: ProviderError messages are correctly extracted

### Step 3: Consider making ProviderError extend Error (optional, broader fix)

- [ ] Evaluate: change `createProviderError` to return an object that extends `Error`
  - This would make `instanceof Error` work naturally throughout the codebase
  - Check impact on existing tests and error handling patterns
- [ ] If adopted, update `src/providers/base/types.ts`
- [ ] Run full test suite to verify no regressions
- [ ] Acceptance: All error paths produce readable error messages

### Step 4: E2E verification

- [ ] Write E2E test: `src/providers/scopus/scopus.e2e.test.ts` or `src/cli/commands/search.e2e.test.ts`
  - Test: Scopus search without API key produces a meaningful error message
    (e.g., contains "authentication" or "API key"), not `"[object Object]"`
- [ ] Verify E2E test passes
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run `search-hub search --db scopus --query "test"` without API key
  and confirm the session.json error message is readable
- [ ] Acceptance: All provider error scenarios produce human-readable messages

## Notes

- This is a latent bug in all providers, but most visible with Scopus (API key required)
- PubMed rarely hits this path because searches typically succeed or return 0 results
- The fix in Step 2 is minimal and safe; Step 3 is a broader improvement that may be
  deferred if the scope is too large
