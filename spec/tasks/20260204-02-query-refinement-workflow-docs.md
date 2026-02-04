# Task: Document Query Refinement Workflow with Diff

## Purpose

Users need guidance on how to iteratively refine their search queries. The existing `diff` command is powerful but its use case for query development is not documented. This task adds documentation showing how to use `diff` to compare query versions and evaluate refinement quality.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - CLI command definitions

## Related Source Files

- `src/cli/commands/search.ts` - Search command
- `src/cli/commands/diff.ts` - Diff command
- `README.md` - Project documentation

## Implementation Steps

### Step 1: Add workflow documentation to search --help

- [x] Step 1: Add "Query Refinement" section to search command help
  - [x] Write test: `src/cli/cli-help.e2e.test.ts` - verify help includes workflow hint
  - [x] Implement: Add epilog or extended help to search command
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `search-hub search --help` mentions diff for query refinement

### Step 2: Add workflow documentation to diff --help

- [x] Step 2: Add practical examples to diff command help
  - [x] Write test: `src/cli/cli-help.e2e.test.ts` - verify help includes query refinement example
  - [x] Implement: Expand examples section in diff command
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `search-hub diff --help` shows query comparison workflow

Expected addition to diff help:
```
Query Refinement Workflow:
  1. Search with broad query:    search-hub search v1.yaml --max-results 100
  2. Create refined query:       cp v1.yaml v2.yaml && edit v2.yaml
  3. Search with refined query:  search-hub search v2.yaml --max-results 100
  4. Compare results:            search-hub diff <session-v1> <session-v2> --show removed
  5. Review excluded articles to verify refinement quality
```

### Step 3: Update README with workflow guide

- [x] Step 3: Add "Query Development" section to README
  - [x] Review current README structure
  - [x] Add comprehensive workflow guide with examples
  - [x] Include tips for effective query refinement
  - [x] Acceptance: README documents the full query development workflow

### Final Step: Manual Verification

- [ ] Verify help messages are clear and actionable
- [ ] Test the documented workflow manually with a real search
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: Documentation guides users through effective query refinement

## Notes

- This is primarily a documentation task
- Focus on practical, actionable guidance
- The workflow leverages existing functionality (no new features needed)
