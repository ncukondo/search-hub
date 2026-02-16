# Task: Add --decision Filter to Review Finalize Command

Closes: #123

## Purpose

`review finalize` currently finalizes all articles with reviewer consensus (both `include` and
`exclude`). In multi-stage screening workflows (title → abstract → fulltext), title/abstract
screening should only finalize `exclude` decisions — `include` decisions must remain provisional
until confirmed by fulltext screening.

Adding a `--decision` filter allows selective finalization by decision type, eliminating the
error-prone workaround of manually clearing `finalDecision` for included articles.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - `review finalize` section (updated)
- [docs/commands.md](../../docs/commands.md) - CLI reference (updated)

## Related Source Files

- `src/cli/commands/review/finalize.ts` - `executeReviewFinalize()`, `ReviewFinalizeOptions`, `formatFinalizeOutput()`
- `src/cli/commands/review/finalize.test.ts` - Unit tests
- `src/cli/commands/review/review-workflow.test.ts` - E2E workflow tests
- `src/cli/index.ts` - CLI command registration (lines ~2492-2530)

## Implementation Steps

### Step 1: Add `decision` to `ReviewFinalizeOptions` and Filter Logic

- [ ] Write test: `src/cli/commands/review/finalize.test.ts`
  - `decision: 'exclude'` only finalizes `agreed-exclude` articles; `agreed-include` articles are skipped
  - `decision: 'include'` only finalizes `agreed-include` articles; `agreed-exclude` articles are skipped
  - `decision: undefined` (default) finalizes both — existing behavior preserved
  - Skipped-by-filter articles counted in `skippedByStatus` under their agreed status
- [ ] Add `decision?: 'include' | 'exclude'` to `ReviewFinalizeOptions`
- [ ] Verify test fails (Red)
- [ ] Implement filter logic in `executeReviewFinalize`:
  - When `decision` is set and status is `agreed-include`/`agreed-exclude`, check if the
    consensus decision matches. If not, increment `skippedByStatus[status]` and skip.
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `--decision` correctly filters finalization by decision type

### Step 2: Register `--decision` CLI Option

- [ ] Add `.option('--decision <type>', 'only finalize this decision type (include or exclude)')` to the finalize command in `src/cli/index.ts`
- [ ] Wire the option through to `ReviewFinalizeOptions`
- [ ] Add input validation: reject values other than `include` or `exclude`
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `--decision include`, `--decision exclude`, and omitted all work correctly

### Step 3: Update `formatFinalizeOutput` for Filter Context

- [ ] Write test: `src/cli/commands/review/finalize.test.ts`
  - When `--decision` is active, skipped summary includes `agreed-include` or `agreed-exclude` counts
    for consensus articles that were filtered out
- [ ] Update `formatFinalizeOutput` to show filtered-out agreed counts in skipped summary
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Output correctly reflects which articles were filtered out

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Two-reviewer workflow with `--decision exclude`: only exclude consensus finalized, include consensus untouched
  - Two-reviewer workflow with `--decision include`: only include consensus finalized, exclude consensus untouched
  - Sequential use: `--decision exclude` then `--decision include` finalizes all consensus articles
  - `--decision` combined with `--dry-run`: correct preview output
  - `--decision` combined with `--min-reviewers`: both filters applied together
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test the feature manually as a user would
- [ ] Acceptance: All tests pass, feature works in real usage

## TDD Cycle Reference

```
┌─────────────────────────────────────────────────────┐
│  1. Write Test (Red)                                │
│     - Write test that describes expected behavior   │
│     - Run test → should FAIL                        │
├─────────────────────────────────────────────────────┤
│  2. Implement (Green)                               │
│     - Write minimal code to pass test               │
│     - Run test → should PASS                        │
├─────────────────────────────────────────────────────┤
│  3. Refactor                                        │
│     - npm run lint                                  │
│     - npm run typecheck                             │
│     - Clean up code if needed                       │
│     - Run test → should still PASS                  │
└─────────────────────────────────────────────────────┘
```

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- Always complete the Final Step (E2E tests) before marking the task complete
- The change is backward-compatible: omitting `--decision` preserves current behavior
- Depends on Task 74 (Review Finalize Command) which is already completed
- The `skippedByStatus` record already tracks `agreed-include`/`agreed-exclude` keys,
  so filtered-out consensus articles can naturally be counted there
