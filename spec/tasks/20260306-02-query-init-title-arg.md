# Task: `query init <title>` & Default `queries/` Directory

## Purpose

`query init` は現在 `-o` を明示しないと stdout 出力になり、ファイル名と YAML 内の `name` フィールドが無関係になりがちである。
また、クエリファイルがプロジェクトルートに散らばる問題がある。

本タスクでは:
1. `<title>` を必須 positional 引数とし、`name` フィールドを自動設定する
2. デフォルト出力先を `queries/<sanitized-title>.yaml` にする
3. `search-hub init` が `queries/` ディレクトリも作成するようにする

### 変更後の CLI

```bash
# 標準的な使い方（CWD/queries/ に出力）
search-hub query init "WBA pain mechanisms"
# → Created: queries/wba-pain-mechanisms.yaml

# 出力先を上書き
search-hub query init "WBA pain" -o ./custom-path.yaml

# stdout に出力（テンプレート確認用）
search-hub query init "WBA pain" --stdout
```

### ディレクトリ構造

```
my-research-project/
  search-hub.config.toml
  queries/                    # クエリファイル置き場
    wba-pain.yaml
    wba-intervention.yaml
    query.schema.json         # 共有 JSON Schema
  sessions/                   # 検索結果
    20260306_wba-pain_a1b2c3/
```

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - `query init` セクション
- [spec/architecture.md](../architecture.md) - ディレクトリ構造
- [spec/models/query-dsl.md](../models/query-dsl.md) - `name` フィールド

## Related Source Files

- `src/cli/index.ts` - `query init` コマンド定義
- `src/cli/commands/query/init.ts` - `writeQueryTemplate()`, `generateQueryTemplate()`
- `src/cli/commands/query/init.test.ts` - ユニットテスト
- `src/cli/commands/query/init.e2e.test.ts` - E2E テスト
- `src/cli/commands/init.ts` - `search-hub init` コマンド
- `src/cli/commands/init.test.ts` - init テスト
- `src/cli/suggestions/rules.ts` - `queryInitRule` サジェスション
- `src/cli/suggestions/rules.test.ts` - サジェスションテスト
- `src/query/validator.ts` - `queryFileSchema` (テンプレートの `name` デフォルト値)

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: `sanitizeForFilename()` ユーティリティ関数

タイトル文字列をファイル名に安全な形式に変換する関数を作成する。

- [x] Write test: `src/cli/commands/query/init.test.ts`
  - `"WBA pain mechanisms"` → `"wba-pain-mechanisms"`
  - `"My Search"` → `"my-search"`
  - `"test_query"` → `"test_query"` (アンダースコア保持)
  - `"日本語 test"` → `"test"` (非ASCII文字除去)
  - `"  spaces  "` → `"spaces"` (前後トリム)
  - 空文字列の場合はエラー
- [x] Verify test fails (Red)
- [x] Implement: `src/cli/commands/query/init.ts` に `sanitizeForFilename()` を追加
  ```typescript
  export function sanitizeForFilename(title: string): string {
    return title
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: サニタイズが全パターンで正しく動作する

### Step 2: `writeQueryTemplate()` に `title` パラメータを追加

テンプレート生成時に `name` フィールドを `<title>` に設定するよう変更する。

- [x] Write test: `src/cli/commands/query/init.test.ts`
  - `title: "WBA pain"` → YAML 内の `name: WBA pain` が設定されること
  - `title` 未指定時は従来通り `name: my_search`
- [x] Verify test fails (Red)
- [x] Implement:
  - `generateQueryTemplate(title?: string)` に引数追加
  - テンプレート内の `name: my_search` を `name: <title>` で置換
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: title 指定時にテンプレートの name フィールドが設定される

### Step 3: デフォルト出力先を `queries/` に変更

`-o` 未指定かつ `--stdout` 未指定の場合、`queries/<sanitized-title>.yaml` に出力する。

- [x] Write test: `src/cli/commands/query/init.test.ts`
  - title のみ指定 → `queries/<sanitized>.yaml` に書き込まれること
  - `queries/` ディレクトリが自動作成されること
  - `query.schema.json` が `queries/` 内に作成されること
  - 既存ファイルがある場合はエラー（`--force` で上書き）
  - `-o` 指定時はそちらが優先されること
  - `--stdout` 指定時はファイル出力せず stdout に出力すること
- [x] Verify test fails (Red)
- [x] Implement:
  - `writeQueryTemplate()` のシグネチャ変更:
    ```typescript
    interface WriteQueryTemplateOptions {
      title: string;
      output?: string;    // -o で明示した場合
      stdout?: boolean;   // --stdout
      force?: boolean;
    }
    ```
  - デフォルト出力パスの決定ロジック:
    1. `--stdout` → stdout 出力（ファイル生成なし）
    2. `-o <path>` → そのパスに出力
    3. それ以外 → `queries/<sanitized-title>.yaml`
  - `queries/` ディレクトリの自動作成 (`mkdir -p` 相当)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: デフォルトで `queries/` に正しく出力される

### Step 4: CLI コマンド定義の更新

`src/cli/index.ts` の `query init` コマンドを新しいシグネチャに更新する。

- [x] Write test: (CLI integration で検証)
- [x] Implement:
  - `<title>` を必須 positional 引数に変更
  - `--stdout` オプション追加
  - `-o, --output <path>` は任意オプションとして維持
  - ヘルプテキスト更新
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `search-hub query init --help` が新しいシグネチャを表示する

### Step 5: `search-hub init` で `queries/` ディレクトリ作成

`search-hub init` 実行時に `sessions/` と並んで `queries/` も作成する。

- [x] Write test: `src/cli/commands/init.test.ts`
  - `init` 実行後に `queries/` ディレクトリが存在すること
  - 既に存在する場合はエラーにならないこと
- [x] Verify test fails (Red)
- [x] Implement: `src/cli/commands/init.ts` の `init()` 関数に `queries/` 作成を追加
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `search-hub init` が `queries/` を作成する

### Step 6: サジェスションルールの更新

`queryInitRule` を新しいコマンド形式に合わせて更新する。

- [x] Write test: `src/cli/suggestions/rules.test.ts`
  - `query init` 後のサジェスションが `queries/<file>` を参照すること
  - 他のルールで `query init -o query.yaml` → `query init <title>` に更新
- [x] Verify test fails (Red)
- [x] Implement: `src/cli/suggestions/rules.ts` のルール更新
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: サジェスションが新しい形式を反映する

### Step 7: 出力メッセージの改善

ファイル作成後に次のステップとイテレーションの案内を表示する。

- [x] Write test: (E2E で検証)
- [x] Implement: 作成成功時のメッセージ:
  ```
  Created: queries/wba-pain.yaml

  Next steps:
    1. Edit query:      $EDITOR queries/wba-pain.yaml
    2. Validate:        search-hub query validate wba-pain
    3. Check counts:    search-hub search wba-pain --count-only

  Iterate: edit the same file and re-run step 3. Counts are logged automatically.
  ```
- [x] Acceptance: メッセージが表示され、イテレーションの方法が案内される

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [x] Write/update E2E test: `src/cli/commands/query/init.e2e.test.ts`
  - `query init "test search"` → `queries/test-search.yaml` が作成されること
  - YAML 内の `name` が `test search` であること
  - `queries/query.schema.json` が存在すること
  - 作成されたファイルが `query validate` をパスすること
  - `--stdout` で stdout に出力され、ファイルが作成されないこと
  - `-o custom.yaml` で指定パスに出力されること
  - 既存ファイルへの上書き防止と `--force` の動作
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: `query init` → edit → `query validate` の一連フローを手動確認
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- 後方互換は不要（pre-release）。`-o` なし + `--stdout` なしの場合の挙動が変わる（stdout → ファイル出力）
- `query.schema.json` は `queries/` 内に1つだけ生成すれば全クエリファイルで共有可能
- `queries/` のパスはハードコード（将来的に config で設定可能にする余地は残すが、今は不要）
