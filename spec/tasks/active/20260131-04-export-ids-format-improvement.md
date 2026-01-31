# Task: Improve IDs Export Format and Add Year Field

## Purpose

Two usability issues were identified during result export:

### 1. IDs export format lacks article-level grouping

`search-hub export --format ids --id-type all` outputs DOI and PMID on alternating lines
with no grouping, making it impossible to determine which DOI corresponds to which PMID:

```
doi:10.1186/s12890-026-04141-1
pmid:41612242
doi:10.1136/bcr-2025-270094
pmid:41605554
```

### 2. No `year` convenience field in JSON export

The `Article` schema only has `publicationDate` (ISO 8601 format: `"2025"`, `"2025-03"`,
`"2025-03-15"`), but no `year` field. Consumers frequently need to filter or group by year,
requiring them to parse the date string.

### Impact

- The IDs format is confusing when an article has both DOI and PMID
- Year-based analysis requires custom parsing of `publicationDate`
- Systematic review tools commonly expect a year field

## Related Specs

- [spec/cli/output-formats.md](../cli/output-formats.md) - Export format definitions
- [spec/models/common-types.md](../models/common-types.md) - Article type definition

## Related Source Files

- `src/cli/commands/export.ts` - Export logic, ID formatting
- `src/providers/base/types.ts` - `Article` interface (lines 40-62)

## Implementation Steps

### Step 1: Add failing test for grouped IDs output

- [ ] Write test: `src/cli/commands/export.test.ts`
  - Test: `--format ids --id-type all` groups identifiers per article, separated by blank lines:
    ```
    pmid:41612242
    doi:10.1186/s12890-026-04141-1

    pmid:41605554
    doi:10.1136/bcr-2025-270094
    ```
  - Test: articles with only PMID (no DOI) show single line per group
  - Test: articles with only DOI show single line per group
- [ ] Verify test fails (Red)
- [ ] Acceptance: Test demonstrates current ungrouped output

### Step 2: Implement grouped IDs format

- [ ] Modify `src/cli/commands/export.ts`
  - Group all identifiers for each article together
  - Separate article groups with a blank line
  - Within each group, output identifiers in a consistent order (pmid, doi)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: IDs output clearly associates identifiers per article

### Step 3: Add `year` field to JSON/JSONL export

- [ ] Write test: `src/cli/commands/export.test.ts`
  - Test: JSON export includes `year` field extracted from `publicationDate`
  - Test: `publicationDate: "2025"` → `year: 2025`
  - Test: `publicationDate: "2025-03-15"` → `year: 2025`
  - Test: `publicationDate: undefined` → `year: null`
- [ ] Verify test fails (Red)
- [ ] Implement year extraction in export logic
  - Parse the first 4 characters of `publicationDate` as the year
  - Add `year` as a computed field in JSON/JSONL output (not stored in session data)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: JSON export includes correct `year` for all articles

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/export.e2e.test.ts`
  - Test: IDs export with real session data produces correctly grouped output
  - Test: JSON export contains `year` field matching `publicationDate`
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Export a real session and verify both formats
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- The `year` field should be added at export time, not to the `Article` interface, to avoid
  data duplication in the session storage
- Consider adding `--separator` option for IDs format (blank line, tab, custom) in the future
- The grouped format is still grep-friendly: `grep "^pmid:" output.txt` still works
