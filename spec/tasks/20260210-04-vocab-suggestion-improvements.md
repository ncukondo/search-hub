# Task: Vocab Validator Suggestion Improvements

## Purpose

`query validate --vocab` で無効な MeSH 用語が検出されても「not found」としか表示されず、
正しい用語へのサジェスチョンが出ない。タイプミス・複数形・スペースの違いなどに対応する
ファジーマッチ戦略を導入し、ユーザーがエラーを頼りにクエリを改善できるようにする。

また、`query validate`（`--vocab` なし）成功時の next step suggestion で、
クエリに統制語（mesh/emtree/eric）が含まれている場合のみ `--vocab` を提案する。

### 改善事項

1. **ファジーサジェスチョン** — `MeSHLookupClient.lookupTerm` の `startsWith` フォールバックが
   タイプミスや複数形でヒットしない。`contains` マッチや用語の先頭部分での `startsWith` 等、
   追加のフォールバック戦略を実装してサジェスチョンを返す。
2. **Next step に `--vocab` を条件付き提案** — `query validate` 成功後、クエリ AST に
   統制語（`mesh`/`emtree`/`eric`）が含まれる場合、`query validate --vocab` を seeAlso として提案する。
   `ValidateResult` に `hasControlledVocab` フラグを追加して suggestion ルールで利用する。

## Related Specs

- [spec/tasks/completed/20260210-02-validate-controlled-vocabulary.md](completed/20260210-02-validate-controlled-vocabulary.md) - 元タスク
- [spec/tasks/completed/20260210-03-vocab-validator-improvements.md](completed/20260210-03-vocab-validator-improvements.md) - 前回改善

## Related Source Files

- `src/query/mesh-lookup.ts` — MeSH Lookup APIクライアント（#1 対応）
- `src/query/mesh-lookup.test.ts` — 単体テスト
- `src/cli/commands/query/validate.ts` — ValidateResult 型（#2 対応）
- `src/cli/commands/query/validate.test.ts` — 単体テスト
- `src/cli/suggestions/rules.ts` — next step suggestion ルール（#2 対応）
- `src/cli/suggestions/rules.test.ts` — ルールテスト
- `src/cli/suggestions/types.ts` — SuggestionContext 型
- `src/cli/index.ts` — CLI コマンド定義（context 生成箇所）

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Improve `lookupTerm` fuzzy suggestion strategy

現状の `lookupTerm` は `exact` → `startsWith`（用語全体）のみ。
タイプミスや複数形に対応するため、追加のフォールバックを実装する。

戦略案（順に試行、最初にヒットしたものを採用）：
1. `exact` — 完全一致
2. `startsWith`（用語全体）— 現状通り
3. `contains`（用語全体）— 部分一致で候補を探す
4. `startsWith`（先頭N単語）— 複数語の用語で末尾が違う場合に対応

- [x] Write test: `src/query/mesh-lookup.test.ts`
  - タイプミス（例: "Artificial Intelligense"）でサジェスチョンが返ることを検証
  - 複数形（例: "Drug Therapies" → "Drug Therapy"）でサジェスチョンが返ることを検証
  - スペース違い（例: "Cardio Vascular Disease" → "Cardiovascular Diseases"）でサジェスチョンが返ることを検証
  - 完全一致時は従来通り `found: true` を返す
  - `startsWith` で見つかる場合は従来通りの動作
- [x] Verify test fails (Red)
- [x] Implement: `lookupTerm` にフォールバック戦略を追加
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: タイプミス・複数形・表記揺れに対してサジェスチョンが返る

### Step 2: Display suggestions in CLI output

`formatVocabValidationOutput` で `suggestions` がある場合に表示する。

- [x] Write test: `src/cli/commands/query/validate.test.ts`
  - `suggestions` がある場合、「Did you mean: ...」のような形式で表示されることを検証
- [x] Verify test fails (Red) — already implemented in prior task
- [x] Implement: `formatVocabValidationOutput` でサジェスチョン表示を追加
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: 無効な用語の後にサジェスチョンが表示される

### Step 3: Add `hasControlledVocab` to `ValidateResult`

`validateQueryCommand` で AST の `blocks[].terms` に `mesh`/`emtree`/`eric` が
含まれるか判定し、`ValidateResult.hasControlledVocab` フラグを返す。

- [x] Write test: `src/cli/commands/query/validate.test.ts`
  - MeSH 用語を含むクエリで `hasControlledVocab: true` が返ることを検証
  - キーワードのみのクエリで `hasControlledVocab: false` が返ることを検証
- [x] Verify test fails (Red)
- [x] Implement: `ValidateResult` にフラグ追加、`validateQueryCommand` で判定
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: 統制語の有無を判定できる

### Step 4: Conditional `--vocab` suggestion in next steps

`queryValidateRule` で、`validationSuccess && hasControlledVocab && !vocabChecked` の場合に
`query validate --vocab` を seeAlso として提案する。

- [x] Write test: `src/cli/suggestions/rules.test.ts`
  - 統制語あり・vocabチェック未実施 → seeAlso に `--vocab` 提案
  - 統制語なし → `--vocab` 提案なし
  - 既に `--vocab` チェック済み → `--vocab` 提案なし
- [x] Verify test fails (Red)
- [x] Implement: `SuggestionContext` に `hasControlledVocab` と `vocabChecked` を追加、ルール更新
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: 条件に応じて `--vocab` が適切に提案される

### Step 5: Wire context in CLI

`src/cli/index.ts` の validate コマンドで、suggestion context に `hasControlledVocab` と
`vocabChecked` を渡す。

- [x] Write test: E2E テストで validate 後に `--vocab` 提案が出ることを確認 (in Final Step)
- [x] Verify test fails (Red)
- [x] Implement: CLI コマンド内で context を生成して `getSuggestion` に渡す
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: CLI 実行時に統制語の有無に応じた next step が表示される

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - ファジーサジェスチョンが E2E で正しく表示されることを確認
  - next step suggestion の E2E テスト
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- E2E integration tests are critical - Mock-based unit tests often miss real-world issues
- MeSH API の `contains` マッチは結果が多くなる可能性があるため、`limit` パラメータで絞る
- サジェスチョンは最大5件程度に制限する
- `contains` は NLM API の負荷が上がるため、`startsWith` で見つからなかった場合のみ試行
- RateLimiter（3 req/s）が有効なため、フォールバック戦略の追加リクエストもレート制限される
