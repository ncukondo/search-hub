# Task: Next Step Suggestions

## Purpose

各コマンド実行後に、ワークフロー上の次のアクションを文脈に応じて提案する機能。
ユーザーがワークフロー全体を把握していなくても、CLIが適切な案内を行う。

既存の個別 tip 関数（`formatSearchCompletionTip` 等）を統一的なシステムに置き換える。

## Related Specs

- [spec/cli/suggestions.md](../../cli/suggestions.md) - 仕様（コマンド別 suggestion マップ、設計判断）
- [spec/cli/commands.md](../../cli/commands.md) - CLI コマンド仕様

## Dependencies

- Task 56 (Screening Workflow Improvement) — Phase 4 の suggestion は `basis` フィールドと
  `review extract --name` に依存する。Phase 1-3, 5 は独立して実装可能。

## Related Source Files

- `src/cli/suggestions/index.ts` (new)
- `src/cli/suggestions/types.ts` (new)
- `src/cli/suggestions/rules.ts` (new)
- `src/cli/suggestions/conditions.ts` (new)
- `src/cli/suggestions/index.test.ts` (new)
- `src/cli/index.ts` - 各コマンドアクションへの統合
- `src/cli/commands/search.ts` - 既存 tip 関数の置き換え元
- `src/cli/commands/register.ts` - 既存 tip 関数の置き換え元

## Implementation Steps

### Step 1: Suggestion 基盤（型定義とフォーマッタ）

- [x] Write test: `src/cli/suggestions/index.test.ts`
  - `formatSuggestion()` が Next / See also を正しくフォーマットする
  - Next のみ、See also のみ、両方あり、空のケースをテスト
- [x] Create types: `src/cli/suggestions/types.ts`
  - `Suggestion`, `SuggestionResult`, `SuggestionContext` を定義
- [x] Create formatter: `src/cli/suggestions/index.ts`
  - `formatSuggestion(result: SuggestionResult): string` を実装
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `formatSuggestion()` が仕様通りのフォーマットで出力する

### Step 2: Phase 1 - Query Preparation の suggestion ルール

- [x] Write test: suggestion rules for `query init`, `query validate`, `query translate`
  - Static な suggestion が正しく返される
  - `query validate` 失敗時にエディタ起動を提案
- [x] Implement rules in `src/cli/suggestions/rules.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: query 系コマンドの suggestion が仕様通り

### Step 3: Phase 2 - Search Execution の suggestion ルール

- [x] Write test: suggestion rules for `search` (各モード)
  - `--dry-run`, `--preview`, `--count-only`: Static な suggestion
  - 全文検索: completed → `results`, partial → `resume`, failed → `resume --retry-failed`
  - `--query` 直接モード: YAML化推奨の追加
  - 他セッション存在時の `diff` 提案 (Conditional)
- [x] Implement rules
- [x] Implement conditions: `src/cli/suggestions/conditions.ts`
  - `hasOtherSessions()`: 他セッションの存在チェック
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: search 系コマンドの suggestion が仕様通り

### Step 4: Phase 3 - Result Analysis の suggestion ルール

- [x] Write test: suggestion rules for `status`, `results`, `summary`, `diff`
  - `results` / `summary`: reviews.yaml 有無で分岐 (Conditional)
  - `status`: セッション状態で分岐 (State-dependent)
  - `diff`: Static な See also
- [x] Implement rules and conditions
  - `hasReviewFile()`: reviews.yaml の存在チェック
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: result analysis 系コマンドの suggestion が仕様通り

### Step 5: CLI コマンドへの統合と既存 tip の置き換え

- [x] 各コマンドのアクション末尾に `formatSuggestion()` 呼び出しを追加
  - `--quiet` 時は抑制
- [x] 既存の tip 関数を suggestion システムに移行:
  - `formatSearchCompletionTip()` → search completed ルール
  - `formatCountOnlyTip()` → search --count-only ルール
  - `formatDirectQueryTip()` → search --query ルール
  - `formatReviewWorkflowTip()` → register ルール
- [x] 既存 tip 関数と呼び出し元を削除
- [x] 既存の tip テストを新しいテストに移行
- [x] Run `npm run lint && npm run typecheck`
- [x] Run `npm test`
- [x] Acceptance: 既存 tip と同等以上の suggestion が新システムから出力される

### Step 6: `--help` ワークフローガイドの追加

- [x] メインコマンドの `--help` に Workflow セクションを追加
- [x] 主要サブコマンドの `--help` に Workflow position を追加
- [x] Run `npm test`（既存の help テストが壊れていないか確認）
- [x] Acceptance: `--help` にワークフロー全体像が表示される

### Step 7: Phase 4 - Review Workflow の suggestion ルール（Task 56 依存）

**注意**: このステップは Task 56 完了後に実装する。

- [x] Write test: suggestion rules for review 系コマンド
  - `review init`: Static → extract --basis title
  - `review status`: basis 別フェーズ判定 (State-dependent)
    - pending > 0 → extract --basis title
    - title 完了, abstract 未開始 → extract --basis abstract
    - abstract 進行中 → extract --basis abstract --filter pending
    - conflicting > 0 → list --filter conflicting
    - needs-final > 0 → list --filter needs-final
    - 全件 finalized → register --reviewed
  - `review extract`: mark / merge を提案
  - `review merge`: status を提案
- [x] Implement rules and conditions
  - `getReviewPhase()`: basis 別の進行状況からフェーズを判定
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: review 系コマンドの suggestion が仕様通り

### Step 8: Phase 5 - Registration & Export の suggestion ルール

- [x] Write test: suggestion rules for `export`, `register`, `notes`
  - `export`: reviews.yaml 無しの場合のみ review init 提案
  - `register`: Terminal state（suggestion なし）、reviews.yaml 無しの場合のみ提案
  - `notes add/assess`: Static な See also
- [x] Implement rules
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: export/register 系コマンドの suggestion が仕様通り

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/cli/suggestions/suggestions.e2e.test.ts`
  - 実際の CLI 実行で suggestion が出力されるか
  - `--quiet` で抑制されるか
  - セッション状態に応じた動的 suggestion が正しいか
  - 既存 tip が新システムに完全に置き換わっているか
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: 主要ワークフロー（query init → search → results → review）を手動実行し、各ステップで suggestion が表示されることを確認
- [ ] Acceptance: All tests pass, feature works in real usage

## TDD Cycle Reference

```
┌─────────────────────────────────────────────────────┐
│  1. Write Test (Red)                                │
│     - Write test that describes expected behavior   │
│     - Run test → should FAIL                        │
├─────────────────────────────────────────────────────┤
│  2. Implement (Green)                               │
│     - Write minimal code to pass test               │
│     - Run test → should PASS                        │
├─────────────────────────────────────────────────────┤
│  3. Refactor                                        │
│     - npm run lint                                  │
│     - npm run typecheck                             │
│     - Clean up code if needed                       │
│     - Run test → should still PASS                  │
└─────────────────────────────────────────────────────┘
```

## Notes

- Step 1-6, 8 は Task 56 に依存せず実装可能
- Step 7 (Review Workflow) は Task 56 完了後に実装する
- 既存の tip テスト（`search.test.ts`, `register.test.ts`）は Step 5 で移行・削除する
- `review extract` の `--name` オプションとセッション内管理は Task 56 の範囲
