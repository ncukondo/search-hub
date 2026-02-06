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

- [ ] Write test: `src/cli/commands/review/types.test.ts`
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
- [ ] Update `ReviewStatus` type: replace `'needs-final'` with `'incomplete' | 'uncertain' | 'agreed-include' | 'agreed-exclude'`
- [ ] Update `classifyStatus()` signature to accept `registeredReviewers?: ReviewerRecord[]`
- [ ] Verify tests fail (Red)
- [ ] Implement new classification logic (see spec/cli/review.md)
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `classifyStatus` correctly classifies all 7 statuses

### Step 2: Update `ListFilter` and Filter Validation

- [ ] Write test: `src/cli/commands/review/list.test.ts`
  - `ListFilter` accepts all 7 status values + `'all'`
  - `executeReviewList` correctly filters by new statuses
  - `formatListOutput` displays new status names
- [ ] Update `ListFilter` type in `list.ts`
- [ ] Update `executeReviewList` to pass reviewer registry to `classifyStatus`
- [ ] Update CLI filter validation in `src/cli/index.ts` for both `list` and `extract`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `review list --filter uncertain` works correctly

### Step 3: Update `executeReviewStatus` and Output Format

- [ ] Write test: `src/cli/commands/review/status.test.ts`
  - `ReviewStatusResult` has counts for all 7 statuses
  - `formatStatusOutput` shows new breakdown format
  - Shows registered reviewers section
- [ ] Update `ReviewStatusResult` interface: replace `needsFinal` with `incomplete`, `uncertain`, `agreedInclude`, `agreedExclude`
- [ ] Update `executeReviewStatus` to use new `classifyStatus` with reviewer registry
- [ ] Update `formatStatusOutput` to show new status breakdown and reviewers section
- [ ] Remove static "AI Agent Workflow" section from `formatStatusOutput`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `review status` output matches spec

### Step 4: Update Extract `--filter` Handling

- [ ] Write test: `src/cli/commands/review/extract.test.ts`
  - `--filter uncertain,conflicting` correctly filters articles
  - `--filter agreed-include` correctly filters articles
  - `--filter finalized` works
- [ ] Update extract filter handling to pass reviewer registry to `classifyStatus`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: extract --filter works with all new status values

### Step 5: Remove Static Workflow Guidance

- [ ] Remove `WorkflowGuidance`, `WorkflowPhase` interfaces from `list.ts`
- [ ] Remove `generateWorkflow()` function from `list.ts`
- [ ] Remove `workflow` property from `ReviewListResult`
- [ ] Update `list.test.ts` to remove workflow-related assertions
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: No static workflow templates remain; tests pass

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full workflow: init → extract → mark → merge → verify status counts use new model
  - Multiple reviewers: verify `incomplete` status when one reviewer hasn't reviewed
  - Consensus detection: verify `agreed-include`/`agreed-exclude` after all reviewers agree
  - Backward compatibility: verify classification works when reviewer registry is empty
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, new status model works end-to-end

## Notes

- Depends on Task 71 (Reviewer Registration) for `incomplete` status and reviewer registry.
- The `needs-final` status is completely removed. All code referencing it must be updated.
- `classifyStatus` remains a pure function; it does not read files or perform I/O.
