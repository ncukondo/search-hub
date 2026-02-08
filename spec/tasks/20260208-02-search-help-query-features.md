# Task: Search Help Query Features

## Purpose

`search --help` にクエリDSLの利用可能機能一覧を追加し、`query init` テンプレートの発見可能性を補完する。
現状では filters, exclude, mesh, overrides 等の機能が `query init` テンプレートにのみ記載されており、
`search --help` を読んでもこれらの存在に気づけない。

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - search command Help Text Enhancement

## Related Source Files

- `src/cli/index.ts` (search command addHelpText update)

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

- [ ] Step 1: Add Query features section to search --help
  - [ ] Write test: verify help output contains "Query features" section
  - [ ] Update addHelpText in `src/cli/index.ts` for search command
  - [ ] Verify test fails (Red)
  - [ ] Implement help text addition
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `search --help` shows Query features with filters, exclude, mesh/eric, overrides

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test verifying `search --help` output
  - **Execute real commands** - Test actual CLI help output
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run `search-hub search --help` and verify Query features section appears
- [ ] Acceptance: All tests pass, help text is visible in real usage

## Dependencies

None

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- The help text should reference `query init` for the full template
