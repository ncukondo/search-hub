# Task: Export Filter Options

## Purpose

Add filtering capabilities to the `export` command, allowing users to narrow results by year range and keywords before exporting. This is useful for large result sets where only a subset is needed for a specific analysis.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - Export command options
- [spec/cli/output-formats.md](../cli/output-formats.md) - Export formats

## Related Source Files

- `src/cli/commands/export.ts` - Export logic
- `src/cli/commands/export.test.ts` - Export tests
- `src/cli/index.ts` - CLI command registration

## Design Details

### Filter Interface

```typescript
interface ExportFilter {
  yearFrom?: number;
  yearTo?: number;
  titleKeywords?: string[];    // OR-combined within field
  abstractKeywords?: string[]; // OR-combined within field
}
```

### Filtering Logic

- `yearFrom`/`yearTo`: Extract year from `publicationDate`, check range (inclusive)
- `titleKeywords`: At least one keyword must appear in title (case-insensitive)
- `abstractKeywords`: At least one keyword must appear in abstract (case-insensitive)
- Multiple filter types are AND-combined (year range AND title keywords AND abstract keywords)

### CLI Options

```
--filter-year <range>         Year range filter (e.g., "2023-2025")
--filter-title <keywords>     Title keyword filter (comma-separated)
--filter-abstract <keywords>  Abstract keyword filter (comma-separated)
```

### Filter Application Point

Filters are applied after deduplication and before formatting. The output message includes filter impact:
```
Exported 45 articles (filtered from 860)
```

## Implementation Steps

### Step 1: Implement `filterArticles()` function

- [x] Write test: `src/cli/commands/export.test.ts`
  - Test: year range filter (`yearFrom: 2023, yearTo: 2025`)
  - Test: title keyword filter (case-insensitive, OR within field)
  - Test: abstract keyword filter (case-insensitive, OR within field)
  - Test: combined filters (year AND keywords = AND)
  - Test: no matching articles returns empty array
  - Test: articles without `publicationDate` are excluded by year filter
  - Test: articles without `abstract` are excluded by abstract keyword filter
- [x] Verify test fails (Red)
- [x] Implement `filterArticles()` in `src/cli/commands/export.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All filter combinations work correctly

### Step 2: Add CLI options and wire up filters

- [x] Add `--filter-year`, `--filter-title`, `--filter-abstract` options to export command in `src/cli/index.ts`
- [x] Parse `--filter-year` range string (e.g., `"2023-2025"` → `{ yearFrom: 2023, yearTo: 2025 }`)
- [x] Parse `--filter-title` and `--filter-abstract` comma-separated strings into arrays
- [x] Apply `filterArticles()` after deduplication, before formatting
- [x] Include filter summary in output message
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: CLI filter options work end-to-end

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/export.e2e.test.ts`
  - Test: export with year filter reduces result count
  - Test: export with title keyword filter works
  - Test: output message shows filtered count
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Export a real session with filters
- [ ] Acceptance: All tests pass, filters work in real usage

## Notes

- Filters apply to all export formats (`ids`, `json`, `jsonl`, `csl-json`)
- Year filter uses the same year extraction logic as the `year` field in JSON export (Task #30)
