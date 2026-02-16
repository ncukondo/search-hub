# Task: Review Extract Comment Field Guidance

## Purpose

Add inline YAML comment guidance to extracted review files so reviewers know what
to write in the `comment` field and `reviews` array. Currently:

- **Screening mode**: `comment: ""` has no inline hint, while `decision` has one
  (e.g., `# exclude / uncertain`). Adding `# reason for decision` guides reviewers.
- **Finalize mode**: `reviews: []` has no hint. Adding `# add new reviews here`
  clarifies its purpose (vs read-only `reviewHistory`).

## Related Specs

- [spec/cli/review.md](../cli/review.md) - Extracted File format section

## Related Source Files

- `src/cli/commands/review/extract.ts` - `getBasisGuidanceComment()`, inline comment injection
- `src/cli/commands/review/extract.test.ts`

## Implementation Steps

### Step 1: Add comment field inline guidance in screening mode

- [x] Write test: `src/cli/commands/review/extract.test.ts`
  - Verify `comment: ""` has inline hint `# reason for decision` in screening output
- [x] Verify test fails (Red)
- [x] Add regex replacement in screening branch to inject comment inline hint
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Screening extracted files show `comment: ""                   # reason for decision`

### Step 2: Add reviews array guidance in finalize mode

- [x] Write test: `src/cli/commands/review/extract.test.ts`
  - Verify finalize output contains `reviews: [] # add new reviews here` comment
- [x] Verify test fails (Red)
- [x] Add regex replacement in finalize branch to inject reviews array hint
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Finalize extracted files show `reviews: [] # add new reviews here`

### Final Step: Run full test suite

- [x] Run full test suite: `npm run test:all`
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All tests pass, no regressions

## Notes

- Inline comments are injected post-serialization via regex, same pattern as decision comments
- No schema or type changes needed (comments are in raw YAML output only)
