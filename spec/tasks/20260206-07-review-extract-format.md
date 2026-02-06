# Task: Review Extract Format Enhancement

## Purpose

Enhance the extract command to support the progressive screening workflow:
1. Change work file default decision from `null` to `uncertain` (mark-by-exception)
2. Add `reviewHistory` separation for responsible person's confirmation workflow
3. Make `--reviewer` required for both extract modes
4. Add `--basis fulltext` support
5. Remove `--input` from mark command (YAML direct editing for bulk)

## Related Specs

- [spec/cli/review.md](../cli/review.md) - File Formats section
- `schemas/review.schema.json` - review file JSON schema

## Related Source Files

- `src/cli/commands/review/extract.ts` - `executeReviewExtract()`
- `src/cli/commands/review/extract.test.ts`
- `src/cli/commands/review/merge.ts` - `processReviewFile()`, `processWorkFile()`, `isDuplicateReview()`
- `src/cli/commands/review/merge.test.ts`
- `src/cli/commands/review/mark.ts` - `executeReviewMark()`, `ReviewMarkOptions`
- `src/cli/commands/review/mark.test.ts`
- `src/cli/commands/review/types.ts` - `WorkFileArticle`, `ArticleEntry`
- `src/cli/index.ts` - CLI option definitions

## Implementation Steps

### Step 1: Change Work File Default Decision to `uncertain`

- [ ] Write test: `src/cli/commands/review/extract.test.ts`
  - Work file articles have `decision: 'uncertain'` (not `null`) by default
  - Merge processes `uncertain` decisions (creates review entry)
  - `null` decisions are still skipped on merge (backward-compatible)
- [ ] Change `decision: null` to `decision: 'uncertain'` in `executeReviewExtract` work file generation
- [ ] Verify test fails (Red)
- [ ] Implement change
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Extracted work files have `decision: uncertain` as default

### Step 2: Add `reviewHistory` to ReviewFile Extract

- [ ] Write test: `src/cli/commands/review/extract.test.ts`
  - ReviewFile extract (no `--basis`) separates existing reviews into `reviewHistory`
  - `reviews` array is empty `[]` in extracted ReviewFile
  - `finalDecision` is `null` in extracted ReviewFile
  - Articles with existing reviews have them in `reviewHistory`
  - Articles with no reviews have empty `reviewHistory`
- [ ] Add `reviewHistory?: Review[]` to `ArticleEntry` (optional, only in extracted files)
- [ ] Update `executeReviewExtract` ReviewFile mode: move `article.reviews` to `reviewHistory`, set `reviews: []`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Extracted ReviewFile has correct `reviewHistory`/`reviews` separation

### Step 3: Add Top-Level `reviewer` to ReviewFile Extract

- [ ] Write test: `src/cli/commands/review/extract.test.ts`
  - ReviewFile extract includes top-level `reviewer` field
  - `--reviewer` is required for ReviewFile mode (no `--basis`)
- [ ] Update `ReviewFile` or create extracted variant with `reviewer` field
- [ ] Update `executeReviewExtract` to include `reviewer` in ReviewFile output
- [ ] Update CLI: make `--reviewer` required (not just when `--basis` is specified)
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `--reviewer` is required for all extract modes

### Step 4: Update `processReviewFile` for New Format

- [ ] Write test: `src/cli/commands/review/merge.test.ts`
  - Merge ignores `reviewHistory` (not added to master)
  - Merge processes only `reviews[]` (all treated as new)
  - `reviewer` is taken from top-level field
  - `basis` is auto-detected from article data when not specified on review
  - `timestamp` is auto-assigned when not specified
  - `finalDecision` is applied when set
  - No duplicate detection: all reviews in `reviews[]` are added
- [ ] Update `processReviewFile` to use new format
- [ ] Remove `isDuplicateReview` function (no longer needed)
- [ ] Add `detectBasis(article)` helper: fulltext > abstract > title
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Merge correctly processes ReviewFile with reviewHistory separation

### Step 5: Add `--basis fulltext` Support

- [ ] Write test: `src/cli/commands/review/extract.test.ts`
  - `--basis fulltext` includes `fulltext` field (dirName) in work file articles
  - Abstract is also included for fulltext basis
- [ ] Add `fulltext?: string` to `WorkFileArticle`
- [ ] Update `executeReviewExtract` to include fulltext dirName for `--basis fulltext`
- [ ] Update CLI basis validation to accept `'fulltext'`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `extract --basis fulltext` includes fulltext reference

### Step 6: Remove `--input` from Mark Command

- [ ] Write test: `src/cli/commands/review/mark.test.ts`
  - Remove batch input tests
  - Single marking still works
- [ ] Remove `input` from `ReviewMarkOptions`
- [ ] Remove batch marking code from `executeReviewMark`
- [ ] Remove `DecisionInput` interface
- [ ] Update CLI: remove `--input` option
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `mark` only supports single-article marking

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full title screening workflow with default `uncertain`:
    extract → edit YAML (change some to exclude) → merge → verify reviews
  - Responsible person confirmation workflow:
    extract (no basis) → verify reviewHistory → add finalDecision → merge → verify
  - Fulltext workflow: extract --basis fulltext → verify fulltext field present
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, new extract formats work end-to-end

## Notes

- Depends on Task 72 (Status Model Expansion) for consistent status values.
- The `reviewHistory` field is only present in extracted ReviewFiles, never in the master file.
- `isDuplicateReview` removal is safe because ReviewFile mode no longer needs it,
  and WorkFile mode never used it (all entries are new by definition).
- JSON schema updates for `reviewHistory` and `fulltext` in WorkFileArticle needed.
