# Task: query パスを .search-hub/queries/ に統一 (Fixes #143)

## Purpose

`search-hub init` が `.search-hub/queries/` を作成するのに対し、`query init` は `./queries/` にファイルを作成し、`resolveQueryFile()` も `queries/` を検索する。two-tier config 設計に合わせてすべてのクエリ操作を `.search-hub/queries/` ベースに統一する。

将来の設定対応（`config.toml` の `queries.dir`）を見越し、パス解決関数を `getQueriesDir()` に抽象化する。

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - query init, query resolve のセクション
- [spec/architecture.md](../architecture.md) - プロジェクトディレクトリ構造
- [spec/models/config.md](../models/config.md) - .search-hub/ 構造

## Related Source Files

- `src/config/paths.ts` — `getLocalQueriesDir` → `getQueriesDir` リネーム
- `src/config/paths.test.ts` — テスト更新
- `src/config/index.ts` — re-export 更新
- `src/cli/commands/query/init.ts` — `QUERIES_DIR` → `getQueriesDir()` に変更
- `src/cli/commands/query/init.test.ts` — テスト更新
- `src/cli/commands/query/init.e2e.test.ts` — E2Eテスト更新
- `src/cli/commands/query/resolve.ts` — 検索パスを `.search-hub/queries/` に変更
- `src/cli/commands/query/resolve.test.ts` — テスト更新
- `src/cli/commands/query/resolve.e2e.test.ts` — E2Eテスト更新
- `src/cli/suggestions/rules.ts` — デフォルトパス更新
- `src/cli/suggestions/rules.test.ts` — テスト更新
- `src/cli/index.ts` — ヘルプテキスト更新

## Implementation Steps

### Step 1: `getLocalQueriesDir` → `getQueriesDir` リネーム

`paths.ts` の関数名を変更し、export を更新する。呼び出し元（`init.ts` の `initLocal`）も追従。

- [x] Write test: `src/config/paths.test.ts`
  - `getQueriesDir()` が `.search-hub/queries/` を返すことを確認
  - `getQueriesDir(baseDir)` がカスタムベースで動作することを確認
- [x] Rename: `src/config/paths.ts` の `getLocalQueriesDir` → `getQueriesDir`
- [x] Update: `src/config/index.ts` の re-export
- [x] Update: `src/cli/commands/init.ts` の呼び出し箇所
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `getQueriesDir` が正しいパスを返し、既存の `init` コマンドが動作する

### Step 2: `query init` を `.search-hub/queries/` に変更

`QUERIES_DIR` 定数を廃止し、`getQueriesDir()` を使用する。

- [x] Write test: `src/cli/commands/query/init.test.ts`
  - デフォルト出力先が `.search-hub/queries/<sanitized>.yaml` になることを確認
  - `query.schema.json` が `.search-hub/queries/` 内に作成されることを確認
  - `-o` オプション指定時は従来通り指定パスに出力されることを確認
- [x] Implement: `src/cli/commands/query/init.ts`
  - `QUERIES_DIR` 定数を削除
  - `writeQueryTemplate` で `getQueriesDir(options.cwd)` を使用
- [x] Verify test fails (Red) → Implement → Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `query init "title"` が `.search-hub/queries/title.yaml` を作成する

### Step 3: `resolveQueryFile` を `.search-hub/queries/` に変更

ハードコードの `queries/` パスを `getQueriesDir()` 相対に変更。

- [x] Write test: `src/cli/commands/query/resolve.test.ts`
  - `.search-hub/queries/<arg>.yaml` が解決されることを確認
  - `.search-hub/queries/<arg>.yml` が解決されることを確認
  - エラーメッセージに `.search-hub/queries/` パスが含まれることを確認
- [x] Implement: `src/cli/commands/query/resolve.ts`
  - `queries/` → `getQueriesDir()` からの相対パスに変更
- [x] Verify test fails (Red) → Implement → Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `resolveQueryFile("name")` が `.search-hub/queries/name.yaml` を探す

### Step 4: サジェスト・ヘルプテキスト更新

- [x] Update: `src/cli/suggestions/rules.ts` — `queryInitRule` のデフォルトパス
- [x] Update: `src/cli/suggestions/rules.test.ts` — 期待値の更新
- [x] Update: `src/cli/index.ts` — `query init` のヘルプテキスト例
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: サジェスションとヘルプが `.search-hub/queries/` パスを表示する

### Step 5: ドキュメント更新

- [x] Update: `spec/cli/commands.md`
  - query init のデフォルト出力先の記述
  - query resolve の検索パスの記述
  - 使用例のパス
- [x] Update: `spec/architecture.md`
  - プロジェクトディレクトリ構造の `queries/` → `.search-hub/queries/`
  - resolve の検索パス説明
- [x] Update: `spec/models/config.md`
  - ディレクトリ構造の確認（既に `.search-hub/queries/` になっているはず）
- [x] Acceptance: ドキュメントがソースコードと整合している

### Final Step: E2E Integration Tests (MANDATORY)

- [x] Update E2E test: `src/cli/commands/query/init.e2e.test.ts`
  - `query init` が `.search-hub/queries/` にファイルを作成するフロー
- [x] Update E2E test: `src/cli/commands/query/resolve.e2e.test.ts`
  - `.search-hub/queries/` 内のファイルが解決されるフロー
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: `search-hub init` → `query init "test"` → `query validate test` のフルフロー
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- `getQueriesDir()` は現在 `.search-hub/queries/` を返すが、将来 config.toml の設定を読むよう拡張可能
- `-o` オプションは引き続き任意のパスへの出力をサポート
- 既存の `./queries/` にファイルがあるユーザーへの移行パスは今回のスコープ外（必要に応じて別タスクで対応）
- Issue #143 は本タスクを含むすべての関連PRがmergeされたらcloseする
