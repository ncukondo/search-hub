# Task: Review Finalize Command

## Purpose

Add a `review finalize` subcommand that auto-sets `finalDecision` for articles where
all reviewers agree. This eliminates the need to manually edit YAML to set
`finalDecision` on each article, enabling batch finalization after each screening phase.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - `review finalize` section
- [spec/cli/suggestions.md](../cli/suggestions.md) - finalize suggestions

## Related Source Files

- `src/cli/commands/review/types.ts` - `ReviewStatus`, `classifyStatus()`, `ArticleEntry`
- `src/cli/commands/review/status.ts` - `executeReviewStatus()` (for Next Steps)
- `src/cli/index.ts` - CLI command registration

## Implementation Steps

### Step 1: Create `executeReviewFinalize` Function

- [ ] Write test: `src/cli/commands/review/finalize.test.ts`
  - `agreed-include` articles get `finalDecision: 'include'`
  - `agreed-exclude` articles get `finalDecision: 'exclude'`
  - `pending`, `incomplete`, `uncertain`, `conflicting` articles are skipped
  - Already `finalized` articles are skipped
  - Result counts: `includedCount`, `excludedCount`, `skippedByStatus` breakdown
- [ ] Create `src/cli/commands/review/finalize.ts` with interface and stub
- [ ] Verify test fails (Red)
- [ ] Implement `executeReviewFinalize`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Correct articles get finalized based on status

### Step 2: Add `--dry-run` Support

- [ ] Write test: `src/cli/commands/review/finalize.test.ts`
  - `dryRun: true` returns correct counts but does not modify the file
  - Master reviews.yaml is unchanged after dry run
- [ ] Add `dryRun` option to `ReviewFinalizeOptions`
- [ ] Implement dry-run logic (compute but don't write)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `--dry-run` previews without modifying data

### Step 3: Add `--min-reviewers` Support

- [ ] Write test: `src/cli/commands/review/finalize.test.ts`
  - `minReviewers: 2` skips articles with only 1 review even if agreed
  - `minReviewers: 1` (default) finalizes single-reviewer agreements
  - `minReviewers: 3` with only 2 reviewers → nothing finalized
- [ ] Add `minReviewers` option (default: 1)
- [ ] Implement minimum reviewer check
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `--min-reviewers` correctly gates finalization

### Step 4: Add `formatFinalizeOutput` and CLI Registration

- [ ] Write test: `src/cli/commands/review/finalize.test.ts`
  - Output format matches spec:
    ```
    Finalized 42 articles (30 include, 12 exclude)
    Skipped: 5 pending, 8 incomplete, 12 uncertain, 3 conflicting
    ```
  - Dry-run output includes "Dry run - no changes made" header
- [ ] Implement `formatFinalizeOutput`
- [ ] Register `review finalize` subcommand in `src/cli/index.ts`
  - Options: `--session <id>` (required), `--dry-run`, `--min-reviewers <n>`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: CLI command works and output matches spec

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full workflow: init → extract → mark → merge → finalize → verify finalDecisions set
  - Two-reviewer workflow: both agree → finalized; one uncertain → not finalized
  - Dry-run does not modify reviews.yaml
  - Min-reviewers: with 1 reviewer and --min-reviewers 2 → nothing finalized
  - Idempotency: running finalize twice produces same result
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, finalize works in real workflows

## Notes

- Depends on Task 72 (Status Model Expansion) for `agreed-include`/`agreed-exclude` statuses.
- `finalize` reads the reviewer registry from the master ReviewFile to determine coverage.
- The command modifies `.internal/reviews.yaml` directly (like merge does).
- Finalize is idempotent: running it multiple times has no additional effect.
