# Task: Fulltext Init and Sync Commands

## Purpose

Implement `fulltext init` and `fulltext sync` commands for manual fulltext management workflow:
- `init`: Create directories for included articles with meta.json and README
- `sync`: Detect and register manually added files (fulltext.pdf, fulltext.md)

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - CLI commands section

## Related Source Files

- `src/fulltext/types.ts` - From Task 59
- `src/fulltext/meta.ts` - From Task 59
- `src/cli/commands/fulltext/init.ts` (new)
- `src/cli/commands/fulltext/sync.ts` (new)
- `src/cli/commands/fulltext/index.ts` (new) - Command registration

## Dependencies

- Task 59 (Fulltext Foundation) must be completed first

## Implementation Steps

### Step 1: Fulltext Init Core Logic

- [x] Write test: `src/cli/commands/fulltext/init.test.ts`
  - Test: Creates directories only for `finalDecision=include` articles
  - Test: Creates meta.json with correct identifiers
  - Test: Creates README.md with title, DOI, URLs
  - Test: Skips existing directories (idempotent)
  - Test: Updates reviews.yaml with fulltext references
  - Test: --dry-run shows what would be created
- [x] Create stub: `src/cli/commands/fulltext/init.ts`
- [x] Verify test fails (Red)
- [x] Implement `executeFulltextInit()`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Directories created with correct content

### Step 2: Fulltext Sync Core Logic

- [x] Write test: `src/cli/commands/fulltext/sync.test.ts`
  - Test: Detects new fulltext.pdf in directory
  - Test: Detects new fulltext.md in directory
  - Test: Detects new fulltext.xml in directory
  - Test: Updates meta.json with file info (source: "manual")
  - Test: Updates reviews.yaml fulltext.hasFiles
  - Test: Ignores already-synced files
  - Test: --dry-run shows what would be synced
- [x] Create stub: `src/cli/commands/fulltext/sync.ts`
- [x] Verify test fails (Red)
- [x] Implement `executeFulltextSync()`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Manual files detected and registered

### Step 3: CLI Command Registration

- [x] Create `src/cli/commands/fulltext/index.ts`
  - Register `fulltext` command group
  - Register `fulltext init` subcommand
  - Register `fulltext sync` subcommand
- [x] Update `src/cli/index.ts` to include fulltext commands
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Commands available via CLI

### Step 4: Output Formatting

- [ ] Write test for output formatting
  - Test: Init shows created directories with DOI/PMID
  - Test: Init shows "Next steps" guidance
  - Test: Sync shows found files with sizes
  - Test: Sync shows summary (X files synced, Y articles updated)
- [ ] Implement `formatInitOutput()` and `formatSyncOutput()`
- [ ] Verify test passes
- [ ] Acceptance: User-friendly output

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/fulltext/init-sync.e2e.test.ts`
  - Test: Full workflow: init → manual file copy → sync
  - Test: reviews.yaml updated correctly
  - Test: Idempotent (re-running init/sync is safe)
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - Run `fulltext init` on real session
  - Copy PDF to directory
  - Run `fulltext sync`
  - Verify meta.json and index updated
- [ ] Acceptance: All tests pass, feature works in real usage

## CLI Interface

```bash
# Init
search-hub fulltext init <session-id>
search-hub fulltext init <session-id> --dry-run

# Sync
search-hub fulltext sync <session-id>
search-hub fulltext sync <session-id> --dry-run
```

## Notes

- Init targets only `finalDecision=include` articles
- Sync scans all existing directories in fulltext/
- Both commands are idempotent (safe to re-run)
- README includes download URLs if available from OA check (or just DOI link)
