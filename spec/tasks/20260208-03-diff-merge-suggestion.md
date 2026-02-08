# Task: Diff Merge Suggestion

## Purpose

`diff` コマンドの出力で Added > 0 かつ Removed > 0 の場合（双方に固有の論文がある場合）に
merge コマンドを提案する。これにより、異なる検索戦略の結果を統合するワークフローへの
導線を提供する。

## Related Specs

- [spec/cli/suggestions.md](../cli/suggestions.md) - diff suggestion definition

## Related Source Files

- `src/cli/commands/diff.ts` (suggestion output addition)
- `src/cli/suggestions/rules.ts` (diff rule update)

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

- [ ] Step 1: Update diff suggestion to propose merge conditionally
  - [ ] Write test: verify merge suggestion appears when Added > 0 and Removed > 0
  - [ ] Write test: verify merge suggestion does NOT appear when Removed = 0
  - [ ] Update diff command to pass added/removed counts to suggestion context
  - [ ] Verify test fails (Red)
  - [ ] Implement conditional merge suggestion in diff rules
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `diff` output shows merge suggestion only when both sessions have unique articles

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: verify diff output includes merge suggestion in appropriate conditions
  - **Use real file I/O** - Test with actual session directories
  - **Follow user flows** - Test the same paths users will take
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run diff on sessions with mutual differences and verify suggestion
- [ ] Acceptance: All tests pass, suggestion appears correctly in real usage

## Dependencies

- Task #93 (merge command must exist for the suggestion to be actionable)

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- E2E integration tests are critical - Mock-based unit tests often miss real-world issues
