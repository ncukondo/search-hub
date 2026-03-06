# Task: Smart Query File Resolution & Documentation Update

## Purpose

`query init <title>` でデフォルト出力先が `queries/<name>.yaml` になった（#127）ため、
後続コマンドでも `queries/` からの自動解決を導入し、拡張子やパスの入力を省略可能にする。

合わせて、README.md、docs/query-guide.md、spec/cli/commands.md を新しいワークフローに更新する。

### 変更後のワークフロー

```bash
# 拡張子・パス省略が可能
search-hub query validate wba-pain       # → queries/wba-pain.yaml
search-hub query translate wba-pain      # → queries/wba-pain.yaml
search-hub search wba-pain               # → queries/wba-pain.yaml

# 従来の明示パスも引き続き動作
search-hub search ./custom/path/query.yaml
```

### 解決順序（Query File Resolution）

```
1. そのままのパスにファイルが存在する → 使う
2. <arg>.yaml が存在する             → 使う
3. queries/<arg>.yaml が存在する     → 使う
4. どれもなければエラー（候補パスをエラーメッセージに表示）
```

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - 全コマンドの query file 引数
- [spec/tasks/20260306-02-query-init-title-arg.md](20260306-02-query-init-title-arg.md) - 依存タスク

## Related Source Files

- `src/cli/commands/query/resolve.ts` (new) - `resolveQueryFile()` ユーティリティ
- `src/cli/commands/query/resolve.test.ts` (new) - テスト
- `src/cli/index.ts` - `query validate`, `query translate`, `search` コマンド定義
- `src/cli/commands/search.ts` - `parseSearchOptions()`
- `src/cli/commands/query/validate.ts` - validate コマンド
- `src/cli/suggestions/rules.ts` - サジェスション内のパス参照
- `README.md` - Quick Start セクション
- `docs/query-guide.md` - Getting Started セクション

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: `resolveQueryFile()` ユーティリティ

クエリファイルのパスをスマートに解決する関数を作成する。

- [x] Write test: `src/cli/commands/query/resolve.test.ts`
  - 正確なパスが存在する → そのまま返す (`./my-query.yaml`)
  - `<arg>.yaml` が存在する → それを返す (`my-query` → `my-query.yaml`)
  - `queries/<arg>.yaml` が存在する → それを返す (`my-query` → `queries/my-query.yaml`)
  - 正確なパスが `.yaml` 付きで存在する場合、`.yaml` 追加より優先
  - どれも存在しない → エラー（試行したパスの一覧を含む）
  - ディレクトリが渡された場合 → エラー
- [x] Verify test fails (Red)
- [x] Implement: `src/cli/commands/query/resolve.ts`
  ```typescript
  export async function resolveQueryFile(arg: string): Promise<string> {
    // 1. Exact path
    // 2. arg + .yaml
    // 3. queries/ + arg + .yaml
    // 4. Error with tried paths
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 全パターンの解決が正しく動作する

### Step 2: `query validate` に smart resolution を適用

- [x] Write test: (E2E で検証 - Step Final)
- [x] Implement: `src/cli/index.ts` の validate アクション内で `resolveQueryFile()` を呼ぶ
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 拡張子省略で validate が動作する

### Step 3: `query translate` に smart resolution を適用

- [x] Implement: translate アクション内で `resolveQueryFile()` を呼ぶ
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 拡張子省略で translate が動作する

### Step 4: `search` コマンドに smart resolution を適用

- [x] Implement: CLI アクション内で `resolveQueryFile()` を呼ぶ
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `search wba-pain` で検索が実行される

### Step 5: `query assess` と `query log` に smart resolution を適用

- [x] Implement: assess, log アクション内で `resolveQueryFile()` を呼ぶ
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 全 query サブコマンドで smart resolution が動作する

### Step 6: エラーメッセージの改善

ファイルが見つからない場合に、試行したパスと `query init` の案内を表示する。

- [x] Write test: (resolve.test.ts で検証済み)
- [x] Implement: エラーメッセージ例:
  ```
  Error: Query file not found: "wba-pain"
    Tried:
      ./wba-pain
      ./wba-pain.yaml
      ./queries/wba-pain.yaml
    Create a new query: search-hub query init "wba-pain"
  ```
- [x] Acceptance: エラーメッセージが明確で次のアクションを案内する

### Step 7: README.md 更新

- [x] `README.md` の Quick Start セクションを更新:
  - `search-hub query init -o query.yaml` → `search-hub query init "my review"`
  - validate, search の例も `queries/` パスに更新
  - Query Development セクションのワークフロー例を更新
- [x] Acceptance: README が新しいワークフローを反映する

### Step 8: docs/query-guide.md 更新

- [x] Getting Started セクションを更新:
  - `query init -o query.yaml` → `query init "my search"`
  - `queries/` ディレクトリの説明を追加
  - Tips セクションの `query init` 案内を更新
- [x] Acceptance: Query Guide が新しいワークフローを反映する

### Step 9: ヘルプテキストとサジェスション更新

- [x] `src/cli/index.ts` のヘルプテキスト更新:
  - Quick Start 行: `search-hub query init -o search.yaml` → `search-hub query init "my search"`
  - search コマンドのヘルプ内 `query init` 参照を更新
- [x] `src/cli/suggestions/rules.ts` のサジェスション更新:
  - `query init -o query.yaml` → `query init "<title>"` に変更
  - ファイルパス参照を `queries/` ベースに更新
  - **`search --count-only` 後のサジェスション**: クエリ編集→再実行のイテレーションを明示案内
    ```
    Next:  $EDITOR queries/<name>.yaml       Edit query to refine
           search-hub search <name> --count-only   Re-check counts
           search-hub query assess <name> --verdict refine   Record assessment
      OK:  search-hub search <name>           Execute full search
    ```
  - **`search`（本実行）後のサジェスション**: 同じ query name の過去セッションが存在する場合、
    `diff` コマンドを具体的なセッション ID 付きで提案
    ```
    Next:  search-hub diff <previous-session> <new-session>   Compare with previous
    ```
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: ヘルプとサジェスションが新しい形式を反映し、イテレーションが案内される

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [x] Write E2E test: `src/cli/commands/query/resolve.e2e.test.ts`
  - `query init "test"` → `query validate test` が動作するフルフロー
  - `search test --dry-run` が `queries/test.yaml` を解決するフルフロー
  - 存在しないクエリ名で適切なエラーメッセージが出ること
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: E2E tests verify the full flow
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- `resolveQueryFile()` は複数コマンドで共有するため、独立したモジュールとして作成する
- 解決順序で CWD を `queries/` より優先することで、`-o` で CWD に作ったファイルも引き続き動作する
- `query assess` と `query log` の search-log ファイルも query ファイルと同じディレクトリに生成される
  （`queries/wba-pain.yaml` → `queries/wba-pain.search-log.yaml`）
