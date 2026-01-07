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

- [ ] Step 11: Implement real command actions
  - [ ] 11.1: config command action
    - [ ] Import helpers from `./commands/config.js`
    - [ ] Call `getConfigValue`, `setConfigValue`, `formatConfigOutput` in action
    - [ ] Test manually: `npx tsx src/cli/index.ts config`
  - [ ] 11.2: query validate command action
    - [ ] Import helpers from `./commands/query/validate.js`
    - [ ] Call `validateQueryFile`, `formatValidationResult` in action
    - [ ] Test manually: `npx tsx src/cli/index.ts query validate <file>`
  - [ ] 11.3: query translate command action
    - [ ] Import helpers from `./commands/query/translate.js`
    - [ ] Call `translateQueryFile`, `formatTranslationOutput` in action
    - [ ] Test manually: `npx tsx src/cli/index.ts query translate <file>`
  - [ ] 11.4: status command action
    - [ ] Import helpers from `./commands/status.js`
    - [ ] Call `listSessionsForDisplay`, `getSessionDetails`, `formatSessionList`, `formatSessionDetails` in action
    - [ ] Test manually: `npx tsx src/cli/index.ts status`
  - [ ] 11.5: search command action
    - [ ] Import helpers from `./commands/search.js`
    - [ ] Call `parseSearchOptions`, `validateSearchInput`, `formatDryRunOutput` in action
    - [ ] For non-dry-run, implement actual search execution using providers
    - [ ] Test manually: `npx tsx src/cli/index.ts search --dry-run <file>`
  - [ ] 11.6: resume command action
    - [ ] Import helpers from `./commands/resume.js`
    - [ ] Call `parseResumeOptions`, `validateResumeInput`, `getResumableStatus` in action
    - [ ] Test manually: `npx tsx src/cli/index.ts resume <session-id>`
  - [ ] 11.7: export command action
    - [ ] Import helpers from `./commands/export.js`
    - [ ] Call `parseExportOptions`, `validateExportInput`, `formatExportOutput` in action
    - [ ] Test manually: `npx tsx src/cli/index.ts export <session-id>`
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Run `npm test`
  - [ ] Acceptance: Each command executes real logic, not just console.log

---

### Step 12: Verify Session Manager Dependencies

Confirm `loadSession` and `getResumableProviders` exist in session manager.

- [ ] Step 12: Verify or implement session manager functions
  - [ ] Check `src/session/manager.ts` for `loadSession` function
  - [ ] Check `src/session/manager.ts` for `getResumableProviders` function
  - [ ] If missing, implement them following existing patterns
  - [ ] Update imports in `resume.ts` if function names differ
  - [ ] Run `npm run typecheck`
  - [ ] Acceptance: `resume.ts` compiles without import errors

---

### Step 13: Add Runtime Validation for ProviderName

Replace type assertions with runtime validation.

- [ ] Step 13: Add ProviderName validation
  - [ ] Create validation utility: `src/cli/utils/validation.ts`
    ```typescript
    import type { ProviderName } from '../../providers/base/types.js';

    const VALID_PROVIDERS: readonly ProviderName[] = ['pubmed', 'eric', 'arxiv', 'scopus'];

    export function isValidProviderName(value: string): value is ProviderName {
      return VALID_PROVIDERS.includes(value as ProviderName);
    }

    export function parseProviderNames(input: string): ProviderName[] {
      const names = input.split(',').map(p => p.trim().toLowerCase());
      const invalid = names.filter(n => !isValidProviderName(n));
      if (invalid.length > 0) {
        throw new Error(`Invalid provider(s): ${invalid.join(', ')}. Valid: ${VALID_PROVIDERS.join(', ')}`);
      }
      return names as ProviderName[];
    }
    ```
  - [ ] Write test: `src/cli/utils/validation.test.ts`
  - [ ] Update `search.ts` to use `parseProviderNames`
  - [ ] Update `resume.ts` to use `parseProviderNames`
  - [ ] Update `export.ts` to use `parseProviderNames`
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Run `npm test`
  - [ ] Acceptance: Invalid provider names throw descriptive errors

---

### Step 14: Standardize Error Messages

Ensure consistent error message formatting.

- [ ] Step 14: Standardize error messages
  - [ ] Review all error messages in command files
  - [ ] Ensure no trailing periods (or all have them - pick one style)
  - [ ] Use consistent capitalization (sentence case)
  - [ ] Run `npm run lint`
  - [ ] Acceptance: Error messages follow consistent style

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
