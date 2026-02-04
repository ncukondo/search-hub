# Task: Improve CLI Discoverability

## Purpose

Users (both humans and AI agents) struggle to understand the recommended workflow when first using search-hub. The `--query` option appears prominent in help, leading users to start with direct queries instead of the recommended YAML-based workflow. Additionally, the powerful `diff` command for query refinement is not discoverable from the main help.

This task improves help messages to guide users toward the optimal workflow, including query refinement with `diff`.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - CLI command definitions

## Related Source Files

- `src/cli/index.ts` - Main CLI entry point
- `src/cli/commands/search.ts` - Search command with --query option
- `src/cli/commands/query.ts` - Query subcommands

## Implementation Steps

### Step 1: Add Quick Start and Query Refinement sections to main help

- [x] Step 1: Add recommended workflow including diff to main CLI help
  - [x] Write test: `src/cli/index.test.ts` - verify help includes "Quick Start" and "Query Refinement" sections
  - [x] Implement: Update help output in `src/cli/index.ts`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `search-hub --help` shows both workflows

Expected output:
```
Quick Start:
  $ search-hub query init -o search.yaml        # Create query template
  $ search-hub search search.yaml --count-only  # Check hit counts
  $ search-hub search search.yaml               # Execute search
  $ search-hub results <session>                # Review titles

Query Refinement (iterate until satisfied):
  $ cp search.yaml search-v2.yaml               # Create variant
  $ (edit search-v2.yaml)                       # Adjust terms
  $ search-hub search search-v2.yaml            # Search again
  $ search-hub diff <old> <new> --show removed  # Compare results
```

### Step 2: Improve --query option description

- [ ] Step 2: Clarify that --query requires database-specific syntax
  - [ ] Write test: `src/cli/commands/search.test.ts` - verify help text for --query
  - [ ] Implement: Update option description in `src/cli/commands/search.ts`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `search-hub search --help` shows warning about database-specific syntax

Expected description:
```
--query <string>   direct query in database-native syntax (advanced usage,
                   requires --db; prefer YAML files for cross-database searches)
```

### Step 3: Reorder commands to emphasize query first

- [ ] Step 3: List `query` command before `search` in help output
  - [ ] Write test: Verify command order in help
  - [ ] Implement: Reorder command registration or use custom help formatter
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `query` appears before `search` in command list

### Step 4: Add tip after search completion

- [ ] Step 4: Show refinement tip after successful search
  - [ ] Write test: `src/cli/commands/search.test.ts` - verify tip is shown after search
  - [ ] Implement: Add tip message after search completion in `src/cli/commands/search.ts`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Search completion shows tip about diff

Expected output after search:
```
Search completed. Session: 20260204_query_abc123
  pubmed: 50 results

Tip: To compare with another query version, use:
     search-hub diff <other-session> 20260204_query_abc123
```

### Step 5: Add tip after count-only results

- [ ] Step 5: Show refinement tip after --count-only
  - [ ] Write test: `src/cli/commands/search.test.ts` - verify tip after count-only
  - [ ] Implement: Add tip message after count-only results
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Count-only results show tip about workflow

Expected output after --count-only:
```
Query: search.yaml (count only)

  pubmed:    156 hits
  ─────────────────────
  total:     156 hits (before deduplication)

Tip: Run without --count-only to retrieve articles, then use 'diff' to compare query versions.
```

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/cli-help.e2e.test.ts`
  - Test actual CLI help output contains Quick Start and Query Refinement
  - Test search --help shows improved --query description
  - Test search completion shows tip
  - Test count-only shows tip
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Manual verification: Run `search-hub --help` and verify readability
- [ ] Acceptance: All tests pass, help messages and tips guide users to optimal workflow

## Notes

- This is primarily a documentation/UX improvement
- Tips should be concise and not overwhelming
- Consider adding `--quiet` flag to suppress tips for scripting use cases
- AI agents will see tips immediately after command execution, making diff discoverable
