# Task: Review Picking Mode

## Purpose

Add a `picking` mode to the review workflow for narrative/quick literature reviews. The current `screening` mode is exclusion-based (remove what's not relevant). The `picking` mode is inclusion-based (pick up what looks promising, then confirm). This enables a different workflow where reviewers select interesting articles at the title level, then progressively confirm at abstract and fulltext levels.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - Review workflow specification

## Related Source Files

- `src/cli/commands/review/types.ts` - `ReviewFile`, add `mode` field
- `src/cli/commands/review/init.ts` - `executeReviewInit()`, add `--mode` option
- `src/cli/commands/review/extract.ts` - `getDecisionInlineComment()`, `getBasisGuidanceComment()`, mode-aware comments
- `src/cli/commands/review/status.ts` - `formatStatusOutput()`, show mode
- `src/cli/commands/review/next-steps.ts` - `generateReviewNextSteps()`, mode-aware suggestions
- `src/cli/commands/review/finalize.ts` - No behavior change needed (already only finalizes agreed articles)

## Design

### Review Mode

```typescript
type ReviewMode = 'screening' | 'picking';
```

Stored in the master file (`.internal/reviews.yaml`):

```yaml
sessionId: my-session
mode: picking              # NEW: 'screening' (default) or 'picking'
reviewers: [...]
articles: [...]
```

### Mode Differences

| Aspect | `screening` (default) | `picking` |
|--------|----------------------|-----------|
| Title decision comment | `# exclude / uncertain` | `# include / uncertain` |
| Title guidance | "Mark clearly irrelevant as exclude, leave rest uncertain" | "Mark relevant items as include, leave rest uncertain" |
| Abstract guidance | Same for both modes | Same for both modes |
| Next Steps after title | "N uncertain — screen at abstract level" | "N picked — confirm at abstract level" |
| Next Steps filter | `--filter all-uncertain,divided,incomplete` | `--filter agreed-include,all-uncertain` |
| Finalize behavior | Same (only finalizes agreed articles) | Same (pending articles stay as-is) |

### Extract Comments by Mode

#### `getDecisionInlineComment(basis, mode)`

| basis | screening | picking |
|-------|-----------|---------|
| title | `# exclude / uncertain` | `# include / uncertain` |
| abstract | `# include / exclude / uncertain` | `# include / exclude / uncertain` |
| fulltext | `# include / exclude / uncertain` | `# include / exclude / uncertain` |

Note: In picking mode, `exclude` is still a valid decision at title level — it is simply not suggested in the inline comment.

#### `getBasisGuidanceComment(basis, mode)`

| basis | screening | picking |
|-------|-----------|---------|
| title | "Mark clearly irrelevant items as exclude. Leave everything else as uncertain." | "Mark relevant items as include. Leave everything else as uncertain." |
| abstract | (unchanged) | (unchanged) |
| fulltext | (unchanged) | (unchanged) |

### Next Steps by Mode

#### Picking mode logic

```
After any command:
  1. If pending > 0:
       → "Extract N pending articles for title review"
       → $ review extract --basis title --filter pending ...
  2. Else if agreed-include > 0 (not yet confirmed at next level):
       → detect next basis from reviewers
       → "N articles picked — confirm at {next_basis} level"
       → $ review extract --filter agreed-include --basis {next_basis} ...
  3. Else if agreed > 0:
       → $ review finalize ...
  4. Else if all finalized:
       → $ review export --only included
```

### `review init` CLI

```bash
search-hub review init --session <id> [--mode <screening|picking>] [--force]
```

Default mode: `screening` (backward compatible).

### `review status` Output

```
Review Progress: my-session (picking mode)
  Total:         50
  ...
```

## Implementation Steps

### Step 1: Add `ReviewMode` type and `mode` field to `ReviewFile`

- [x] Write test: `src/cli/commands/review/types.test.ts` — validate `ReviewMode` type
- [x] Add `ReviewMode` type (`'screening' | 'picking'`)
- [x] Add optional `mode` field to `ReviewFile` interface
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `ReviewFile` accepts `mode: 'picking'`

### Step 2: `review init --mode` option

- [x] Write test: `src/cli/commands/review/init.test.ts` — verify `--mode picking` saves mode to master file
- [x] Add `--mode` option to `ReviewInitOptions`
- [x] Update `executeReviewInit()` to save `mode` in the master file YAML
- [x] Default to `'screening'` when not specified
- [x] Verify tests pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review init --mode picking` creates reviews.yaml with `mode: picking`

### Step 3: Mode-aware extract comments

- [x] Write test: `src/cli/commands/review/extract.test.ts` — verify comments differ by mode
- [x] Update `getDecisionInlineComment(basis, mode)` signature
  - picking + title → `# include / uncertain`
  - screening + title → `# exclude / uncertain` (unchanged)
  - abstract/fulltext → unchanged for both modes
- [x] Update `getBasisGuidanceComment(basis, mode)` signature
  - picking + title → "Mark relevant items as include. Leave everything else as uncertain."
  - screening + title → unchanged
  - abstract/fulltext → unchanged for both modes
- [x] Update `executeReviewExtract()` to load mode from master file and pass to comment functions
- [x] Verify tests pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Extracted YAML shows mode-appropriate comments and guidance

### Step 4: Mode-aware Next Steps

- [x] Write test: `src/cli/commands/review/next-steps.test.ts` — verify picking mode suggestions
- [x] Add `mode` field to `ReviewNextStepsContext`
- [x] Update `generateReviewNextSteps()`:
  - picking + pending → same as screening (extract for title review)
  - picking + post-title → "N articles picked — confirm at abstract level" with `--filter agreed-include,all-uncertain`
  - picking + all finalized → "N articles ready for export" with `--only included`
- [x] Verify tests pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Picking mode shows inclusion-oriented next steps

### Step 5: Mode display in `review status`

- [x] Write test: `src/cli/commands/review/status.test.ts` — verify mode shown in output
- [x] Update `formatStatusOutput()` to show mode when present
- [x] Update `ReviewStatusResult` to include `mode` field
- [x] Verify tests pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review status` shows "(picking mode)" or "(screening mode)"

### Step 6: Wire `--mode` option in CLI registration

- [x] Update review init command registration to accept `--mode` option
- [x] Verify `search-hub review init --help` shows `--mode` option
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: CLI accepts and passes `--mode` option

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/cli/commands/review/review-workflow.test.ts` (added to existing file)
  - Test picking mode: init → extract (title, verify comments) → merge → finalize → export
  - Verify title-level extract shows `# include / uncertain`
  - Verify next steps show inclusion-oriented guidance
  - Verify pending articles are not auto-excluded
- [x] Verify all unit tests pass (322 review tests, 2275 total unit tests)
- [x] Run full test suite: `npm test`
- [x] Acceptance: All tests pass, picking mode workflow works end-to-end

## Notes

- `classifyStatus()` requires NO changes — basis-priority override already handles the picking flow correctly
- `review finalize` requires NO behavior changes — it already only finalizes agreed articles and leaves pending as-is
- `exclude` remains a valid decision at title level in picking mode — it's just not shown in the inline comment hint
- Backward compatible: no `mode` field = `screening` (existing reviews unaffected)
