# Task: Wire Next Step Suggestions to `query validate` Command

## Purpose

`query validate` コマンド実行後に Next Step Suggestion が表示されない。
suggestion ルールは `src/cli/suggestions/rules.ts` に定義済みだが、
`src/cli/index.ts` の validate アクション内で `getSuggestion()` / `formatSuggestion()` が
呼ばれていない。他のコマンド（search, diff, merge, register 等）ではすべて接続済み。

これはタスク #57 (Next Step Suggestions) 実装時の接続漏れである。

## Related Specs

- [spec/cli/suggestions.md](../cli/suggestions.md) - Suggestion 仕様
  - `query validate (成功時)`: `--dry-run` / `--preview` を案内
  - `query validate (失敗時)`: `$EDITOR` を案内

## Related Source Files

- `src/cli/index.ts` — validate コマンドの action（suggestion 呼び出しを追加する箇所）
- `src/cli/suggestions/rules.ts` — `queryValidateRule`（実装済み）
- `src/cli/suggestions/rules.test.ts` — テスト（実装済み）
- `src/cli/suggestions/index.ts` — `formatSuggestion()`

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: validate アクション（noVocab パス）に suggestion を接続

`--no-vocab` パスでは validate 完了後すぐに return しているため、suggestion が出ない。

- [x] Write test: CLI integration test / E2E test
  - `--no-vocab` で validate 成功時に `--dry-run` / `--preview` の suggestion が表示されること
  - `--no-vocab` で validate 失敗時に `$EDITOR` の suggestion が表示されること
  - `--quiet` 時に suggestion が表示されないこと
- [x] Verify test fails (Red)
- [x] Implement: `src/cli/index.ts` の noVocab パス（L383-393）に suggestion を追加
  ```typescript
  if (!globalOpts.quiet) {
    const output = formatValidateResult(result, file);
    const suggestion = formatSuggestion(getSuggestion({
      command: 'query validate',
      queryFile: file,
      validationSuccess: result.success,
    }));
    console.log(output + (suggestion ? '\n' + suggestion : ''));
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: `--no-vocab` パスで suggestion が表示される

### Step 2: validate アクション（vocab 実行パス）に suggestion を接続

vocab チェック付きの通常パスにも suggestion を追加する。

- [x] Write test: CLI integration test / E2E test
  - vocab チェック成功時に suggestion が表示されること
  - vocab エラー時に suggestion が表示されること
- [x] Verify test fails (Red)
- [x] Implement: `src/cli/index.ts` の vocab パス（L408-414）に suggestion を追加
  ```typescript
  if (!globalOpts.quiet) {
    let output = formatValidateResult(result, file);
    if (result.vocabResult) {
      output += formatVocabValidationOutput(result.vocabResult);
    }
    const suggestion = formatSuggestion(getSuggestion({
      command: 'query validate',
      queryFile: file,
      validationSuccess: result.success && !hasVocabErrors(result),
    }));
    if (suggestion) output += '\n' + suggestion;
    console.log(output);
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: vocab パスで suggestion が表示される

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [x] Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - validate 成功時に `--dry-run` を含む suggestion が出力されること
  - validate 失敗時に `$EDITOR` を含む suggestion が出力されること
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: validate の成功・失敗それぞれで suggestion 出力を確認
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- このタスクは #102 (Query YAML JSON Schema) の前提ではないが、#102 の Step 5 で
  `hasSchemaLink` の分岐を suggestion に追加するため、先にこのタスクで基本接続を
  完了しておくのが望ましい
- 実装量は少ない（既存ルールの接続のみ）が、テストと E2E 確認を確実に行うこと
