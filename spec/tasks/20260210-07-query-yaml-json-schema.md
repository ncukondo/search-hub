# Task: Query YAML JSON Schema & `query init` Schema Link

## Purpose

`query init` で生成されるテンプレートに `$schema` リンクがなく、手書きの YAML との区別がつかない。
Review YAML では `# yaml-language-server: $schema=./review.schema.json` パターンが確立済みだが、
query YAML にはこの仕組みがない。

JSON Schema を Zod v4 の `z.toJSONSchema()` で自動生成し、`query init` に `$schema` リンクを
付与することで:

1. エディタ（VS Code + YAML 拡張等）で入力補完・バリデーションが効くようになる
2. `query validate` で `$schema` リンクの有無を検出し、手書きファイルに `query init` を
   案内するスマートなガイダンスが可能になる

### ガイダンスの分岐ロジック

| `$schema` リンク | バリデーション結果 | ガイダンス |
|---|---|---|
| なし | 成功 | info: `query init` を推奨（エディタ補完が使えるようになる旨） |
| なし | エラーあり | error と共に `query init` を強く推奨 |
| あり | 成功 | ガイダンスなし |
| あり | エラーあり | エディタの補完を活用するよう案内 |

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL 仕様
- [spec/cli/suggestions.md](../cli/suggestions.md) - Suggestion 仕様（`query validate` ルール更新）
- [spec/tasks/completed/20260129-05-query-init-template.md](completed/20260129-05-query-init-template.md) - query init 元タスク
- [spec/tasks/completed/20260210-06-review-schema-path-local-copy.md](completed/20260210-06-review-schema-path-local-copy.md) - review の $schema パターン（参考実装）

## Related Source Files

- `src/query/validator.ts` — Zod スキーマ定義（`queryFileSchema` 等）
- `src/query/json-schema.ts` (new) — `z.toJSONSchema()` によるJSON Schema 生成
- `src/query/json-schema.test.ts` (new) — JSON Schema 生成テスト
- `src/cli/commands/query/init.ts` — テンプレート生成（`$schema` リンク追加）
- `src/cli/commands/query/init.test.ts` — テスト更新
- `src/cli/commands/query/validate.ts` — `$schema` 検出・ガイダンスロジック
- `src/cli/commands/query/validate.test.ts` — テスト更新
- `src/cli/suggestions/rules.ts` — `queryValidateRule` のガイダンス分岐更新
- `src/cli/suggestions/rules.test.ts` — テスト更新
- `src/cli/index.ts` — validate アクションに suggestion 接続

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Generate JSON Schema from Zod schema

Zod v4 の `z.toJSONSchema()` を使い、`queryFileSchema` から JSON Schema を生成する。

- [ ] Write test: `src/query/json-schema.test.ts`
  - 生成される JSON Schema が valid な JSON Schema draft であること
  - `name` (required string), `query` (required array) 等の基本構造が反映されること
  - `field` の enum 値 (`title`, `abstract`, etc.) が反映されること
  - `operator` の enum 値 (`AND`, `OR`) が反映されること
- [ ] Verify test fails (Red)
- [ ] Create `src/query/json-schema.ts`
  ```typescript
  import * as z from 'zod';
  import { queryFileSchema } from './validator.js';

  export function generateQueryJSONSchema(): Record<string, unknown> {
    return z.toJSONSchema(queryFileSchema);
  }
  ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: JSON Schema がプログラムで生成できる

### Step 2: `query init` に `$schema` リンクと JSON Schema ファイル出力を追加

`query init -o <file>` 実行時に:
1. テンプレート先頭に `# yaml-language-server: $schema=./query.schema.json` を追加
2. 出力先と同じディレクトリに `query.schema.json` を生成

- [ ] Write test: `src/cli/commands/query/init.test.ts`
  - 生成テンプレートの1行目が `# yaml-language-server: $schema=./query.schema.json` であること
  - `-o` 指定時に同ディレクトリに `query.schema.json` が作成されること
  - `query.schema.json` が valid な JSON Schema であること
  - stdout 出力時（`-o` なし）は `$schema` コメントは付けるが JSON Schema ファイルは生成しない
- [ ] Verify test fails (Red)
- [ ] Implement:
  - `QUERY_TEMPLATE` の先頭に schema コメント行を追加
  - `-o` 指定時に `generateQueryJSONSchema()` の結果を同ディレクトリに書き出し
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `query init -o search.yaml` で `search.yaml` と `query.schema.json` が同ディレクトリに生成される

### Step 3: `query validate` で `$schema` リンクの有無を検出する

YAML ファイルの先頭コメントから `yaml-language-server: $schema=` の有無を検出する関数を作成。

- [ ] Write test: `src/cli/commands/query/validate.test.ts`
  - `$schema` リンクありの YAML で `hasSchemaLink: true` が返ること
  - `$schema` リンクなしの YAML で `hasSchemaLink: false` が返ること
  - YAML パース前（コメント行）で検出すること（スキーマバリデーションとは独立）
- [ ] Verify test fails (Red)
- [ ] Implement: `detectSchemaLink(filePath: string): Promise<boolean>`
  - ファイル先頭5行を読み取り `yaml-language-server.*\$schema=` にマッチするか検出
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `$schema` リンクの有無を正確に検出できる

### Step 4: `query validate` のガイダンス分岐を実装

`$schema` リンクの有無とバリデーション結果に基づき、suggestion ルールを更新。

- [ ] Write test: `src/cli/suggestions/rules.test.ts`
  - `$schema` なし + 成功 → info レベルで `query init` 推奨の suggestion
  - `$schema` なし + エラー → `query init` を含む強い推奨 suggestion
  - `$schema` あり + 成功 → 従来通り（`query init` 誘導なし）
  - `$schema` あり + エラー → 従来通り（`$EDITOR` 案内）
- [ ] Verify test fails (Red)
- [ ] Implement:
  - `SuggestionContext` に `hasSchemaLink?: boolean` を追加
  - `queryValidateRule` を更新して分岐ロジックを実装
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: 4パターンのガイダンスが正しく分岐する

### Step 5: `src/cli/index.ts` の validate アクションに suggestion を接続

現在 validate コマンドで `getSuggestion()` / `formatSuggestion()` が呼ばれていない。
他のコマンド（search, diff, merge 等）と同様に接続する。

- [ ] Write test: CLI integration test
  - validate 成功時に suggestion が出力されること
  - validate 失敗時に suggestion が出力されること
  - `--quiet` 時に suggestion が出力されないこと
- [ ] Verify test fails (Red)
- [ ] Implement: validate アクション内で `getSuggestion()` / `formatSuggestion()` を呼び出し
  - `hasSchemaLink` を `detectSchemaLink()` で取得し context に渡す
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: validate 実行後に適切な suggestion が表示される

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Write/update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - `query init -o` で生成したファイルに `$schema` コメントがあること
  - `query init -o` で `query.schema.json` が生成されること
  - `$schema` つきファイルの validate で `query init` 誘導が出ないこと
  - 手書き（`$schema` なし）ファイルの validate で `query init` 誘導が出ること
- [ ] Write/update E2E test: `src/cli/commands/query/init.e2e.test.ts`
  - 生成テンプレートの先頭に `$schema` があること
  - 生成テンプレートが `query validate` をパスすること
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: `query init -o` → `query validate` の一連のフローを手動確認
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- Zod v4 の `z.toJSONSchema()` は first-party 機能として利用可能（プロジェクトは Zod v4 使用）
- review YAML の `$schema` パターン（`src/cli/commands/review/extract.ts` 等）を参考にする
- JSON Schema ファイルはビルド成果物ではなく `query init` 実行時に動的生成する
  （Zod スキーマが source of truth であり、静的ファイルの同期問題を回避）
- stdout 出力時は JSON Schema ファイルの書き出し先がないため、`$schema` コメントは付けるが
  ファイルは生成しない。ユーザーが `-o` でファイル出力した場合のみ生成する
