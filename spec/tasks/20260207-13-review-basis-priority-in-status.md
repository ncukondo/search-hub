# Task: Review Basis Priority in Status Classification

## Purpose

When performing multi-stage screening (title → abstract → fulltext), reviewers mark articles
as `uncertain` at a lower stage to pass them to the next stage. Currently, `classifyStatus()`
treats any `uncertain` review as making the overall status `uncertain`, even when a higher-basis
review (abstract or fulltext) has a definitive `include` or `exclude` decision. This blocks
`finalize` from working in the standard screening workflow.

The fix adds basis-priority logic: `fulltext > abstract > title`. When a reviewer (or different
reviewers) has both a lower-basis `uncertain` and a higher-basis `include`/`exclude`, the
higher-basis decision takes precedence. Conflicting definitive decisions (include vs exclude)
across any basis are still treated as `conflicting`.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - review workflow, status model
- [spec/tasks/completed/20260206-06-review-status-model.md](completed/20260206-06-review-status-model.md) - original status model

## Related Source Files

- `src/cli/commands/review/types.ts` - `classifyStatus()`, `ReviewBasis`, `ReviewStatus`
- `src/cli/commands/review/types.test.ts` - existing status classification tests
- `src/cli/commands/review/finalize.ts` - `executeReviewFinalize()` (consumer of classifyStatus)
- `src/cli/commands/review/review-workflow.test.ts` - E2E workflow tests

## Implementation Steps

### Step 1: Add Basis Priority Helper

- [x] Write test: `src/cli/commands/review/types.test.ts`
  - `basisRank('title')` < `basisRank('abstract')` < `basisRank('fulltext')`
  - `basisRank(undefined)` returns 0 (lowest)
- [x] Add `basisRank(basis: ReviewBasis | undefined): number` to `types.ts`
- [x] Verify test fails (Red)
- [x] Implement
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Basis ordering is correct

### Step 2: Update `classifyStatus` to Consider Basis Priority

- [x] Write test: `src/cli/commands/review/types.test.ts`
  - Same reviewer, title `uncertain` + abstract `include` → `agreed-include`
  - Same reviewer, title `uncertain` + abstract `exclude` → `agreed-exclude`
  - Same reviewer, title `uncertain` + fulltext `include` → `agreed-include`
  - Different reviewers, reviewer A title `uncertain` + reviewer B abstract `include` → `agreed-include`
  - Different reviewers, reviewer A title `uncertain` + reviewer B abstract `exclude` → `agreed-exclude`
  - Two reviewers, both abstract `include` with earlier title `uncertain` → `agreed-include`
  - Reviewer A abstract `include` + reviewer B abstract `exclude` → `conflicting` (unchanged)
  - Reviewer A title `include` + reviewer B abstract `exclude` → `conflicting` (definitive vs definitive)
  - All reviews `uncertain` (no higher-basis definitive) → `uncertain` (unchanged)
  - Only title reviews, no `uncertain` conflict → existing behavior unchanged
- [x] Modify `classifyStatus()` to:
  1. For each reviewer, find their highest-basis review with a definitive decision
  2. If a reviewer has only `uncertain` at lower basis and a definitive decision at higher basis, use the definitive decision
  3. Collect effective decisions (after basis resolution) and apply existing conflict/agreement logic
- [x] Verify test fails (Red)
- [x] Implement the basis-priority logic
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Multi-stage screening `uncertain` → `include/exclude` works correctly

### Step 3: Handle Cross-Reviewer Basis Priority

- [x] Write test: `src/cli/commands/review/types.test.ts`
  - Reviewer A: title `uncertain`. Reviewer B: abstract `include`. Reviewer C: abstract `include` → `agreed-include`
  - Reviewer A: title `uncertain`. Reviewer B: abstract `include`. Reviewer C: abstract `exclude` → `conflicting`
  - Reviewer A: title `exclude`. Reviewer B: abstract `include` → `conflicting` (both definitive)
  - Reviewer A: abstract `uncertain`. Reviewer B: fulltext `include` → `agreed-include`
- [x] Implement cross-reviewer logic:
  1. For each reviewer, compute their effective decision at highest basis
  2. Discard `uncertain` reviews from reviewers who have no higher-basis definitive decision (they remain uncertain)
  3. Collect all effective decisions: if any reviewer's effective decision is still `uncertain`, overall is `uncertain`
  4. Otherwise, apply include/exclude agreement/conflict logic on effective decisions
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Cross-reviewer basis priority works correctly

### Step 4: Verify Finalize Works with Multi-Stage Screening

- [x] Write test: `src/cli/commands/review/finalize.test.ts`
  - Article with title `uncertain` + abstract `include` from same reviewer → finalized as include
  - Article with title `uncertain` + abstract `exclude` from different reviewer → finalized as exclude
  - Article with only title `uncertain` → not finalized (still uncertain)
- [x] Verify tests pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `finalize` correctly processes multi-stage reviewed articles

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full multi-stage workflow: init → extract title → mark some exclude, leave rest uncertain → merge → extract abstract for uncertain → mark include/exclude → merge → finalize → verify all articles finalized correctly
  - Two-reviewer multi-stage: reviewer A title screening → reviewer B abstract screening → finalize
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: Reproduce the workflow from this session
- [x] Acceptance: All tests pass, multi-stage screening workflow completes end-to-end

## Notes

- This is the highest-priority fix from the user feedback session on 2025-02-07.
- The key insight: `uncertain` at a lower basis means "need more information" (escalate), not "I'm undecided". A definitive decision at a higher basis resolves the uncertainty.
- Definitive-vs-definitive conflicts (include vs exclude) are never auto-resolved regardless of basis.
- Existing single-stage workflows (all reviews at the same basis) are unaffected.
