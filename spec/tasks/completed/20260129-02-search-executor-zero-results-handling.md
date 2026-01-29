# Task: Distinguish Zero Results from Provider Failure

## Purpose

The search executor currently treats a provider returning 0 results identically to a provider that
threw an error. Both produce `{ hits: 0, retrieved: 0 }` in the results map, and the status
determination logic (`search-executor.ts:364-367`) marks any provider with 0 hits/0 retrieved as
"failed". This means:

1. A legitimate search that happens to match no articles is reported as `"All providers failed"`
2. The user cannot distinguish between "no matching articles exist" and "the API request failed"
3. The exit code is 4 (network/API error) even when no error occurred

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - Exit codes section
- [spec/cli/output-formats.md](../cli/output-formats.md) - Status output format
- [spec/providers/_interface.md](../providers/_interface.md) - Error handling contract

## Related Source Files

- `src/cli/commands/search-executor.ts` - Status determination logic
- `src/cli/commands/search-executor.test.ts` - Executor unit tests
- `src/cli/commands/resume-executor.ts` - Same pattern exists for resume

## Implementation Steps

### Step 1: Add error tracking to results

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: provider returns 0 results without error → session status is `completed`
  - Test: provider throws an error → session status is `failed`
  - Test: one provider succeeds, another returns 0 (no error) → session status is `completed`
- [ ] Verify test fails (Red)
- [ ] Acceptance: Tests distinguish error vs zero-results scenarios

### Step 2: Refactor results tracking to include error state

- [ ] Modify `src/cli/commands/search-executor.ts`
  - Change results type from `{ hits: number; retrieved: number }` to
    `{ hits: number; retrieved: number; error?: string }`
  - In the catch block (line 356): set `error` field on the result
  - Update status determination (lines 364-378): only count a provider as "failed" if it has
    an `error` field, not merely because hits === 0
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: Zero-result searches produce `completed` status, error searches produce `failed`

### Step 3: Apply same fix to resume-executor

- [ ] Write test: `src/cli/commands/resume-executor.test.ts`
  - Same distinction as Step 1 but for the resume path
- [ ] Modify `src/cli/commands/resume-executor.ts` - apply same refactoring
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Resume executor also distinguishes error vs zero-results

### Step 4: E2E verification

- [ ] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - Test that a query matching 0 results exits with code 0 (not code 4)
  - Test that session status shows `completed` for zero-result searches
- [ ] Verify E2E test passes
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run a query that returns 0 results and confirm exit code 0
- [ ] Acceptance: All tests pass, zero-result searches are not treated as errors

## Notes

- This change may affect existing tests that assert `"All providers failed"` for 0-result scenarios
- The exit code table in `spec/cli/commands.md` should be reviewed: code 4 should only be for
  actual network/API errors, not for empty result sets
