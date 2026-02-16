# Task: Redesign ReviewStatus (`uncertain`→`all-uncertain`, `conflicting`→`divided`)

## Purpose

The current `ReviewStatus` conflates two distinct situations under `uncertain`:
- All reviewers say uncertain → should escalate to next basis level
- Some uncertain + some definitive → reviewers disagree, needs human attention

This redesign replaces:
- `uncertain` → `all-uncertain` (only when ALL effective decisions are uncertain)
- `conflicting` → `divided` (any mix of different decisions: exclude+uncertain, include+exclude, etc.)

This better maps to the screening workflow mental model:
- **Title/Abstract screening**: agreed-exclude (done), all-uncertain (escalate), divided (needs attention)
- **Fulltext review**: agreed-include (in), agreed-exclude (out), divided (reconcile)

## Related Specs

- [spec/cli/review.md](../cli/review.md) - Status Model section (already updated)

## Related Source Files

- `src/cli/commands/review/types.ts` - `ReviewStatus` type, `classifyStatus()` function
- `src/cli/commands/review/types.test.ts` - classifyStatus tests
- `src/cli/commands/review/list.ts` - `ListFilter` type, filter validation
- `src/cli/commands/review/list.test.ts` - list tests
- `src/cli/commands/review/status.ts` - status display formatting
- `src/cli/commands/review/status.test.ts` - status tests
- `src/cli/commands/review/extract.ts` - `--filter` option handling
- `src/cli/commands/review/extract.test.ts` - extract tests
- `src/cli/commands/review/finalize.ts` - finalize logic (uses agreed-include/agreed-exclude)
- `src/cli/commands/review/finalize.test.ts` - finalize tests
- `src/cli/commands/review/merge.ts` - merge output (decision breakdown)
- `src/cli/commands/review/merge.test.ts` - merge tests
- `src/cli/index.ts` - CLI option definitions (`--filter` values)

## Implementation Steps

### Step 1: Rename `ReviewStatus` type and update `classifyStatus()`

- [ ] Update `ReviewStatus` type: replace `'uncertain'` with `'all-uncertain'`, `'conflicting'` with `'divided'`
- [ ] Update `classifyStatus()` logic:
  - Check all-include → `agreed-include`
  - Check all-exclude → `agreed-exclude`
  - Check all-uncertain → `all-uncertain`
  - Otherwise → `divided` (replaces both old `conflicting` and partial-uncertain cases)
- [ ] Update tests in `types.test.ts`:
  - Rename all `'uncertain'` expectations to `'all-uncertain'`
  - Rename all `'conflicting'` expectations to `'divided'`
  - Add new test: exclude+uncertain mix → `divided` (was `uncertain`, now `divided`)
  - Add new test: include+uncertain mix → `divided`
  - Keep test: all uncertain → `all-uncertain`
  - Keep test: include+exclude → `divided`
- [ ] Run tests, lint, typecheck
- [ ] Acceptance: `classifyStatus` correctly distinguishes all-uncertain from mixed decisions

### Step 2: Update `ListFilter` and `review list` command

- [ ] Update `ListFilter` type in `list.ts`: replace `'uncertain'`→`'all-uncertain'`, `'conflicting'`→`'divided'`
- [ ] Update filter validation in `list.ts` and `src/cli/index.ts`
- [ ] Update `formatStatusOutput()` in `status.ts`: display labels for new statuses
- [ ] Update tests in `list.test.ts` and `status.test.ts`
- [ ] Run tests, lint, typecheck
- [ ] Acceptance: `review list --filter all-uncertain` and `--filter divided` work correctly

### Step 3: Update `review extract` filter handling

- [ ] Update `--filter` CLI option help text in `src/cli/index.ts`
- [ ] Update filter validation for extract command
- [ ] Update tests in `extract.test.ts`
- [ ] Run tests, lint, typecheck
- [ ] Acceptance: `review extract --filter all-uncertain,divided` works correctly

### Step 4: Update `review finalize` and `review merge` output

- [ ] Update finalize skip message to use new status names
- [ ] Update merge decision breakdown output to use new status names
- [ ] Update tests in `finalize.test.ts` and `merge.test.ts`
- [ ] Run tests, lint, typecheck
- [ ] Acceptance: finalize and merge output uses correct status names

### Step 5: Update dynamic next step suggestions

- [ ] Update suggestion logic in `status.ts` or wherever next steps reference `uncertain`/`conflicting`
- [ ] Update suggested `--filter` values in next step commands
- [ ] Update tests
- [ ] Run tests, lint, typecheck
- [ ] Acceptance: next step suggestions use `all-uncertain,divided` instead of `uncertain,conflicting`

### Step 6: Update review mark command

- [ ] Verify `review mark` still correctly accepts `uncertain` as a **decision** value (not status)
  - Note: `uncertain` as a `ReviewDecision` (include/exclude/uncertain) is unchanged
  - Only `ReviewStatus` classification names change
- [ ] Update any tests that reference old status names
- [ ] Run tests, lint, typecheck
- [ ] Acceptance: `review mark --decision uncertain` still works; no confusion between decision and status

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write/update E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Test full workflow: init → extract → mark → merge → verify status classification
  - Test that all-uncertain articles (all reviewers say uncertain) get `all-uncertain` status
  - Test that mixed articles (some uncertain + some exclude) get `divided` status
  - Test that include vs exclude disagreement gets `divided` status
  - Test filter with new status names: `--filter all-uncertain`, `--filter divided`
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test the feature manually as a user would
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- `ReviewDecision` (include/exclude/uncertain) is **unchanged** — only `ReviewStatus` classification names change
- The basis-priority resolution logic in `classifyStatus()` is preserved as-is
- Backward compatibility is explicitly not a concern (prerelease)
- The `incomplete` check logic is unchanged
