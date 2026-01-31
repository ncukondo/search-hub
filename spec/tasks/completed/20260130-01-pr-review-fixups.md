# Task: Fix PR Review Issues (PR #25 and PR #26)

## Purpose

Senior code review identified issues in PR #25 (Tasks #19/#22) and PR #26 (Task #20) that should
be addressed before merge:

- PR #25: `resume-executor.ts` null handler missing `updateDatabaseStatus`, hardcoded error
  message, string concatenation style
- PR #26: `formatDryRunOutput()` new parameters never passed from CLI entry point (`index.ts`),
  so the provider readiness and diagnostics features are not visible to CLI users

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - CLI command behavior

## Related Source Files

### PR #25 (worktree: `feat/ux-improvements`)
- `src/cli/commands/resume-executor.ts` - null provider handler (lines 117-120)
- `src/cli/commands/search-executor.ts` - hardcoded error message (line 274), string concat (lines 73-77, 104-106)
- `src/cli/commands/search-executor.test.ts` - tests for updated behavior

### PR #26 (worktree: `feat/dry-run-diagnostics`)
- `src/cli/index.ts` - dry-run path (lines 434-471), config not loaded for dry-run
- `src/cli/commands/search.ts` - `formatDryRunOutput` with optional `DryRunOutputOptions`
- `src/cli/commands/search.e2e.test.ts` - E2E test for CLI integration

## Implementation Steps

### Step 1: Fix resume-executor.ts null handler (PR #25)

- [ ] Write test: `src/cli/commands/resume-executor.test.ts`
  - Test: when provider returns null (e.g., Scopus without API key), `updateDatabaseStatus`
    is called with `CONFIG_ERROR` and `retryable: false`
- [ ] Modify `src/cli/commands/resume-executor.ts`
  - Add `updateDatabaseStatus` call in the null-provider branch to match the pattern in
    `search-executor.ts` (lines 276-289)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Session JSON reflects configuration failures in resume path

### Step 2: Fix hardcoded error message (PR #25)

- [ ] Modify `src/cli/commands/search-executor.ts` (line 274)
  - Change from: hardcoded "requires an API key" message
  - To: generic message since the specific warning was already printed by `createProviderInstance()`
    ```
    <provider>: provider configuration incomplete. See warning above for details.
    ```
- [ ] Update tests if message expectations changed
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Error message is provider-agnostic and extensible

### Step 3: Convert string concatenation to template literals (PR #25)

- [ ] Modify `src/cli/commands/search-executor.ts`
  - Lines 73-77 (PubMed warning): replace `+` concatenation with template literals
  - Lines 104-106 (Scopus warning): same
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Consistent style with rest of codebase

### Step 4: Wire up CLI integration for dry-run (PR #26)

- [ ] Write test: `src/cli/commands/search.e2e.test.ts`
  - Test: `--dry-run` output includes "Provider readiness" section when config is available
- [ ] Modify `src/cli/index.ts`
  - In the dry-run code path (around line 434), load config before formatting:
    ```typescript
    let dryRunConfig: Config | undefined;
    try {
      dryRunConfig = await loadConfig(globalOpts.config ? { globalConfigPath: globalOpts.config } : {});
    } catch {
      // Config unavailable, readiness section will be omitted
    }
    ```
  - Pass `{ config: dryRunConfig, providers }` to `formatDryRunOutput()`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: CLI `--dry-run` output shows provider readiness and diagnostics

### Step 5: Final verification

- [ ] Run full test suite in both worktrees
- [ ] Verify no regressions
- [ ] Acceptance: All tests pass, both PRs ready for merge

## Notes

- Steps 1-3 are applied to `feat/ux-improvements` worktree (PR #25)
- Step 4 is applied to `feat/dry-run-diagnostics` worktree (PR #26)
- These should be committed as fix-up commits on respective branches
