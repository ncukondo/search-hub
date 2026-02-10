# Task: Remove Deprecated `--vocab` Flag from `query validate`

## Purpose

Task #100 で vocab バリデーションがデフォルト化され、`--vocab` フラグは不要になった。
Task #100 の spec では「`--vocab` は受け付けるが無視する（後方互換）」「ドキュメント・ヘルプからは削除」
と定義されているが、実装では `--help` に `(deprecated, now default)` と表示されたまま残っている。

pre-release 段階のため後方互換性を維持する必要はなく、`--vocab` オプション定義を完全に削除し、
`--no-vocab` のみに統一する。

### 現状

```
Options:
  --vocab     (deprecated, now default) validate controlled vocabulary terms  ← 削除対象
  --no-vocab  skip controlled vocabulary validation
  --no-cache  skip vocabulary lookup cache
```

### 目標

```
Options:
  --no-vocab  skip controlled vocabulary validation
  --no-cache  skip vocabulary lookup cache
```

## Related Specs

- [spec/tasks/completed/20260210-05-default-vocab-validation-with-cache.md](completed/20260210-05-default-vocab-validation-with-cache.md) - Task #100（`--vocab` 廃止の方針）
- [spec/cli/commands.md](../cli/commands.md) - CLI コマンド仕様（`query validate` セクション更新）

## Related Source Files

- `src/cli/index.ts` — `--vocab` オプション定義（L363）、`opts.vocab` 参照（L374）
- `src/cli/commands/query/validate.ts` — コメント中の `--vocab` 言及（L30）
- `src/cli/commands/query/validate.e2e.test.ts` — E2E テスト（`--vocab` テストがあれば削除）

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: `--vocab` オプション定義を削除し `--no-vocab` のみに統一

- [ ] Write test: `src/cli/commands/query/validate.e2e.test.ts` or integration test
  - `--no-vocab` で vocab チェックがスキップされることを確認（既存テストの維持）
  - `--vocab` を指定しなくても vocab チェックがデフォルトで実行されることを確認（既存テストの維持）
- [ ] Verify test passes (現時点で Green であるはず)
- [ ] Implement:
  - `src/cli/index.ts` L363: `.option('--vocab', ...)` 行を削除
  - `src/cli/index.ts` L371: action のシグネチャ `opts: { vocab?: boolean; cache?: boolean }` を
    `opts: { vocab?: boolean; cache?: boolean }` のまま維持（Commander.js の `--no-vocab` は
    `vocab: false` を設定するため、`--vocab` 定義がなくても `--no-vocab` は動作する）
    ※ Commander.js の挙動を確認し、必要なら型を調整
  - `src/cli/commands/query/validate.ts` L30: コメントから `--vocab` 言及を削除
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Verify test still passes
- [ ] Acceptance: `--help` に `--vocab` が表示されず、`--no-vocab` のみが表示される

### Step 2: spec/cli/commands.md を更新

- [ ] `query validate` セクションにオプション一覧を追加:
  ```
  ### query validate

  Validate query YAML file (auto-checks controlled vocabulary).

  ```bash
  search-hub query validate [options] <query.yaml>
  ```

  Options:
    --no-vocab  skip controlled vocabulary validation
    --no-cache  skip vocabulary lookup cache
  ```
- [ ] Acceptance: commands.md に `query validate` のオプションが記載されている

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Verify all existing E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - `search-hub query validate --help` で `--vocab` が表示されないこと
  - `search-hub query validate file.yaml` でデフォルトの vocab チェックが動作すること
  - `search-hub query validate --no-vocab file.yaml` で vocab チェックがスキップされること
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- Commander.js では `.option('--no-xxx')` を定義すると `opts.xxx = false` がセットされる。
  `--vocab` の `.option()` 定義を削除しても `--no-vocab` の動作に影響がないことを確認すること
- pre-release のため `--vocab` の後方互換は不要。完全削除で問題ない
- 実装量は最小限（オプション定義1行の削除 + コメント修正 + spec更新）
