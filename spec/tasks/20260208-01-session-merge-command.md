# Task: Session Merge Command

## Purpose

異なる検索戦略のセッション結果を統合する `merge` コマンドの実装。
YAML DSLがAND-onlyのため、OR-of-AND（複数戦略の和集合）を表現する手段がない。
mergeコマンドによりセッションレベルで結果を統合する。

## Related Specs

- [spec/models/session.md](../models/session.md) - Merged Session structure
- [spec/cli/commands.md](../cli/commands.md) - merge command definition
- [spec/cli/suggestions.md](../cli/suggestions.md) - merge suggestion rules

## Related Source Files

- `src/cli/commands/merge.ts` (new)
- `src/cli/commands/merge.test.ts` (new)
- `src/session/types.ts` (MergedSessionFile type addition)
- `src/session/manager.ts` (merged session support)
- `src/cli/commands/session-utils.ts` (getArticleKeys reuse)
- `src/cli/index.ts` (command registration)

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

- [x] Step 1: Add type/sources fields to SessionFile type
  - [x] Write test: `src/session/types.test.ts`
  - [x] Implement type changes in `src/session/types.ts`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: SessionFile type supports `type: merge` and `sources` field

- [x] Step 2: Implement merge core logic (article merge & deduplication)
  - [x] Write test: `src/cli/commands/merge.test.ts`
  - [x] Create stub: `src/cli/commands/merge.ts`
  - [x] Verify test fails (Red)
  - [x] Implement merge logic with identifier-based deduplication
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Articles from multiple sessions are merged with duplicates removed

- [x] Step 3: Copy source session provenance to sources/ directory
  - [x] Write test for provenance copy
  - [x] Implement sources/ directory creation and file copying
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: sources/ contains session.yaml, query_common.yaml, and query texts from each source

- [x] Step 4: Detect merged sessions & generate error message
  - [x] Write test for merged session rejection
  - [x] Implement merged session detection with expanded command suggestion
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Merged sessions are rejected with helpful error showing original sources

- [x] Step 5: CLI command registration & option parsing
  - [x] Write test for CLI argument parsing
  - [x] Register merge command in `src/cli/index.ts`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `search-hub merge <id>... [--name] [--dry-run] [--json]` works

- [x] Step 6: Implement --dry-run support
  - [x] Write test for dry-run output
  - [x] Implement dry-run mode showing merge preview without creating session
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: --dry-run shows what would be merged without side effects

- [x] Step 7: Verify compatibility with status/summary/diff/export
  - [x] Write tests verifying merged sessions work with existing commands
  - [x] Fix any incompatibilities
  - [x] Verify tests pass (Green)
  - [x] Acceptance: Existing commands handle merged sessions correctly

- [x] Step 8: Implement resume rejection for merged sessions
  - [x] Write test for resume rejection
  - [x] Add resume guard in resume command
  - [x] Verify test passes (Green)
  - [x] Acceptance: `resume` on merged session returns clear error

- [x] Step 9: Integrate suggestions for merge command
  - [x] Write test for suggestion output
  - [x] Add merge suggestion rules
  - [x] Verify test passes (Green)
  - [x] Acceptance: Merge completion shows `results` and `summary` suggestions

### Final Step: E2E Integration Tests (MANDATORY)

- [x] Write E2E test: `src/cli/commands/merge.e2e.test.ts`
  - **Minimize mocks** - Only mock external services when absolutely necessary
  - **Follow user flows** - Test the same paths users will take
  - **Use real file I/O** - Test actual file operations with temp directories
  - **Execute real commands** - Test actual CLI execution where possible
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: Test the feature manually as a user would
- [x] Acceptance: All tests pass, feature works in real usage

## Dependencies

None (extension of existing features)

## Notes

- Deduplication should reuse existing `getArticleKeys` logic from `session-utils.ts`
- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- E2E integration tests are critical - Mock-based unit tests often miss real-world issues
