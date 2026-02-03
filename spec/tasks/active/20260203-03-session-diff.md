# Task: Session Diff Command

## Purpose

During iterative query refinement, users need to understand the effect of query changes by comparing results between sessions. Currently there is no way to see which articles were added or removed between two search iterations without manually exporting both and writing comparison scripts.

This task adds a `diff` command that compares two sessions and shows added, removed, and common articles.

**Pain point observed:** Across 6 query iterations, it was impossible to determine whether tightening the query removed relevant articles or only noise. A diff view would make this judgment immediate.

## Related Specs

- [spec/cli](../cli/) - CLI command structure
- [spec/models](../models/) - Article data model

## Related Source Files

- `src/cli/index.ts` - Command registration
- `src/cli/commands/export.ts` - Article loading and deduplication logic (reuse)
- `src/cli/commands/diff.ts` - New file
- `src/cli/commands/diff.test.ts` - New test file

## Design

### Command Interface

```bash
# Compare two sessions
search-hub diff <session-id-1> <session-id-2>

# Show only specific sections
search-hub diff <session-id-1> <session-id-2> --show added
search-hub diff <session-id-1> <session-id-2> --show removed
search-hub diff <session-id-1> <session-id-2> --show common

# JSON output for scripting
search-hub diff <session-id-1> <session-id-2> --json
```

### Default Output Format

```
Diff: wba-genai-v5 → wba-genai-v6
  Session 1: 44 articles (wba-genai-v5)
  Session 2: 28 articles (wba-genai-v6)

  Common:  25 articles
  Added:    3 articles (in v6 but not v5)
  Removed: 19 articles (in v5 but not v6)

Added (+3):
  + [2026] Bytes versus brains: AI-generated feedback and human tutor feedback...
  + [2025] Enhancing the Objective Structured Clinical Examination Using AI...
  + [2024] Performance of ChatGPT on Brazilian Radiology annual resident evaluation...

Removed (-19):
  - [2025] A Generative AI Virtual Teaching Assistant for Graduate Nursing...
  - [2025] Effects of artificial intelligence based physiotherapy educational...
  ...
```

### Matching Logic

Articles are matched by identifiers (same deduplication keys used in export):
1. DOI (case-insensitive)
2. PMID
3. arXiv ID
4. Scopus ID
5. ERIC ID

Two articles are considered the same if they share any identifier.

## Implementation Steps

### Step 1: Core diff computation

- [x] Write test: `src/cli/commands/diff.test.ts`
  - Test `computeDiff(articles1, articles2)` returns correct added/removed/common sets
  - Test matching by DOI, PMID, and other identifiers
  - Test edge cases: empty sessions, no overlap, full overlap
- [x] Create stub: `src/cli/commands/diff.ts`
- [x] Verify test fails (Red)
- [x] Implement `computeDiff()` using identifier-based matching
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `computeDiff()` correctly classifies articles as added/removed/common

### Step 2: Format diff output and register CLI command

- [ ] Write test: output formatting and CLI option parsing
- [ ] Implement `formatDiff()` for human-readable output and `formatDiffJson()` for JSON
- [ ] Register `diff` command in `src/cli/index.ts` with session loading
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub diff <s1> <s2>` produces correctly formatted output

### Step 3: --show filter option

- [ ] Write test: filtering to show only added/removed/common
- [ ] Implement `--show` option
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `--show added` only displays added articles

### Final Step: E2E Integration Tests

- [ ] Write E2E test: create two sessions with overlapping results, run diff
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test with real sessions from query iteration
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Reuse identifier matching logic from `deduplicateArticles()` in export.ts
- Consider extracting the identifier-matching logic into a shared utility
- The `--show` option enables quick checks like "what did I lose by tightening the query?"
