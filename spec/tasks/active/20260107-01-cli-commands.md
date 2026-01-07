# Task: CLI Commands

## Purpose

Implement the CLI commands that allow users to interact with search-hub from the command line. This includes search execution, session management, result export, configuration management, and query utilities.

## Related Specs

- [spec/cli/commands.md](../../cli/commands.md) - Full command specifications
- [spec/cli/output-formats.md](../../cli/output-formats.md) - Output format specifications

## Related Source Files

- `src/cli/commands/` - Command implementations
- `src/cli/index.ts` - CLI entry point
- `src/providers/base/types.ts` - TranslatedQuery type (modification needed)

## Prerequisites

The following tasks are completed and available for use:
- Config System (Task 2)
- Query Parser & Validator (Task 3)
- Session Manager (Task 4)
- Provider Base & Rate Limiter (Task 5)
- Provider Session Resume (Task 5a)
- All Providers: PubMed, ERIC, arXiv, Scopus (Tasks 6-9)

## Existing Implementation

- `src/cli/commands/init.ts` - init command (already implemented)

## Dependencies to Add

```bash
npm install cli-progress
npm install -D @types/cli-progress
```

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

---

### Step 0: Make originalAst Optional in TranslatedQuery

Enable direct query string support for CLI `--query` option.

- [x] Step 0: Modify TranslatedQuery to allow direct queries
  - [x] Update type: `src/providers/base/types.ts`
    ```typescript
    export interface TranslatedQuery {
      native: string;
      originalAst?: QueryAST;  // Make optional
      provider: ProviderName;
    }
    ```
  - [x] Run `npm run typecheck` - verify no errors
  - [x] Run `npm test` - verify all tests pass
  - [x] Acceptance: Direct query without AST is type-valid

---

### Step 1: CLI Entry Point & Global Options

- [x] Step 1: Set up CLI framework with global options
  - [x] Write test: `src/cli/index.test.ts`
  - [x] Create/update: `src/cli/index.ts`
  - [x] Verify test fails (Red)
  - [x] Implement CLI entry point with commander.js
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: CLI responds to `--help`, `--version`, global options work

---

### Step 2: config Command

- [x] Step 2: Implement config view/edit command
  - [x] Write test: `src/cli/commands/config.test.ts`
  - [x] Create stub: `src/cli/commands/config.ts`
  - [x] Verify test fails (Red)
  - [x] Implement config command (view all, view key, set key)
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: `config`, `config <key>`, `config <key> <value>` work

---

### Step 3: query validate Command

- [x] Step 3: Implement query validate subcommand
  - [x] Write test: `src/cli/commands/query/validate.test.ts`
  - [x] Create stub: `src/cli/commands/query/validate.ts`
  - [x] Verify test fails (Red)
  - [x] Implement query validation using existing QueryParser
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: `query validate <file>` validates YAML and reports errors

---

### Step 4: query translate Command

- [x] Step 4: Implement query translate subcommand
  - [x] Write test: `src/cli/commands/query/translate.test.ts`
  - [x] Create stub: `src/cli/commands/query/translate.ts`
  - [x] Verify test fails (Red)
  - [x] Implement query translation display for each provider
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: `query translate <file> [--db <provider>]` shows translated queries

---

### Step 5: status Command

- [x] Step 5: Implement status command for session listing/details
  - [x] Write test: `src/cli/commands/status.test.ts`
  - [x] Create stub: `src/cli/commands/status.ts`
  - [x] Verify test fails (Red)
  - [x] Implement session list and session detail views
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: `status`, `status <session-id>`, `--json`, `--all` work

---

### Step 6: Progress Display Utility

- [x] Step 6: Implement multi-provider progress display with cli-progress
  - [x] Install: `npm install cli-progress && npm install -D @types/cli-progress`
  - [x] Write test: `src/cli/utils/progress.test.ts`
  - [x] Create: `src/cli/utils/progress.ts`
  - [x] Verify test fails (Red)
  - [x] Implement MultiProviderProgress class:
    ```typescript
    import { MultiBar, SingleBar, Presets } from 'cli-progress';

    export class MultiProviderProgress {
      private multibar: MultiBar;
      private bars: Map<string, SingleBar>;

      constructor(providers: string[]);
      update(provider: string, current: number, total: number, status: ProgressStatus): void;
      complete(provider: string): void;
      fail(provider: string, error: string): void;
      stop(): void;
    }
    ```
  - [x] Status icons: `⠋` (progress), `✓` (completed), `✗` (failed), `◼` (pending), `⚠` (partial)
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Progress bars display correctly for multiple providers

---

### Step 7: search Command

- [x] Step 7: Implement search command for executing searches
  - [x] Write test: `src/cli/commands/search.test.ts`
  - [x] Create stub: `src/cli/commands/search.ts`
  - [x] Verify test fails (Red)
  - [x] Implement search execution with MultiProviderProgress
  - [x] Support both query file and direct query modes:
    - `search <query.yaml>` - from YAML file
    - `search --db <provider> --query <string>` - direct query (uses optional originalAst)
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: `search <query.yaml>`, `--db`, `--query`, `--dry-run`, `--max-results` work

---

### Step 8: resume Command

- [x] Step 8: Implement resume command for continuing interrupted sessions
  - [x] Write test: `src/cli/commands/resume.test.ts`
  - [x] Create stub: `src/cli/commands/resume.ts`
  - [x] Verify test fails (Red)
  - [x] Implement session resume using Provider Session Resume functionality
  - [x] Use MultiProviderProgress for display
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: `resume <session-id>`, `--db`, `--retry-failed` work

---

### Step 9: export Command

- [x] Step 9: Implement export command for result output
  - [x] Write test: `src/cli/commands/export.test.ts`
  - [x] Create stub: `src/cli/commands/export.ts`
  - [x] Verify test fails (Red)
  - [x] Implement export in ids, json, jsonl formats
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: `export <session-id>`, `--format`, `--output`, `--db`, `--id-type` work

---

### Step 10: Integration & Exit Codes

- [x] Step 10: Wire all commands together and implement exit codes
  - [x] Write integration test: `src/cli/cli.integration.test.ts`
  - [x] Update `src/cli/index.ts` to register all commands
  - [x] Verify test fails (Red)
  - [x] Implement proper exit codes (0-5 per spec)
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Acceptance: All commands accessible, exit codes correct

---

## PR Review Fixes (PR #13)

The following steps address issues identified in PR review.

---

### Step 11: Wire Command Actions to Helper Functions

The command actions in `index.ts` are stub implementations. Wire them to actual helper functions.

- [x] Step 11: Implement real command actions
  - [x] 11.1: config command action
    - [x] Import helpers from `./commands/config.js`
    - [x] Call `viewConfig`, `viewConfigKey`, `setConfigKey` in action
    - [x] Test manually: `npx tsx src/cli/index.ts config`
  - [x] 11.2: query validate command action
    - [x] Import helpers from `./commands/query/validate.js`
    - [x] Call `validateQueryCommand`, `formatValidateResult` in action
    - [x] Test manually: `npx tsx src/cli/index.ts query validate <file>`
  - [x] 11.3: query translate command action
    - [x] Import helpers from `./commands/query/translate.js`
    - [x] Call `translateQueryCommand`, `formatTranslateResult` in action
    - [x] Test manually: `npx tsx src/cli/index.ts query translate <file>`
  - [x] 11.4: status command action
    - [x] Import helpers from `./commands/status.js`
    - [x] Call `listSessionsForDisplay`, `getSessionDetails`, `formatSessionList`, `formatSessionDetails` in action
    - [x] Test manually: `npx tsx src/cli/index.ts status`
  - [x] 11.5: search command action
    - [x] Import helpers from `./commands/search.js`
    - [x] Call `parseSearchOptions`, `validateSearchInput`, `formatDryRunOutput` in action
    - [x] Non-dry-run shows message (full search execution deferred)
    - [x] Test manually: `npx tsx src/cli/index.ts search --dry-run <file>`
  - [x] 11.6: resume command action
    - [x] Import helpers from `./commands/resume.js`
    - [x] Call `parseResumeOptions`, `validateResumeInput`, `getResumableProvidersForCommand` in action
    - [x] Test manually: `npx tsx src/cli/index.ts resume <session-id>`
  - [x] 11.7: export command action
    - [x] Import helpers from `./commands/export.js`
    - [x] Call `parseExportOptions`, `validateExportInput`, `formatIds/Json/Jsonl` in action
    - [x] Test manually: `npx tsx src/cli/index.ts export <session-id>`
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Run `npm test`
  - [x] Acceptance: Each command executes real logic, not just console.log

---

### Step 12: Verify Session Manager Dependencies

Confirm `loadSession` and `getResumableProviders` exist in session manager.

- [x] Step 12: Verify or implement session manager functions
  - [x] Check `src/session/manager.ts` for `loadSession` function (line 152)
  - [x] Check `src/session/manager.ts` for `getResumableProviders` function (line 293)
  - [x] Functions exist, no implementation needed
  - [x] Imports in `resume.ts` and `status.ts` work correctly
  - [x] Run `npm run typecheck`
  - [x] Acceptance: `resume.ts` compiles without import errors

---

### Step 13: Add Runtime Validation for ProviderName

Replace type assertions with runtime validation.

- [x] Step 13: Add ProviderName validation
  - [x] Create validation utility: `src/cli/utils/validation.ts`
  - [x] Write test: `src/cli/utils/validation.test.ts` (11 tests)
  - [x] Update `search.ts` to use `parseProviderNames`
  - [x] Update `resume.ts` to use `parseProviderNames`
  - [x] Update `export.ts` to use `parseProviderNames`
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Run `npm test`
  - [x] Acceptance: Invalid provider names throw descriptive errors

---

### Step 14: Standardize Error Messages

Ensure consistent error message formatting.

- [x] Step 14: Standardize error messages
  - [x] Review all error messages in command files
  - [x] Verified: no trailing periods (consistent style)
  - [x] Verified: consistent capitalization (sentence case)
  - [x] Run `npm run lint`
  - [x] Acceptance: Error messages follow consistent style

---

## Code Quality Fixes (PR #13 Review Round 2)

The following steps address code quality issues identified in the second review.

---

### Step 15: Clarify VALID_PROVIDERS Intent

Document that `wos` and `embase` are planned but not yet implemented.

- [x] Step 15: Add documentation for provider availability
  - [x] Update `src/cli/utils/validation.ts`:
    - [x] Add comment explaining `wos` and `embase` are defined in types but not yet implemented
    - [x] Keep VALID_PROVIDERS as the runtime-available providers
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Intent is clear in code comments

---

### Step 16: Consolidate ProviderName Type Definitions

Remove duplicate ProviderName definitions and use a single source of truth.

- [x] Step 16: Consolidate ProviderName type
  - [x] Keep `src/providers/base/types.ts` as the authoritative source
  - [x] Update `src/session/types.ts`:
    - [x] Remove local ProviderName definition
    - [x] Import and re-export from '../providers/base/types.js'
  - [x] Update `src/query/types.ts`:
    - [x] Remove local ProviderName definition
    - [x] Import and re-export from '../providers/base/types.js'
  - [x] Run `npm run typecheck` - verify no errors
  - [x] Run `npm test` - verify all tests pass
  - [x] Acceptance: Single definition, re-exported from other modules

---

### Step 17: Extract Sessions Directory Helper

Remove code duplication for getting sessions directory.

- [x] Step 17: Create getSessionsDir helper
  - [x] Create helper in `src/cli/utils/sessions-dir.ts`
  - [x] Write test: `src/cli/utils/sessions-dir.test.ts` (5 tests)
  - [x] Update `src/cli/index.ts`:
    - [x] Import `getSessionsDir`
    - [x] Replace 3 duplicated IIFE patterns with `getSessionsDir(globalOpts)`
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Run `npm test`
  - [x] Acceptance: No duplicated code for sessions directory resolution

---

### Step 18: Fix Direct Execution Detection

Use import.meta.url for reliable CLI entry point detection.

- [x] Step 18: Fix main execution detection
  - [x] Update `src/cli/index.ts`:
    - [x] Import `fileURLToPath` from 'node:url'
    - [x] Use `import.meta.url` for reliable detection
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Run `npm test`
  - [x] Acceptance: CLI works correctly when executed directly or via symlink

---

### Step 19: Implement Config Save Functionality

Add ability to persist config changes to file.

- [x] Step 19: Implement config save
  - [x] Add `saveConfig` function to `src/config/loader.ts`
  - [x] Write tests for `saveConfig` in `src/config/loader.test.ts` (4 tests)
  - [x] Export `saveConfig` from `src/config/index.ts`
  - [x] Update `src/cli/index.ts` config command:
    - [x] After `setConfigKey`, call `saveConfig` to persist changes
    - [x] Handle file write errors appropriately
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Run `npm test`
  - [x] Acceptance: `config <key> <value>` persists changes to config file

---

### Step 20: Implement Search Execution

Implement actual search execution (non-dry-run mode).

- [x] Step 20: Implement search execution
  - [x] Create `src/cli/commands/search-executor.ts`:
    ```typescript
    import { MultiProviderProgress } from '../utils/progress.js';
    import type { SearchCommandOptions } from './search.js';
    import type { ProviderName } from '../../providers/base/types.js';
    import type { Config } from '../../config/index.js';

    export interface SearchExecutionResult {
      success: boolean;
      sessionId?: string;
      results?: Record<ProviderName, { hits: number; retrieved: number }>;
      error?: string;
    }

    export async function executeSearch(
      options: SearchCommandOptions,
      sessionsDir: string,
      config: Config
    ): Promise<SearchExecutionResult>;
    ```
  - [x] Write tests: `src/cli/commands/search-executor.test.ts`
  - [x] Implementation steps:
    - [x] Create session using `createSession`
    - [x] Initialize providers based on config
    - [x] Create `MultiProviderProgress` instance
    - [x] Execute search for each provider with progress updates
    - [x] Update session status on completion/failure
  - [x] Update `src/cli/index.ts` search command:
    - [x] Remove "not yet implemented" message
    - [x] Call `executeSearch` for non-dry-run mode
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Run `npm test`
  - [x] Acceptance: `search <query.yaml>` executes actual searches

---

### Step 21: Implement Resume Execution

Implement actual resume execution.

- [x] Step 21: Implement resume execution
  - [x] Create `src/cli/commands/resume-executor.ts`:
    ```typescript
    import type { ResumeCommandOptions } from './resume.js';
    import type { Config } from '../../config/index.js';

    export interface ResumeExecutionResult {
      success: boolean;
      resumed: number;
      results?: Record<string, { hits: number; retrieved: number }>;
      error?: string;
    }

    export async function executeResume(
      options: ResumeCommandOptions,
      sessionsDir: string,
      config: Config
    ): Promise<ResumeExecutionResult>;
    ```
  - [x] Write tests: `src/cli/commands/resume-executor.test.ts`
  - [x] Implementation steps:
    - [x] Load session using `loadSession`
    - [x] Get resumable providers
    - [x] Initialize providers and resume from saved state
    - [x] Use `MultiProviderProgress` for display
    - [x] Update session status on completion
  - [x] Update `src/cli/index.ts` resume command:
    - [x] Remove "not yet implemented" message
    - [x] Call `executeResume`
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Run `npm test`
  - [x] Acceptance: `resume <session-id>` continues interrupted sessions

---

### Step 22: CLI Integration Tests

Add comprehensive integration tests for CLI commands.

- [ ] Step 22: Implement CLI integration tests
  - [ ] Create `src/cli/cli-execution.integration.test.ts`:
    ```typescript
    import { describe, it, expect, beforeEach, afterEach } from 'vitest';
    import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { createProgram } from './index.js';

    describe('CLI Execution Integration', () => {
      let tempDir: string;
      let sessionsDir: string;
      let configPath: string;

      beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'search-hub-test-'));
        sessionsDir = join(tempDir, 'sessions');
        configPath = join(tempDir, 'config.toml');
        await mkdir(sessionsDir, { recursive: true });
      });

      afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
      });

      // Test cases...
    });
    ```
  - [ ] Test cases to implement:
    - [ ] `config` command: view all, view key, set key with persistence
    - [ ] `query validate` command: valid file, invalid file, non-existent file
    - [ ] `query translate` command: translate all providers, translate single provider
    - [ ] `status` command: empty sessions, list sessions, session details
    - [ ] `search --dry-run` command: from file, direct query
    - [ ] `search` command: actual execution with mock provider
    - [ ] `resume` command: resume interrupted session
    - [ ] `export` command: ids format, json format, jsonl format
  - [ ] Test exit codes:
    - [ ] SUCCESS (0) for successful operations
    - [ ] CONFIG_ERROR (2) for config issues
    - [ ] QUERY_ERROR (3) for invalid queries
    - [ ] SESSION_ERROR (5) for session issues
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Run `npm test`
  - [ ] Acceptance: All CLI commands have execution integration tests

---

## Exit Codes Reference

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Config error |
| 3 | Query validation error |
| 4 | Network/API error |
| 5 | Session error |

## Progress Display Reference

Using `cli-progress` MultiBar:

```
⠋ PubMed    [████████████░░░░░░░░] 600/1200
✓ ERIC      [████████████████████]  200/200  completed
⠋ arXiv     [██░░░░░░░░░░░░░░░░░░]  50/500
◼ Scopus    waiting...
```

| Icon | Status | Meaning |
|------|--------|---------|
| ⠋ | in_progress | Currently fetching |
| ✓ | completed | All results retrieved |
| ✗ | failed | Error occurred |
| ◼ | pending | Waiting to start |
| ⚠ | partial | Partially completed |

### cli-progress Configuration

```typescript
import { MultiBar, Presets } from 'cli-progress';

const multibar = new MultiBar({
  clearOnComplete: false,
  hideCursor: true,
  format: '{icon} {provider} [{bar}] {value}/{total} {status}',
  barCompleteChar: '█',
  barIncompleteChar: '░',
}, Presets.shades_classic);
```

## Notes

- The `register` command is part of Task 11 (Reference Manager Integration)
- Use commander.js for CLI framework (already in dependencies)
- Use cli-progress for multi-provider progress display
- All commands should respect `--quiet`, `--verbose`, `--no-color` options
- Test files are co-located with source files (`*.test.ts`)
- Direct query mode (`--db <provider> --query <string>`) is for testing purposes
