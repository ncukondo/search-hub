# Task: Results Listing Command

## Purpose

During iterative query refinement, users need to quickly browse search results (titles, years, journals) without exporting to a file and writing scripts to parse JSON. Currently, `summary` only shows aggregate statistics (year distribution, journal counts) but no article-level information.

This task adds a `results` command that displays article titles and metadata directly in the terminal, supporting pagination and field selection.

**Pain point observed:** In a real search session (WBA + GenAI, 6 query iterations), every iteration required `export --format json -o file.json` followed by a Python script to list titles. This should be a single CLI command.

## Related Specs

- [spec/cli](../cli/) - CLI command structure
- [spec/models](../models/) - Article data model

## Related Source Files

- `src/cli/index.ts` - Command registration
- `src/cli/commands/export.ts` - Existing result loading and filtering logic (reuse)
- `src/cli/commands/summary.ts` - Existing session loading pattern (reuse)
- `src/cli/commands/results.ts` - New file
- `src/cli/commands/results.test.ts` - New test file

## Design

### Command Interface

```bash
# Basic: list titles with year and journal
search-hub results <session-id>

# Pagination
search-hub results <session-id> --limit 20 --offset 40

# Select fields to display
search-hub results <session-id> --fields title,year,journal,doi

# Filter (reuse existing export filter logic)
search-hub results <session-id> --filter-year 2024-2025
search-hub results <session-id> --filter-title "workplace,feedback"

# Output as JSON for scripting
search-hub results <session-id> --json

# Provider filter
search-hub results <session-id> --db pubmed
```

### Default Output Format

```
Results: wba-genai-v6 (20260203_wba-genai-v6_674451)
Showing 1-20 of 28 articles

 1. [2025] Leveraging Large Language Models to Evaluate the Quality of...
    Annals of surgery open
    DOI: 10.1097/AS9.0000000000000001

 2. [2024] Fine-Tuning Large Language Models to Enhance Programmatic...
    The journal of education in perioperative medicine
    DOI: 10.46374/volXX-issueX-pageY

...
```

### Architecture

- Reuse `loadSession()`, `loadArticles()`, `deduplicateArticles()`, `filterArticles()` from existing export pipeline
- Add formatting functions specific to terminal display (truncation, alignment)
- Support `--json` flag for machine-readable output (array of articles)
- Pagination via `--limit` and `--offset` (default: show all)

## Implementation Steps

### Step 1: Core results listing with default format

- [x] Write test: `src/cli/commands/results.test.ts`
  - Test `formatResultsList()` with sample articles
  - Test pagination logic (limit/offset)
  - Test field selection
- [x] Create stub: `src/cli/commands/results.ts`
- [x] Verify test fails (Red)
- [x] Implement `parseResultsOptions()`, `formatResultsList()`, `formatResultsJson()`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: `formatResultsList()` produces correct terminal output with numbering, truncation, and pagination info

### Step 2: Register CLI command with options

- [ ] Write test: command registration and option parsing
- [ ] Implement command registration in `src/cli/index.ts`
- [ ] Wire up session loading → article loading → dedup → filter → format → output
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub results <session-id>` works end-to-end

### Step 3: Filter and provider options

- [ ] Write test: filter integration (year, title, abstract keywords)
- [ ] Implement `--filter-year`, `--filter-title`, `--filter-abstract`, `--db` options
- [ ] Reuse `filterArticles()` from export.ts
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: filters correctly narrow displayed results, count header reflects filtered total

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/results.e2e.test.ts`
  - Create a session with sample results
  - Run `search-hub results <session-id>` and verify output
  - Test with `--limit`, `--offset`, `--json`, `--filter-year`
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test with a real session
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- This command is essentially a "display-only export" - it should share as much code as possible with the export command
- Consider extracting shared article-loading logic into a common utility if not already done
- Terminal width awareness for title truncation would be nice but not required for v1
