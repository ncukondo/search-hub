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

- [ ] Step 1: Add type/sources fields to SessionFile type
  - [ ] Write test: `src/session/types.test.ts`
  - [ ] Implement type changes in `src/session/types.ts`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: SessionFile type supports `type: merge` and `sources` field

- [ ] Step 2: Implement merge core logic (article merge & deduplication)
  - [ ] Write test: `src/cli/commands/merge.test.ts`
  - [ ] Create stub: `src/cli/commands/merge.ts`
  - [ ] Verify test fails (Red)
  - [ ] Implement merge logic with identifier-based deduplication
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Articles from multiple sessions are merged with duplicates removed

- [ ] Step 3: Copy source session provenance to sources/ directory
  - [ ] Write test for provenance copy
  - [ ] Implement sources/ directory creation and file copying
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: sources/ contains session.yaml, query_common.yaml, and query texts from each source

- [ ] Step 4: Detect merged sessions & generate error message
  - [ ] Write test for merged session rejection
  - [ ] Implement merged session detection with expanded command suggestion
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Merged sessions are rejected with helpful error showing original sources

- [ ] Step 5: CLI command registration & option parsing
  - [ ] Write test for CLI argument parsing
  - [ ] Register merge command in `src/cli/index.ts`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `search-hub merge <id>... [--name] [--dry-run] [--json]` works

- [ ] Step 6: Implement --dry-run support
  - [ ] Write test for dry-run output
  - [ ] Implement dry-run mode showing merge preview without creating session
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: --dry-run shows what would be merged without side effects

- [ ] Step 7: Verify compatibility with status/summary/diff/export
  - [ ] Write tests verifying merged sessions work with existing commands
  - [ ] Fix any incompatibilities
  - [ ] Verify tests pass (Green)
  - [ ] Acceptance: Existing commands handle merged sessions correctly

- [ ] Step 8: Implement resume rejection for merged sessions
  - [ ] Write test for resume rejection
  - [ ] Add resume guard in resume command
  - [ ] Verify test passes (Green)
  - [ ] Acceptance: `resume` on merged session returns clear error

- [ ] Step 9: Integrate suggestions for merge command
  - [ ] Write test for suggestion output
  - [ ] Add merge suggestion rules
  - [ ] Verify test passes (Green)
  - [ ] Acceptance: Merge completion shows `results` and `summary` suggestions

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/cli/commands/merge.e2e.test.ts`
  - **Minimize mocks** - Only mock external services when absolutely necessary
  - **Follow user flows** - Test the same paths users will take
  - **Use real file I/O** - Test actual file operations with temp directories
  - **Execute real commands** - Test actual CLI execution where possible
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test the feature manually as a user would
- [ ] Acceptance: All tests pass, feature works in real usage

## Dependencies

None (extension of existing features)

## Notes

- Deduplication should reuse existing `getArticleKeys` logic from `session-utils.ts`
- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- E2E integration tests are critical - Mock-based unit tests often miss real-world issues
