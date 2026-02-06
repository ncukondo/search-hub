# Task: Remove fulltext-index.json

## Purpose

Remove the deprecated `fulltext-index.json` central index and related code.
The architecture has been simplified: `meta.json` (per-directory) serves as the source of truth,
and `reviews.yaml` fulltext ref provides the article-to-directory linkage.

## Background

`fulltext-index.json` was originally designed as a central lookup index for fast identifier-based search.
However, it duplicates data already present in individual `meta.json` files and creates synchronization burden.
The new architecture is:
- **meta.json** (per article directory): Source of truth for fulltext metadata, OA status, file info
- **reviews.yaml fulltext ref** (per article entry): Links article records to fulltext directories (dirName + hasFiles)

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - Updated to remove fulltext-index.json

## Files to Remove

- `src/fulltext/index-manager.ts` - Index CRUD operations
- `src/fulltext/index-manager.test.ts` - Index tests

## Files to Modify

- `src/fulltext/types.ts` - Remove `FulltextIndex`, `FulltextIndexEntry` interfaces
- `src/fulltext/paths.ts` - Remove `getIndexPath()` function
- `src/fulltext/paths.test.ts` - Remove `getIndexPath` test
- `src/fulltext/foundation.test.ts` - Remove index-manager related integration tests

## Implementation Steps

### Step 1: Remove index-manager module

- [x] Delete `src/fulltext/index-manager.ts`
- [x] Delete `src/fulltext/index-manager.test.ts`
- [x] Run `npm run typecheck` — identify remaining references
- [x] Fix all import errors

### Step 2: Remove types and paths

- [x] Remove `FulltextIndex` and `FulltextIndexEntry` from `src/fulltext/types.ts`
- [x] Remove `getIndexPath()` from `src/fulltext/paths.ts`
- [x] Update `src/fulltext/paths.test.ts` to remove `getIndexPath` test
- [x] Run `npm run lint && npm run typecheck`

### Step 3: Update foundation test

- [x] Remove index-manager imports and tests from `src/fulltext/foundation.test.ts`
- [x] Run `npm test`
- [x] Acceptance: All tests pass with no references to fulltext-index.json

### Final Step: Verify clean removal

- [x] `grep -r "fulltext-index\|FulltextIndex\|FulltextIndexEntry\|index-manager" src/` returns no matches
- [x] Run full test suite: `npm test`
- [x] Acceptance: No traces of fulltext-index.json in source code

## Dependencies

- Task 60 (Fulltext Init and Sync) — must be merged first (may still reference index-manager)
- Task 61 (Fulltext OA Discovery) — must be merged first

## Notes

- This is a cleanup/refactoring task with no new functionality
- Any command that previously updated fulltext-index.json should now update reviews.yaml fulltext ref instead (handled in respective PRs)
