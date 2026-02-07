# Task: Review Merge Output Decision Breakdown

## Purpose

When merging a work file via `review merge`, the output shows `Decisions set: 0` for work
file merges because `decisionsSet` only tracks `finalDecision` changes (which only happen
in review file merges). This is confusing — the user expects to see a summary of what was
merged.

Replace the current output with a decision breakdown showing how many include, exclude,
and uncertain reviews were added. For example:

```
Merge Summary:
  Reviews added: 93 (53 exclude, 36 include, 4 uncertain)
```

For review file merges where `finalDecision` is set, also show those:

```
Merge Summary:
  Reviews added: 10
  Final decisions set: 3 (2 include, 1 exclude)
```

## Related Specs

- [spec/cli/review.md](../cli/review.md) - merge command output

## Related Source Files

- `src/cli/commands/review/merge.ts` - `processWorkFile()`, `processReviewFile()`, `formatMergeOutput()`
- `src/cli/commands/review/merge.test.ts` - existing merge tests

## Implementation Steps

### Step 1: Extend `ReviewMergeResult` with Decision Breakdown

- [ ] Write test: `src/cli/commands/review/merge.test.ts`
  - Work file with 3 include, 2 exclude, 1 uncertain → breakdown counts match
  - Work file with all exclude → `includeCount: 0, excludeCount: N, uncertainCount: 0`
  - Review file with `finalDecision` set → `finalDecisionsSet` count correct
- [ ] Add `includeCount`, `excludeCount`, `uncertainCount` to `ReviewMergeResult`
- [ ] Verify test fails (Red)
- [ ] Count decisions in `processWorkFile()` and `processReviewFile()`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Decision counts are accurate

### Step 2: Update `formatMergeOutput`

- [ ] Write test: `src/cli/commands/review/merge.test.ts`
  - Work file merge output: `Reviews added: 93 (53 exclude, 36 include, 4 uncertain)`
  - Review file merge output with finalDecisions: shows both reviews and final decisions
  - Zero reviews: `Reviews added: 0`
  - Omit zero-count categories: if no uncertain, don't show it in breakdown
- [ ] Update `formatMergeOutput()` to render breakdown
- [ ] Remove or rename the confusing `Decisions set: 0` line for work file merges
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Output is clear and informative

### Final Step: E2E Integration Tests

- [ ] Verify existing E2E tests still pass with new output format
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, merge output is clear

## Notes

- Small change with high UX impact. The current `Decisions set: 0` actively confuses users.
- The breakdown should only include non-null decisions (articles with `decision: null` are skipped by merge).
