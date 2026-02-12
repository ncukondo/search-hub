# Task: Coverage Check Command (`check`)

## Purpose

Add a `check` command that verifies whether known articles (from prior reviews, guidelines, etc.) are present in a session's search results. This is essential for search query quality validation — users extract reference lists from prior review fulltexts (using external tools) and feed them to `check` to measure coverage.

The command is discoverable via:
1. `search-hub --help` workflow section (listed in "Inspect & verify" step)
2. `results` command output footer hint
3. `search-hub --help` command list with description mentioning "coverage" and "known articles"

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - command definitions (to be updated)
- [spec/models/common-types.md](../models/common-types.md) - Article type, identifier fields

## Related Source Files

- `src/cli/commands/check.ts` (new)
- `src/cli/commands/check.test.ts` (new)
- `src/cli/commands/session-utils.ts` - `loadSessionArticles()`, `getArticleKeys()`
- `src/cli/index.ts` - CLI command registration

## Design

### CLI Interface

```bash
# From file (primary use case)
search-hub check <session-id> --file known-dois.txt

# Direct identifiers (for quick spot checks)
search-hub check <session-id> --doi "10.1001/jama.2023.12345,10.1016/j.lancet.2022.xxx"
search-hub check <session-id> --pmid "37654321,36543210"

# Output options
search-hub check <session-id> --file refs.txt --json
search-hub check <session-id> --file refs.txt --missing-only
```

### Input File Format

Plain text, one identifier per line. Auto-detection of identifier type:

```
10.1001/jama.2023.12345          ← DOI (starts with "10.")
10.1016/j.lancet.2022.01234     ← DOI
37654321                          ← PMID (numeric only)
DOI:10.1038/s41586-023-xxxxx    ← DOI (explicit prefix)
PMID:36543210                    ← PMID (explicit prefix)
arxiv:2301.12345                 ← arXiv ID (explicit prefix)
```

Rules:
- Lines starting with `#` are comments (ignored)
- Empty lines are ignored
- Whitespace is trimmed
- Prefix (`DOI:`, `PMID:`, `ARXIV:`) is case-insensitive
- Without prefix: `10.*` → DOI, all-digits → PMID, otherwise → error with line number

### Identifier Matching

Reuses existing `getArticleKeys()` logic from `session-utils.ts`:
- DOI: case-insensitive comparison
- PMID, arXiv, Scopus, ERIC IDs: exact string match
- An article matches if **any** identifier matches

### Output Format (text)

```
Coverage: 20240115_diabetes_a3f2c1
Source: known-dois.txt (15 identifiers)

Found: 12/15 (80.0%)

Missing (3):
  10.1001/jama.2023.99999
  10.1016/j.lancet.2022.01234
  PMID:99887766

Found (12):
  10.1038/s41586-023-xxxxx      → pubmed, scopus
  10.1001/jama.2023.12345       → pubmed
  ...
```

### Output Format (JSON)

```json
{
  "session": "20240115_diabetes_a3f2c1",
  "source": "known-dois.txt",
  "total": 15,
  "found": 12,
  "missing": 3,
  "coverage": 0.8,
  "details": {
    "found": [
      { "query": "10.1038/s41586-023-xxxxx", "type": "doi", "sources": ["pubmed", "scopus"], "title": "..." }
    ],
    "missing": [
      { "query": "10.1001/jama.2023.99999", "type": "doi" }
    ]
  }
}
```

### Discoverability Integration

1. **`search-hub --help` workflow section** (in `src/cli/index.ts`):
   ```
   3. results / summary / diff / check                Inspect & verify
   ...
   Iterate: search → results -q → check → diff       Query refinement
   ```

2. **`results` output footer hint** (when showing many results):
   ```
   Tip: Use check to verify coverage: check SESSION --file known-dois.txt
   ```

## Implementation Steps

### Step 1: Identifier file parser

- [x]Write test: `src/cli/commands/check.test.ts`
  - Parses DOIs (`10.xxxx/yyyy`)
  - Parses PMIDs (numeric)
  - Parses prefixed identifiers (`DOI:xxx`, `PMID:xxx`, `ARXIV:xxx`)
  - Skips comments (`#`) and empty lines
  - Trims whitespace
  - Errors on unrecognizable lines (with line number)
  - Handles mixed identifier types in one file
- [x]Create stub: `src/cli/commands/check.ts`
- [x]Verify test fails (Red)
- [x]Implement `parseIdentifierFile(content: string)` function
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Acceptance: parser correctly handles all identifier formats

### Step 2: Coverage matching engine

- [x]Write test: `src/cli/commands/check.test.ts` (add matching tests)
  - Matches DOI (case-insensitive)
  - Matches PMID (exact)
  - Reports found articles with their source databases
  - Reports missing identifiers
  - Calculates coverage percentage
  - Handles articles with multiple identifiers (any match counts)
  - Handles empty session (0% coverage)
  - Handles empty identifier list (error or 0/0)
- [x]Implement `checkCoverage(articles, identifiers)` function
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Acceptance: matching engine correct for all cases

### Step 3: Text output formatter

- [x]Write test: `src/cli/commands/check.test.ts` (add formatting tests)
  - Shows coverage summary (found/total with percentage)
  - Lists missing identifiers
  - Lists found identifiers with source databases
  - `--missing-only` shows only missing
  - Includes article title for found items
- [x]Implement `formatCheckResult()` function
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Acceptance: output format matches design

### Step 4: JSON output formatter

- [x]Write test: `src/cli/commands/check.test.ts` (add JSON tests)
  - JSON structure matches design
  - Includes session ID, source, total, found, missing, coverage, details
- [x]Implement `formatCheckResultJson()` function
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Acceptance: JSON output matches specification

### Step 5: CLI command registration

- [x]Write test: CLI integration tests
  - `check SESSION --file known.txt` → runs and shows coverage
  - `check SESSION --doi "10.xxx"` → checks single DOI
  - `check SESSION --pmid "12345"` → checks single PMID
  - `check SESSION --file known.txt --json` → JSON output
  - `check SESSION --file known.txt --missing-only` → only missing
  - Error: no `--file` or `--doi`/`--pmid` → helpful error message
  - Error: file not found → error with path
  - Error: session not found → error with session ID
- [x]Register `check` command in `src/cli/index.ts`
  - Add command with description: "Verify coverage of known articles against session results"
  - Add `--file`, `--doi`, `--pmid`, `--json`, `--missing-only` options
  - Add help text with examples
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Acceptance: full CLI integration working

### Step 6: Discoverability integration

- [x]Update `search-hub --help` workflow section to include `check`
- [x]Add hint to `results` command output footer mentioning `check`
- [x]Add `check` to Quick Start section in help text
- [x]Acceptance: `check` is visible in help text at appropriate points

### Final Step: E2E Integration Tests (MANDATORY)

- [x]Write E2E test: `src/cli/commands/check.e2e.test.ts`
  - Create session with known articles (with DOIs and PMIDs)
  - Create identifier file with mix of found and missing IDs
  - Run `check SESSION --file ids.txt` → correct coverage report
  - Run `check SESSION --doi "known-doi"` → found
  - Run `check SESSION --doi "unknown-doi"` → missing
  - Run `check SESSION --file ids.txt --json` → valid JSON with correct fields
  - Run `check SESSION --file ids.txt --missing-only` → only missing shown
- [x]Verify all E2E tests pass
- [x]Run full test suite: `npm test`
- [x]**Manual verification**: Test with real session data
- [x]Acceptance: All tests pass, feature works in real usage

## Notes

- The identifier file parser should be strict about unrecognizable lines to prevent silent data loss
- Reuse `getArticleKeys()` from `session-utils.ts` for identifier extraction from articles
- The deduplication logic in the matching engine should handle the case where a single article is found via multiple identifiers in the input
- Test files are co-located with source files (`*.test.ts`)
