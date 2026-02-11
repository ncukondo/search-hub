# Task: Improve $schema Absence Messaging in query validate

## Purpose

`query init` を使わずに手動作成した YAML を `query validate` した場合、
`$schema` リンク不在の案内が見落としやすい。

### 現状の問題

**成功時**: `query init` の案内が "See also:" セクション末尾に埋もれている。
```
See also:
  search-hub query init -o manual-query.yaml --force    # Enable editor completion via $schema
```

**失敗時**: `$EDITOR` と `query init --force` が "Next:" に並列表示され、
2つが代替手段であることが不明確。また `--force` は既存ファイルの上書きを意味するため危険。

### 改善方針

1. **成功時**: `Tip:` セクション（Next の前）でテンプレートからの作り直しを案内
2. **失敗時**: `Or` セクション（Next の後）で代替手段を明示
3. `--force` を使わず、新しいファイル名 (`query.yaml`) での作成を提案

`query init` のテンプレートには mesh/eric/emtree/exclude/filters/overrides のコメント付き
説明が含まれており、フォーマットを知らないユーザーにとって有用な参考になる。
そのため、成功時でも「テンプレートから作り直す」選択肢を見せることに価値がある。

### 期待する出力

**成功時（$schema なし）:**
```
✓ Valid query file: manual-query.yaml
  Name: diabetes_ai_search
  Blocks: 1

Tip: Start from a template to get $schema support and usage examples:
     search-hub query init -o query.yaml

Next:
  search-hub search manual-query.yaml --dry-run    # Check DB translations
  search-hub search manual-query.yaml --preview    # Preview hit counts + sample titles
```

**失敗時（$schema なし）:**
```
✗ Invalid query file: broken-structure.yaml

Errors:
  - query.0.field: Invalid option: expected one of "title"|"abstract"|...

Next:
  $EDITOR broken-structure.yaml    # Fix errors and re-validate

Or create a new query from the template:
  search-hub query init -o query.yaml
```

**成功時（$schema あり）: 変更なし**
```
Next:
  search-hub search query.yaml --dry-run    # Check DB translations
  search-hub search query.yaml --preview    # Preview hit counts + sample titles
```

**失敗時（$schema あり）: 変更なし**
```
Next:
  $EDITOR query.yaml    # Fix errors and re-validate
```

## Related Specs

- [spec/cli/suggestions.md](../cli/suggestions.md) — Next Step Suggestions 仕様（同時更新）

## Related Source Files

- `src/cli/suggestions/types.ts` — `SuggestionResult` 型定義
- `src/cli/suggestions/index.ts` — `formatSuggestion()` レンダリング
- `src/cli/suggestions/index.test.ts` — フォーマットテスト
- `src/cli/suggestions/rules.ts` — `queryValidateRule` ルール定義
- `src/cli/suggestions/rules.test.ts` — ルールテスト
- `src/cli/commands/query/validate.e2e.test.ts` — E2E テスト

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: `SuggestionResult` に `tip` フィールド追加 + レンダリング

`tip` はプレーンテキストのアドバイス。Next の前に表示される。
`formatSection` は使わず、文字列をそのまま出力する。

- [x] Write test: `src/cli/suggestions/index.test.ts`
  - `tip` が存在する場合に Next の前にレンダリングされることを検証
  - `tip` が undefined の場合は従来通りの出力であることを検証
- [x] Verify test fails (Red)
- [x] Implement:
  - `src/cli/suggestions/types.ts`: `SuggestionResult` に `tip?: string` 追加
  - `src/cli/suggestions/index.ts`: `formatSuggestion` で tip を sections の先頭に追加
    ```typescript
    export function formatSuggestion(result: SuggestionResult | null): string {
      if (result === null) return '';
      const sections: string[] = [];

      // Tip (before Next)
      if (result.tip) {
        sections.push(result.tip);
      }

      const nextSection = formatSection('Next', result.next);
      if (nextSection) sections.push(nextSection);

      const seeAlsoSection = formatSection('See also', result.seeAlso);
      if (seeAlsoSection) sections.push(seeAlsoSection);

      if (sections.length === 0) return '';
      return '\n' + sections.join('\n\n');
    }
    ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: tip が Next の前に正しく表示される

### Step 2: `SuggestionResult` に `or` フィールド追加 + レンダリング

`or` はカスタムラベル付きの代替セクション。Next の後、See also の前に表示される。

`or.items` の description が空の場合はコメント (`# ...`) を省略する。
`formatSection` を再利用するか、`or` 用の軽量フォーマットを用意する。

- [ ] Write test: `src/cli/suggestions/index.test.ts`
  - `or` が Next の後に表示されることを検証
  - `or.label` がセクションラベルとして使われることを検証
  - `or.items` の description が空の場合にコメントが省略されることを検証
  - `or` が undefined の場合は従来通りの出力であることを検証
- [ ] Verify test fails (Red)
- [ ] Implement:
  - `src/cli/suggestions/types.ts`: `SuggestionResult` に追加
    ```typescript
    or?: {
      label: string;      // e.g. "Or create a new query from the template"
      items: Suggestion[];
    };
    ```
  - `src/cli/suggestions/index.ts`: `formatSuggestion` で or を Next と See also の間に追加
    ```typescript
    if (result.or && result.or.items.length > 0) {
      // description が空の item はコマンドのみ表示
      const lines = result.or.items.map((s) =>
        s.description ? `  ${s.command}    # ${s.description}` : `  ${s.command}`
      );
      sections.push(`${result.or.label}:\n${lines.join('\n')}`);
    }
    ```
    ※ Next の push の後、See also の push の前に配置
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: or セクションが正しいラベルとフォーマットで表示される

### Step 3: `queryValidateRule` 更新 — 成功時 (tip)

成功 + $schema なしの場合、従来の `seeAlso` への query init 追加を `tip` に変更する。
`--force` は使わず、新しいファイル名 `query.yaml` を提案する。

- [ ] Write test: `src/cli/suggestions/rules.test.ts`
  - 成功 + $schema なし: `tip` が定義されており "query init" を含むことを検証
  - 成功 + $schema なし: `tip` が `query.yaml` を含むことを検証（新規作成）
  - 成功 + $schema なし: `tip` が `--force` を含まないことを検証
  - 成功 + $schema なし: `seeAlso` が空であることを検証（旧: query init が入っていた）
  - 成功 + $schema あり: `tip` が undefined であることを検証（変更なし）
- [ ] Verify test fails (Red)
- [ ] Implement: `src/cli/suggestions/rules.ts` の `queryValidateRule` 成功パスを修正
  ```typescript
  // 成功パス
  const next = [
    { command: `search-hub search ${file} --dry-run`, description: 'Check DB translations' },
    { command: `search-hub search ${file} --preview`, description: 'Preview hit counts + sample titles' },
  ];

  if (ctx.hasSchemaLink === false) {
    return {
      tip: 'Tip: Start from a template to get $schema support and usage examples:\n'
         + '     search-hub query init -o query.yaml',
      next,
      seeAlso: [],
    };
  }

  return { next, seeAlso: [] };
  ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: 成功 + $schema なしで Tip が Next の前に表示される

### Step 4: `queryValidateRule` 更新 — 失敗時 (or)

失敗 + $schema なしの場合、従来の `next` への query init 追加を `or` に変更する。
`--force` は使わず、新しいファイル名 `query.yaml` を提案する。

- [ ] Write test: `src/cli/suggestions/rules.test.ts`
  - 失敗 + $schema なし: `next` が `$EDITOR` のみ（1件）であることを検証
  - 失敗 + $schema なし: `or` が定義されており "query init" を含むことを検証
  - 失敗 + $schema なし: `or.label` が "Or" で始まることを検証
  - 失敗 + $schema なし: `or.items[0].command` が `--force` を含まないことを検証
  - 失敗 + $schema あり: `or` が undefined で、`next` が `$EDITOR` のみであることを検証
- [ ] Verify test fails (Red)
- [ ] Implement: `src/cli/suggestions/rules.ts` の `queryValidateRule` 失敗パスを修正
  ```typescript
  if (ctx.validationSuccess === false) {
    const next = [{ command: `$EDITOR ${file}`, description: 'Fix errors and re-validate' }];

    if (ctx.hasSchemaLink === false) {
      return {
        next,
        or: {
          label: 'Or create a new query from the template',
          items: [{ command: 'search-hub query init -o query.yaml', description: '' }],
        },
        seeAlso: [],
      };
    }

    return { next, seeAlso: [] };
  }
  ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: 失敗 + $schema なしで "Or" セクションが Next の後に表示される

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - 成功 + $schema なしの CLI 出力に "Tip:" が含まれることを確認
  - 失敗 + $schema なしの CLI 出力に "Or create" が含まれることを確認
  - 出力に `--force` が含まれないことを確認
  - 出力に `query.yaml` が含まれることを確認
  - 既存の $schema 関連テストを新フォーマットに合わせて更新
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: 手動で $schema なし YAML を validate し出力を確認
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- `SuggestionResult` への `tip` / `or` 追加は後方互換（optional フィールド）
- 既存の全ルール（23個）は `tip` / `or` を返さないため影響なし
- `formatSection` は description が常に存在する前提のため、`or` セクションでは
  description 空の場合の処理を別途実装する
- `spec/cli/suggestions.md` の更新も本タスクに含む（Step 5 相当だが非コード変更）
