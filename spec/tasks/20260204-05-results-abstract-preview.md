# Task: Add Abstract Preview to Results Command

## Purpose

When evaluating query quality, users need to see more than just article titles. Adding an option to display abstracts (or a preview) helps users quickly assess whether their search is returning relevant results without needing to export and open in another tool.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - CLI command definitions

## Related Source Files

- `src/cli/commands/results.ts` - Results listing command
- `src/cli/commands/results.test.ts` - Unit tests
- `src/session/reader.ts` - Session data reader

## Implementation Steps

### Step 1: Add --abstract flag to results command

- [x] Step 1: Add command-line option for abstract display
  - [x] Write test: `src/cli/commands/results.test.ts` - test --abstract flag parsing
  - [x] Implement: Add `--abstract` option to results command
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `search-hub results --help` shows --abstract option

### Step 2: Implement abstract display formatting

- [ ] Step 2: Format and display abstracts with titles
  - [ ] Write test: Test output includes abstract text
  - [ ] Implement: Fetch and display abstract from session data
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Abstracts display below titles when flag is set

Expected output:
```
1. [2025] Article Title Here
   Journal Name
   DOI: 10.1234/example

   Abstract: This study examines the use of large language models
   for evaluating narrative feedback quality in medical education...

2. [2025] Another Article Title
   ...
```

### Step 3: Add --abstract-length option for truncation

- [ ] Step 3: Allow users to control abstract length
  - [ ] Write test: Test truncation at specified length
  - [ ] Implement: Add `--abstract-length <n>` option (default: 300 characters)
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Abstracts truncate at specified length with "..."

### Step 4: Handle missing abstracts gracefully

- [ ] Step 4: Display placeholder when abstract is unavailable
  - [ ] Write test: Test output when abstract is null/empty
  - [ ] Implement: Show "(No abstract available)" for missing abstracts
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Missing abstracts show clear placeholder

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/results.e2e.test.ts`
  - Test with real session data
  - Verify abstract display formatting
  - Test truncation behavior
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Manual verification: Run with real search session
- [ ] Acceptance: Abstracts display correctly and help evaluate query quality

## Notes

- Consider terminal width for formatting
- Abstract text may contain special characters - handle encoding properly
- This feature helps with query refinement workflow (complements diff command)
