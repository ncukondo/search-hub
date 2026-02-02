# Task: Summary Command

## Purpose

Add a `summary` command that provides statistical analysis of session results, including year distribution, database breakdown, top journals, and identifier coverage. This gives users a quick overview of their search results without needing to export and analyze externally.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - CLI command definitions
- [spec/cli/output-formats.md](../cli/output-formats.md) - Output format conventions

## Related Source Files

- `src/cli/commands/summary.ts` (new) - Summary computation and formatting
- `src/cli/commands/summary.test.ts` (new) - Summary tests
- `src/cli/index.ts` - CLI command registration

## Design Details

### CLI Interface

```bash
search-hub summary <session-id> [options]
  --json    Output as JSON
```

### Output Format (Human-Readable)

```
Session: genai-wba-meded (20260202_genai-wba-meded_f4a0ea)
Total: 860 articles (814 unique after deduplication)

Year distribution:
  2020:  23 ██
  2021:  48 ████
  2022:  53 ████
  2023:  75 ██████
  2024: 227 ██████████████████
  2025: 404 ████████████████████████████████
  2026:  29 ██

Database breakdown:
  pubmed: 813 (94.5%)
  eric:    38 (4.4%)
  arxiv:    9 (1.0%)

Top journals (by article count):
  BMC medical education:           45
  JMIR medical education:          38
  Academic medicine:               22
  Medical teacher:                 18
  Scientific reports:              15
  ...

Identifier coverage:
  With DOI:  780 (90.7%)
  With PMID: 813 (94.5%)
  No DOI/PMID: 46 (5.3%)
```

### Data Structure

```typescript
interface SessionSummary {
  sessionId: string;
  sessionName: string;
  totalArticles: number;
  uniqueArticles: number;
  yearDistribution: Record<string, number>;  // year string or "unknown"
  databaseBreakdown: Record<string, number>;
  topJournals: Array<{ name: string; count: number }>;
  identifierCoverage: {
    withDoi: number;
    withPmid: number;
    noDoiOrPmid: number;
  };
}
```

### Data Loading

Article data loading uses the same pattern as the `export` command: load session → read JSONL files → deduplicate. The `totalArticles` count is pre-deduplication, `uniqueArticles` is post-deduplication.

## Implementation Steps

### Step 1: Implement `computeSummary()` function

- [x] Write test: `src/cli/commands/summary.test.ts`
  - Test: year distribution counts articles per year
  - Test: unknown/missing dates grouped under "unknown"
  - Test: database breakdown counts articles per source
  - Test: top journals sorted by count (descending), limited to top N
  - Test: identifier coverage counts DOI, PMID, and no-ID articles
  - Test: total vs unique article counts
- [x] Create stub: `src/cli/commands/summary.ts`
- [x] Verify test fails (Red)
- [x] Implement `computeSummary()`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Summary computation is correct for all statistics

### Step 2: Implement `formatSummary()` for human-readable output

- [x] Write test: `src/cli/commands/summary.test.ts`
  - Test: output includes session header, year distribution with bar chart, database breakdown with percentages, top journals, identifier coverage
  - Test: bar chart scales proportionally (longest bar = max width)
  - Test: year distribution is sorted chronologically
  - Test: numbers are right-aligned for readability
- [x] Verify test fails (Red)
- [x] Implement `formatSummary()`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Human-readable output is well-formatted

### Step 3: Implement `formatSummaryJson()` and register CLI command

- [x] Write test: `src/cli/commands/summary.test.ts`
  - Test: JSON output matches `SessionSummary` structure
- [x] Verify test fails (Red)
- [x] Implement `formatSummaryJson()`
- [x] Register `summary` command in `src/cli/index.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `search-hub summary <session> --json` produces valid JSON

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/summary.e2e.test.ts`
  - Test: summary command with real session data produces output
  - Test: `--json` flag produces parseable JSON
  - Test: statistics match actual session data
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run summary on a real session
- [ ] Acceptance: All tests pass, summary command works in real usage

## Notes

- Article data loading logic should be shared with the `export` command (extract to utility if not already shared)
- Top journals defaults to showing top 10; consider making this configurable in the future
- Bar chart width should adapt to terminal width if possible (or use fixed max width of 32 chars)
