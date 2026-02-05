# Task: Review Extract Session-Internal Management

## Purpose

`review extract` の出力先をセッションディレクトリ内に固定し、作業ファイルの管理を体系化する。
現在の任意パス指定（`-o <path>`）から、セッション内管理（`--name <name>`）に変更する。

これにより:
- `review status` が作業ファイルの存在・状態を把握できる
- AI エージェントが規約ベースでファイルを発見できる
- suggestion システム（タスク57）がより具体的な提案を生成できる
- セッション単位での管理が一貫する

pre-release のため後方互換は不要。

## Related Specs

- [spec/cli/suggestions.md](../../cli/suggestions.md) - Phase 4 セクション（セッション内管理の設計）

## Related Source Files

- `src/cli/commands/review/extract.ts` - extract コマンド実装
- `src/cli/commands/review/extract.test.ts`
- `src/cli/commands/review/merge.ts` - merge コマンド実装
- `src/cli/commands/review/merge.test.ts`
- `src/cli/commands/review/status.ts` - status 表示
- `src/cli/commands/review/status.test.ts`
- `src/cli/commands/review/types.ts` - ReviewStatusResult 型
- `src/cli/commands/review/review-workflow.test.ts` - E2E テスト
- `src/cli/index.ts` - CLI コマンド定義

## 変更概要

### ディレクトリ構造

```
sessions/<session-id>/
├── session.json
├── .internal/reviews.yaml            ← マスター
└── for-review/
    ├── title-screening/
    │   └── review.yaml               ← extract --name title-screening
    ├── abstract-screening/
    │   └── review.yaml
    └── reviewer-a/
        └── review.yaml
```

### CLI インターフェース変更

| コマンド | Before | After |
|---------|--------|-------|
| `extract` | `-o, --output <path>` (required) | `--name <name>` (required) |
| `merge` | `<file>` (positional arg) | `--name <name>` (required option) |
| `mark` | `--file <path>` (変更なし) | `--file <path>` (変更なし、パスが変わるだけ) |

### extract 出力パスの解決

```
--name title-screening
→ sessions/<session-id>/for-review/title-screening/review.yaml
```

### merge 入力パスの解決

```
--name title-screening
→ sessions/<session-id>/for-review/title-screening/review.yaml
```

## Implementation Steps

### Step 1: extract コマンドの `--name` 対応

- [ ] Write test: `src/cli/commands/review/extract.test.ts`
  - `--name` 指定時に `for-review/<name>/review.yaml` に出力される
  - `--name` が必須であること
  - name に使えない文字（`/`, `..` 等）のバリデーション
- [ ] Verify test fails (Red)
- [ ] `ReviewExtractOptions` の `output: string` を `name: string` に変更
- [ ] `executeReviewExtract` で出力パスを `join(sessionDir, 'for-review', name, 'review.yaml')` に解決
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: extract が `for-review/<name>/review.yaml` に出力する

### Step 2: merge コマンドの `--name` 対応

- [ ] Write test: `src/cli/commands/review/merge.test.ts`
  - `--name` 指定時に `for-review/<name>/review.yaml` から読み込む
  - ファイルが存在しない場合のエラー
- [ ] Verify test fails (Red)
- [ ] `ReviewMergeOptions` の `file: string` を `name: string` に変更
- [ ] `executeReviewMerge` で入力パスを `join(sessionDir, 'for-review', name, 'review.yaml')` に解決
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: merge が `for-review/<name>/review.yaml` から読み込む

### Step 3: CLI 定義の更新（index.ts）

- [ ] `review extract`: `-o, --output <path>` → `--name <name>` に変更
- [ ] `review merge`: `<file>` positional → `--name <name>` required option に変更
- [ ] ヘルプテキスト・examples を更新
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: CLI ヘルプが新しいインターフェースを表示する

### Step 4: review status の basis 別内訳追加

- [ ] Write test: `src/cli/commands/review/status.test.ts`
  - `ReviewStatusResult` に `titleReviewed`, `abstractReviewed` が含まれる
  - `formatStatusOutput` が basis 別内訳を表示する
- [ ] Verify test fails (Red)
- [ ] `ReviewStatusResult` に `titleReviewed: number`, `abstractReviewed: number` を追加
- [ ] `executeReviewStatus` で basis 別のカウントロジックを実装
- [ ] `formatStatusOutput` の表示を更新
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: status 出力に `Reviewed: 22 (title: 22, abstract: 0)` が表示される

### Step 5: review status の AI Workflow ガイド更新

- [ ] `formatStatusOutput` の AI Agent Workflow セクションを `--name` ベースに更新
- [ ] テスト更新
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: status の Workflow ガイドが `--name` を使用

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/cli/commands/review/review-workflow.test.ts` に追加
  - extract → mark → merge の一連のフローが `for-review/` 内で完結する
  - merge 後に `for-review/<name>/review.yaml` が正しく読み込まれる
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: extract --name → mark → merge --name の手動実行
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

- pre-release のため後方互換は不要。`-o` オプションは削除する。
- `review mark --file` のパスは変更しない（ユーザーがフルパスまたは相対パスで指定）
- タスク57（Next Step Suggestions）の Phase 4 はこのタスク完了後に実装する
