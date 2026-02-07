# Task: Graceful Exit Code on Partial Search Success

## Purpose

When `search --count-only` or `search` succeeds on some databases but fails on others
(e.g., Scopus API key expired), the CLI exits with code 4. This makes the partial
success look like a complete failure to shell scripts and CI pipelines.

Change behavior so that partial success exits with code 0 while clearly warning about
failed databases. Add a `--strict` flag that requires all targeted databases to succeed
(exit non-zero if any fail).

## Related Specs

- [spec/cli/search.md](../cli/search.md) - search command specification

## Related Source Files

- `src/cli/commands/search-executor.ts` - `executeSearch()`, exit code logic
- `src/cli/commands/search-executor.test.ts` - existing executor tests
- `src/cli/commands/search.ts` - CLI option registration

## Implementation Steps

### Step 1: Change Default Exit Code for Partial Success

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - 3/4 databases succeed, 1 fails → exit code 0
  - All databases fail → exit code non-zero (existing behavior)
  - All databases succeed → exit code 0 (existing behavior)
  - 0 databases targeted → error (existing behavior)
- [ ] Identify where exit code is determined in `search-executor.ts`
- [ ] Verify test fails (Red)
- [ ] Change partial success to exit 0 with warning output
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Partial success exits 0

### Step 2: Add `--strict` Flag

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - `strict: true` + 3/4 succeed → exit code non-zero
  - `strict: true` + all succeed → exit code 0
  - `strict: false` (default) + 3/4 succeed → exit code 0
- [ ] Add `--strict` option to search command
- [ ] Implement strict mode check
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `--strict` enforces all-or-nothing

### Step 3: Apply to `--count-only` and `--preview` Modes

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - `--count-only` with partial failure → exit 0 (default), non-zero (strict)
  - `--preview` with partial failure → exit 0 (default), non-zero (strict)
- [ ] Ensure exit code logic applies consistently across all search modes
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Consistent exit codes across search modes

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - Search with unconfigured Scopus → exit 0, warning in output
  - Search with `--strict` and unconfigured Scopus → exit non-zero
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass

## Notes

- Currently exit code 4 is used for partial success. Need to verify this doesn't conflict
  with other exit code meanings in the codebase.
- The warning output for failed databases should remain visible (not suppressed by the
  exit code change).
- `--strict` is useful for CI pipelines that need deterministic all-or-nothing behavior.
