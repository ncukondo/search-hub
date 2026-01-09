# Task: E2E Tests & Polish

## Purpose

Final integration testing and polish before release. Ensure all CLI commands work correctly in real-world scenarios, error messages are helpful, and the tool provides a good user experience.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - All CLI commands
- [spec/overview.md](../overview.md) - Project scope and features

## Related Source Files

- `src/cli/index.ts` - CLI entry point
- `src/cli/e2e.test.ts` - Main E2E test file (to be created)
- `src/cli/commands/*.ts` - Individual commands

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

---

### Step 1: E2E Test Infrastructure Setup

- [ ] Create test helpers: `src/cli/e2e-helpers.ts`
  - Helper to create temp directories
  - Helper to create test query files
  - Helper to create test session data
  - Helper to execute CLI commands as subprocess
  - Helper to clean up test artifacts
- [ ] Create fixture data: `src/cli/fixtures/` (if needed)
  - Sample query YAML files
  - Sample config files
- [ ] Verify infrastructure works with simple test
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Test helpers are reusable across all E2E tests

```typescript
// Key helpers in src/cli/e2e-helpers.ts:
async function createTempDir(): Promise<string>
async function execCli(args: string[], options?: ExecOptions): Promise<{ stdout: string; stderr: string; exitCode: number }>
async function createQueryFile(tempDir: string, query: QueryDSL): Promise<string>
async function createConfig(tempDir: string, config: Partial<Config>): Promise<string>
```

---

### Step 2: E2E Tests for `search-hub init`

- [ ] Write test: `src/cli/commands/init.e2e.test.ts`
  - Test creates config file at default location
  - Test creates config file at custom location with `--config`
  - Test `--force` overwrites existing config
  - Test error when config exists without `--force`
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub init` works in all scenarios

---

### Step 3: E2E Tests for `search-hub config`

- [ ] Write test: `src/cli/commands/config.e2e.test.ts`
  - Test shows full config
  - Test shows specific key
  - Test sets value
  - Test error for invalid key
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub config` works correctly

---

### Step 4: E2E Tests for `search-hub query validate`

- [ ] Write test: `src/cli/commands/query/validate.e2e.test.ts`
  - Test valid query file passes
  - Test invalid query file shows errors
  - Test missing file shows error
  - Test helpful error messages for common mistakes
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Query validation provides useful feedback

---

### Step 5: E2E Tests for `search-hub query translate`

- [ ] Write test: `src/cli/commands/query/translate.e2e.test.ts`
  - Test translates to all databases
  - Test `--db` filters to specific database
  - Test shows native syntax for each database
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Query translation shows correct native syntax

---

### Step 6: E2E Tests for `search-hub search` (Dry Run)

- [ ] Write test: `src/cli/commands/search.e2e.test.ts`
  - Test `--dry-run` shows translated queries
  - Test `--dry-run` does not create session
  - Test `--dry-run` does not make API calls
  - Test `--db` filters databases in dry run
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Dry run works without side effects

---

### Step 7: E2E Tests for `search-hub search` (Live - Mock API)

- [ ] Add to test: `src/cli/commands/search.e2e.test.ts`
  - Test creates session directory
  - Test saves results to session
  - Test handles network errors gracefully
  - Test continues with other DBs when one fails
  - Test `--max-results` limits results
  - Test progress output is shown
  - Mock external APIs using msw or similar
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Search command works with mocked APIs

---

### Step 8: E2E Tests for `search-hub status`

- [ ] Write test: `src/cli/commands/status.e2e.test.ts`
  - Test lists all sessions
  - Test shows specific session details
  - Test `--json` outputs valid JSON
  - Test `--all` includes completed sessions
  - Test shows helpful message when no sessions exist
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Status command provides useful information

---

### Step 9: E2E Tests for `search-hub resume`

- [ ] Write test: `src/cli/commands/resume.e2e.test.ts`
  - Test resumes interrupted session
  - Test `--db` resumes specific database only
  - Test `--retry-failed` retries failed databases
  - Test error for non-existent session
  - Test error for already-completed session (unless --retry-failed)
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Resume command works correctly

---

### Step 10: E2E Tests for `search-hub export`

- [ ] Write test: `src/cli/commands/export.e2e.test.ts`
  - Test `--format ids` exports IDs only
  - Test `--format json` exports full JSON
  - Test `--format jsonl` exports JSON lines
  - Test `--id-type doi` filters to DOIs
  - Test `--id-type pmid` filters to PMIDs
  - Test `--output` writes to file
  - Test `--db` filters to specific database
  - Test stdout output when no `--output`
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Export command produces correct output

---

### Step 11: E2E Tests for `search-hub register`

Note: Basic E2E tests already exist in `src/integration/register.e2e.test.ts`. This step adds CLI-level scenarios if needed.

- [ ] Review existing E2E tests in `src/integration/register.e2e.test.ts`
- [ ] Add additional CLI scenarios to `src/cli/commands/register.e2e.test.ts` if needed:
  - Test `--db` filters to specific database
  - Test error when session not found
  - Test prompts to install ref when not available
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Register command works in all scenarios

---

### Step 12: CLI Polish - Help Messages

- [ ] Review all `--help` output for clarity
- [ ] Ensure consistent option naming across commands
- [ ] Add examples to help text where useful
- [ ] Verify version output (`--version`) is correct
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Help is clear and consistent

---

### Step 13: CLI Polish - Error Messages

- [ ] Write test: `src/cli/error-messages.e2e.test.ts`
  - Test error messages include actionable guidance
  - Test exit codes match specification
  - Test network errors show retry hints
  - Test config errors show config path
  - Test validation errors show line numbers
- [ ] Review and improve error messages
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Errors help users fix problems

---

### Step 14: CLI Polish - Progress & Output

- [ ] Verify progress bars display correctly
- [ ] Verify `--quiet` suppresses non-error output
- [ ] Verify `--verbose` shows additional debug info
- [ ] Verify `--no-color` disables ANSI colors
- [ ] Test output in non-TTY environment (piped output)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Output adapts to terminal capabilities

---

### Step 15: Full Workflow E2E Test

- [ ] Write test: `src/cli/workflow.e2e.test.ts`
  - Complete user workflow from init to register:
    1. `search-hub init`
    2. `search-hub query validate`
    3. `search-hub search` (with mocked API)
    4. `search-hub status`
    5. `search-hub export`
    6. `search-hub register --dry-run`
  - Verify all commands work together
  - Verify session data flows correctly between commands
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Complete workflow succeeds

---

### Step 16: Final Verification

- [ ] Run full test suite: `npm test`
- [ ] Run linter: `npm run lint`
- [ ] Run typecheck: `npm run typecheck`
- [ ] Manual testing of complete workflow
- [ ] Verify all exit codes per specification
- [ ] Update any outdated documentation
- [ ] Acceptance: All tests pass, tool ready for use

## TDD Cycle Reference

```
┌─────────────────────────────────────────────────────┐
│  1. Write Test (Red)                                │
│     - Write test that describes expected behavior   │
│     - Run test → should FAIL                        │
├─────────────────────────────────────────────────────┤
│  2. Implement (Green)                               │
│     - Write minimal code to pass test               │
│     - Run test → should PASS                        │
├─────────────────────────────────────────────────────┤
│  3. Refactor                                        │
│     - npm run lint                                  │
│     - npm run typecheck                             │
│     - Clean up code if needed                       │
│     - Run test → should still PASS                  │
└─────────────────────────────────────────────────────┘
```

## Notes

- Test files are co-located with source files (`*.e2e.test.ts` next to `*.ts`)
- E2E tests use real file I/O with temp directories
- Mock external APIs only (PubMed, ERIC, arXiv, Scopus) - not internal code
- Test in CI-like environment (non-interactive, no TTY)
- E2E tests may be slower - mark with appropriate timeout
- Focus on user-facing behavior, not implementation details
