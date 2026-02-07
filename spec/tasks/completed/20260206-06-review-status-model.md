# Task: Review Status Model Expansion

## Purpose

Expand the review status model from 4 states to 7 states to support the progressive
screening workflow. The new statuses enable accurate classification of reviewer
consensus, uncertainty, and coverage, which are prerequisites for the `review finalize`
command and dynamic Next Steps.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - Status Model section
- [spec/cli/suggestions.md](../cli/suggestions.md) - Phase 4 review suggestions

## Related Source Files

- `src/cli/commands/review/types.ts` - `ReviewStatus`, `classifyStatus()`
- `src/cli/commands/review/types.test.ts` - status classification tests
- `src/cli/commands/review/list.ts` - `ListFilter`, `formatListOutput()`
- `src/cli/commands/review/list.test.ts`
- `src/cli/commands/review/status.ts` - `executeReviewStatus()`, `formatStatusOutput()`
- `src/cli/commands/review/status.test.ts`
- `src/cli/commands/review/extract.ts` - `--filter` handling
- `src/cli/commands/review/extract.test.ts`
- `src/cli/index.ts` - CLI filter validation

## Implementation Steps

### Step 1: Expand `ReviewStatus` Type and `classifyStatus()`

- [x] Write test: `src/cli/commands/review/types.test.ts`
  - All 7 statuses have test cases
  - `finalized`: article with `finalDecision` set
  - `pending`: article with no reviews
  - `incomplete`: article missing review from registered reviewer (requires reviewer list parameter)
  - `uncertain`: all reviewers reviewed, at least one uncertain, no include/exclude conflict
  - `agreed-include`: all reviewers say include
  - `agreed-exclude`: all reviewers say exclude
  - `conflicting`: both include and exclude present
  - Edge case: `uncertain` takes priority when both uncertain and a single include/exclude exist (not conflicting)
  - Edge case: empty reviewer registry → skip incomplete check (backward-compatible)
- [x] Update `ReviewStatus` type: replace `'needs-final'` with `'incomplete' | 'uncertain' | 'agreed-include' | 'agreed-exclude'`
- [x] Update `classifyStatus()` signature to accept `registeredReviewers?: ReviewerRecord[]`
- [x] Verify tests fail (Red)
- [x] Implement new classification logic (see spec/cli/review.md)
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `classifyStatus` correctly classifies all 7 statuses

### Step 2: Update `ListFilter` and Filter Validation

- [x] Write test: `src/cli/commands/review/list.test.ts`
  - `ListFilter` accepts all 7 status values + `'all'`
  - `executeReviewList` correctly filters by new statuses
  - `formatListOutput` displays new status names
- [x] Update `ListFilter` type in `list.ts`
- [x] Update `executeReviewList` to pass reviewer registry to `classifyStatus`
- [x] Update CLI filter validation in `src/cli/index.ts` for both `list` and `extract`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review list --filter uncertain` works correctly

### Step 3: Update `executeReviewStatus` and Output Format

- [x] Write test: `src/cli/commands/review/status.test.ts`
  - `ReviewStatusResult` has counts for all 7 statuses
  - `formatStatusOutput` shows new breakdown format
  - Shows registered reviewers section
- [x] Update `ReviewStatusResult` interface: replace `needsFinal` with `incomplete`, `uncertain`, `agreedInclude`, `agreedExclude`
- [x] Update `executeReviewStatus` to use new `classifyStatus` with reviewer registry
- [x] Update `formatStatusOutput` to show new status breakdown and reviewers section
- [x] Remove static "AI Agent Workflow" section from `formatStatusOutput`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review status` output matches spec

### Step 4: Update Extract `--filter` Handling

- [x] Write test: `src/cli/commands/review/extract.test.ts`
  - `--filter uncertain,conflicting` correctly filters articles
  - `--filter agreed-include` correctly filters articles
  - `--filter finalized` works
- [x] Update extract filter handling to pass reviewer registry to `classifyStatus`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: extract --filter works with all new status values

### Step 5: Remove Static Workflow Guidance

- [x] Remove `WorkflowGuidance`, `WorkflowPhase` interfaces from `list.ts`
- [x] Remove `generateWorkflow()` function from `list.ts`
- [x] Remove `workflow` property from `ReviewListResult`
- [x] Update `list.test.ts` to remove workflow-related assertions
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: No static workflow templates remain; tests pass

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full workflow: init → extract → mark → merge → verify status counts use new model
  - Multiple reviewers: verify `incomplete` status when one reviewer hasn't reviewed
  - Consensus detection: verify `agreed-include`/`agreed-exclude` after all reviewers agree
  - Backward compatibility: verify classification works when reviewer registry is empty
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] Acceptance: All tests pass, new status model works end-to-end

## Notes

- Depends on Task 71 (Reviewer Registration) for `incomplete` status and reviewer registry.
- The `needs-final` status is completely removed. All code referencing it must be updated.
- `classifyStatus` remains a pure function; it does not read files or perform I/O.
