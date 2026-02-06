# Task: Reviewer Registration in Review Merge

## Purpose

When `review merge` runs, individual reviews are appended to each article's `reviews[]` array,
but there is no session-level record of "who reviewed what basis." Adding a `reviewers` registry
to `ReviewFile` enables coverage analysis: knowing which reviewers participated at which basis
allows detecting articles where a reviewer didn't mark a decision (= uncertain), enabling richer
conflict/coverage classification.

## Related Specs

- `schemas/review.schema.json` — review file JSON schema
- `.search-hub/schemas/review.schema.json` — bundled copy of review schema

## Related Source Files

- `src/cli/commands/review/types.ts` — `ReviewFile`, `ArticleEntry` interfaces
- `src/cli/commands/review/merge.ts` — `processWorkFile`, `processReviewFile`, `executeReviewMerge`
- `src/cli/commands/review/merge.test.ts` — merge unit tests
- `src/cli/commands/review/review-workflow.test.ts` — E2E workflow tests

## Implementation Steps

### Step 1: Add `ReviewerRecord` Interface and Update `ReviewFile`

- [ ] Write test: `src/cli/commands/review/types.test.ts`
  - Verify a `ReviewFile` with `reviewers` array passes type checks
  - Verify `ReviewerRecord` has `name` and `basis` fields
- [ ] Add `ReviewerRecord` interface to `src/cli/commands/review/types.ts`
  ```ts
  export interface ReviewerRecord {
    name: string;
    basis: number;
  }
  ```
- [ ] Add optional `reviewers?: ReviewerRecord[]` property to `ReviewFile`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `ReviewFile` accepts a `reviewers` array; existing code unaffected

### Step 2: Add `registerReviewer` Helper in `merge.ts`

- [ ] Write test: `src/cli/commands/review/merge.test.ts`
  - Calling `registerReviewer(reviewFile, "alice", 1)` adds `{ name: "alice", basis: 1 }` to `reviewers`
  - Calling with same name+basis twice does not create a duplicate
  - Multiple distinct name+basis pairs are all recorded
- [ ] Create stub: `registerReviewer` in `src/cli/commands/review/merge.ts` (empty implementation)
- [ ] Verify test fails (Red)
- [ ] Implement `registerReviewer`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: `registerReviewer` correctly manages the `reviewers` array with dedup

### Step 3: Integrate into `processWorkFile` and `processReviewFile`

- [ ] Write test: `src/cli/commands/review/merge.test.ts`
  - After `processWorkFile`, the reviewer name+basis is registered in the review file
  - After `processReviewFile`, each source reviewer name+basis is registered
- [ ] Update `processWorkFile` to call `registerReviewer` with the reviewer name and current basis
- [ ] Update `processReviewFile` to call `registerReviewer` for each reviewer found in the source
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: merge operations automatically register reviewers

### Step 4: Update JSON Schemas

- [ ] Add `reviewers` property and `ReviewerRecord` definition to `schemas/review.schema.json`
- [ ] Copy the same changes to `.search-hub/schemas/review.schema.json`
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: schema validates review files with `reviewers` array

### Final Step: E2E Integration Tests

- [ ] Write E2E test in `src/cli/commands/review/review-workflow.test.ts`
  - Merge a work file → verify `reviewers` array in output contains the reviewer
  - Merge two work files from different reviewers → verify both are registered
  - Merge same reviewer twice at same basis → verify no duplicate
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, reviewer registration works in real merge workflows

## Notes

- Depends on Task 44 (Article Review Workflow) which is already completed.
- The `reviewers` field is optional to maintain backward compatibility with existing review files.
- The reviewer `name` comes from the work file's filename convention or explicit metadata.
- The `basis` represents the search basis number at which the review was performed.
