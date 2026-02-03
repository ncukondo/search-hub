# Task: Fix Review Source Tracking

## Purpose

Fix the loss of source information during review workflow deduplication. Currently, single-source articles (not merged) lose their provider origin (pubmed, scopus, etc.).

### Problem

In `dedup.ts`, `mergedFrom` is only set when duplicates exist:

```typescript
// Current: only sets mergedFrom for merged articles
if (sources.length > 1) {
  unique[index]!.mergedFrom = sources;
}
```

This means:
- Merged articles (2+ sources) → `mergedFrom` preserved ✅
- Single articles (1 source) → `mergedFrom` undefined, **source lost** ❌

### Impact

When `register --reviewed` converts `ArticleEntry` back to `Article`, it cannot determine the original source and falls back to a hardcoded `'pubmed'` placeholder.

## Related Specs

- [spec/tasks/completed/20260203-07-review-workflow.md](../completed/20260203-07-review-workflow.md) - Original review workflow
- [spec/tasks/active/20260203-08-register-review-integration.md](./20260203-08-register-review-integration.md) - Register integration (exposed this issue)

## Related Source Files

- `src/cli/commands/review/dedup.ts` - Deduplication logic
- `src/cli/commands/review/init.ts` - articleToEntry conversion
- `src/cli/commands/register.ts` - getIncludedArticles (affected by this bug)

## Implementation Steps

### Step 1: Always set mergedFrom in dedup.ts

- [x] Write test: single article should have `mergedFrom` with one entry
- [x] Modify `deduplicateArticles()` to always set `mergedFrom`
- [x] Verify tests pass
- [x] Acceptance: All articles have `mergedFrom` after dedup

### Step 2: Update getIncludedArticles to use mergedFrom

- [x] Write test: source should come from `mergedFrom[0].source`
- [x] Write test: error if `mergedFrom` is missing or empty
- [x] Remove hardcoded `'pubmed'` fallback
- [x] Verify tests pass
- [x] Acceptance: Correct source is used, error on missing

### Step 3: Handle multiple sources in Article type (optional)

- [x] Consider if `Article.source` should be `ProviderName[]`
- [x] Or add `Article.sources` as optional array
- [x] Document decision

**Decision**: Keep `Article.source` as a single `ProviderName` value.
- `mergedFrom` already tracks all sources in the review workflow
- For `register --reviewed`, the first source (primary source) is sufficient
- Changing `Article.source` to an array would require widespread changes
- Trade-off: simpler implementation vs. losing secondary sources in Article type
- The `mergedFrom` array preserves full provenance for audit purposes

### Final Step: Integration Tests

- [x] E2E test: search → review init → register --reviewed preserves source
- [x] Run full test suite
- [x] Acceptance: All tests pass

## Notes

- This is a bug fix for review workflow, not a new feature
- Backward compatibility: existing reviews.yaml without mergedFrom should error clearly
- Consider migration path for existing review files
