# Task: Dry-Run No-ID Article Details

## Purpose

The `register --dry-run` output currently shows a count of articles that will be skipped due to missing identifiers (e.g., "46 articles will be skipped (no identifier)"), but provides no details about which articles are affected. This makes it difficult for users to understand what they're missing and whether alternative identifiers could be used.

This task enhances the dry-run output to show details of skipped articles, including their titles, sources, and available non-DOI/PMID identifiers.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - Register command dry-run option
- [spec/integration/reference-manager.md](../integration/reference-manager.md) - Registration flow

## Related Source Files

- `src/cli/commands/register.ts` - `formatDryRunOutput()` function
- `src/cli/commands/register.test.ts` - Dry-run output tests

## Design Details

### Enhanced Output Format

Current:
```
46 articles will be skipped (no identifier)
```

Improved:
```
46 articles will be skipped (no DOI or PMID):
  - "Article Title One..." (source: arxiv, has: arxiv:2401.12345)
  - "Article Title Two..." (source: eric, has: eric:ED123456)
  - "A Very Long Article Title That Gets Trunc..." (source: pubmed)
  ... and 36 more
```

- Show up to 10 articles
- Truncate titles longer than 50 characters
- Show source provider and any available alternative identifiers
- Show "... and N more" if more than 10

## Implementation Steps

### Step 1: Enhance dry-run output for no-ID articles

- [x] Write test: `src/cli/commands/register.test.ts`
  - Test: articles without DOI/PMID show title, source, and alternative IDs
  - Test: titles are truncated at 50 characters with "..."
  - Test: maximum 10 articles are shown, remainder as "... and N more"
  - Test: articles with no alternative IDs show only title and source
- [x] Verify test fails (Red)
- [x] Modify `formatDryRunOutput()` in `src/cli/commands/register.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Dry-run output shows helpful details for skipped articles

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/register.e2e.test.ts` (or update existing)
  - Test: dry-run with session containing no-ID articles shows detailed output
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run `register --dry-run` on a real session
- [ ] Acceptance: All tests pass, dry-run output is informative

## Notes

- Alternative identifiers to display: `arxiv` (arXiv ID), `eric` (ERIC ID), `scopus` (Scopus EID)
- This is a display-only change; no changes to registration logic
