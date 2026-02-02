# Task: Deduplicate Search Results by Identifier

## Purpose

Search results can contain duplicate articles due to PubMed API pagination overlaps, retry
behavior, or multi-database searches returning the same article. Currently, no deduplication
is performed during search or export.

### Evidence

In a 100-result PubMed search, PMID 41541042 appeared twice. When multiple databases are used,
the same article may appear with both a PMID (from PubMed) and a DOI (from Scopus), but with
no cross-database deduplication.

### Impact

- Inflated result counts misrepresent the actual number of unique articles
- Duplicate entries waste time during screening and reference management
- Systematic review methodology requires accurate, deduplicated counts

## Related Specs

- [spec/models/session.md](../models/session.md) - Session structure and result storage
- [spec/cli/commands.md](../cli/commands.md) - Export command behavior

## Related Source Files

- `src/providers/pubmed/provider.ts` - PubMed search yielding results (lines 51-154)
- `src/providers/base/types.ts` - `Article` interface definition
- `src/cli/commands/export.ts` - Export functions (lines 89-122)
- `src/session/manager.ts` - Session result storage

## Implementation Steps

### Step 1: Add failing tests for within-provider deduplication

- [x] Write test: `src/cli/commands/export.test.ts`
  - Test: exporting results that contain duplicate PMIDs produces only unique articles
  - Test: the first occurrence is kept (preserving retrieval order)
  - Test: dedup count is reported (e.g., "Exported 99 articles (1 duplicate removed)")
- [x] Verify test fails (Red)
- [x] Acceptance: Tests demonstrate duplicate output

### Step 2: Implement deduplication in export

- [x] Modify `src/cli/commands/export.ts`
  - Add deduplication by primary identifier (PMID for PubMed, DOI as fallback)
  - Deduplicate before writing output
  - Report the number of duplicates removed in non-quiet mode
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Exports contain only unique articles

### Step 3: Add failing tests for cross-provider deduplication

- [x] Write test: `src/cli/commands/export.test.ts`
  - Test: articles with the same DOI from different providers are deduplicated
  - Test: when merging, prefer the record with more metadata (e.g., PubMed record with PMID+DOI over Scopus record with DOI only)
- [x] Verify test fails (Red)
- [x] Acceptance: Tests demonstrate cross-provider duplicates

### Step 4: Implement cross-provider deduplication

- [x] Modify `src/cli/commands/export.ts`
  - Deduplicate by DOI across providers
  - When both records have a DOI match, prefer the one with more complete metadata
  - Preserve source attribution (record which providers found the article)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Cross-provider duplicates are merged correctly

### Step 5: Report deduplication statistics in session status

- [ ] Modify `src/cli/commands/status.ts`
  - Show total unique articles vs raw count
  - Example: `Total: 150 raw / 142 unique (8 duplicates)`
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Status command shows dedup info

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/export.e2e.test.ts`
  - Create a session fixture with known duplicates (same PMID, same DOI across providers)
  - Verify exported results are deduplicated
  - Verify dedup count is accurate
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run a multi-database search and verify export deduplication
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Deduplication should be optional via a `--no-dedup` flag for users who want raw results
- The raw (non-deduplicated) results should be preserved in the session; dedup applies at export time
- Consider adding a `--dedup-strategy` option in the future (by-pmid, by-doi, by-title-similarity)
- This is important for systematic review methodology where exact counts matter
