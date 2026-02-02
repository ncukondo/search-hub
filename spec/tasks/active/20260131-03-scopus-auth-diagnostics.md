# Task: Improve Scopus Authentication Error Diagnostics

## Purpose

When Scopus authentication fails, the current error reporting is insufficient for diagnosis:

1. **`--dry-run` reports `✓ scopus ready`** even when the API key is invalid — it only checks
   that a key is configured, not that it works
2. **Error message lacks detail**: `Scopus API authentication failed: Unauthorized` does not
   include the HTTP status code (401 vs 403), response body, or actionable guidance
3. **No distinction between 401 (invalid key) and 403 (insufficient permissions)** — both map
   to `API_KEY_INVALID`

### Evidence

During a real search session:
- `--dry-run` showed `✓ scopus ready` (misleading — the key was invalid)
- Actual search produced: `✗ scopus failed 0/0 (Scopus API authentication failed: Unauthorized)`
- No suggestion to verify the API key or check Scopus developer portal

### Impact

- Users waste time running searches that will predictably fail
- AI agents cannot self-diagnose without specific guidance in error messages
- 401 vs 403 distinction matters: 401 = wrong key, 403 = key valid but lacking permissions

## Related Specs

- [spec/providers/scopus.md](../providers/scopus.md) - Scopus provider specification
- [spec/providers/_interface.md](../providers/_interface.md) - Error handling contract

## Related Source Files

- `src/providers/scopus/client.ts` - `handleErrorResponse()` (line 179), `testConnection()` (line 109)
- `src/providers/scopus/provider.ts` - `testConnection()` wrapper (line 149)
- `src/cli/commands/search-executor.ts` - Dry-run readiness check
- `src/providers/scopus/client.test.ts` - Error handling tests (lines 244-273)

## Implementation Steps

### Step 1: Add failing test for dry-run connection validation

- [x] Write test: `src/providers/scopus/client.test.ts`
  - Test: `testConnection()` returns `false` when API responds with 401
  - Test: `testConnection()` returns a structured result (not just boolean) with error details
- [x] Verify test fails (Red)
- [x] Acceptance: Test shows that `testConnection()` currently swallows error details

### Step 2: Enhance `testConnection()` to return error details

- [x] Modify `src/providers/scopus/client.ts`
  - Change `testConnection()` to return `{ ok: boolean; error?: string }` instead of bare boolean
  - On failure, include the specific error message (e.g., "API key invalid (HTTP 401)")
- [x] Update `src/providers/scopus/provider.ts` to propagate the detailed result
- [x] Update `src/providers/base/types.ts` if the `Provider` interface needs a richer
  `testConnection()` return type (ensure backward compatibility with other providers)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `testConnection()` returns actionable error details

### Step 3: Integrate connection test into dry-run readiness check

- [x] Write test: `src/cli/commands/search.test.ts`
  - Test: `--dry-run` with an invalid Scopus key shows `✗ scopus not ready (API key invalid)`
  - Test: `--dry-run` with a valid Scopus key shows `✓ scopus ready (verified)`
- [x] Modify the dry-run readiness check in `src/cli/commands/search.ts`
  - Call `testConnection()` for providers that support it
  - Display the error detail if connection test fails
  - Add `--skip-connection-test` flag to allow offline dry-run (just check config presence)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Dry-run accurately reflects provider availability

### Step 4: Distinguish 401 from 403 in error messages

- [x] Write test: `src/providers/scopus/client.test.ts`
  - Test: 401 produces message containing "invalid API key"
  - Test: 403 produces message containing "insufficient permissions" or "access denied"
- [x] Modify `handleErrorResponse()` in `src/providers/scopus/client.ts`
  - Split the 401/403 case into separate messages:
    - 401: `Scopus API key is invalid or expired (HTTP 401). Verify your key at https://dev.elsevier.com/`
    - 403: `Scopus API access denied (HTTP 403). Your key may lack permissions for this resource.`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Error messages distinguish between authentication and authorization failures

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/providers/scopus/scopus.e2e.test.ts`
  - Test: dry-run with invalid API key shows failure with actionable message
  - Test: search with invalid API key produces detailed error in session
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [ ] **Manual verification**: Run `search-hub search --db scopus --query "test" --dry-run`
  with an invalid key and confirm the output is actionable
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- The `testConnection()` change affects the `Provider` interface — ensure PubMed, ERIC, and arXiv
  providers still compile (they can return `{ ok: true }` by default)
- Connection testing during dry-run adds latency; consider making it opt-in or parallel
- Scopus API documentation: https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl
