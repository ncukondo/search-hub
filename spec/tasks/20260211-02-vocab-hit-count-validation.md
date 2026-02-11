# Task: Controlled Vocabulary Hit Count Validation

## Purpose

MeSH は NLM API で term の存在確認が可能だが、ERIC Descriptors と Emtree には
公開バリデーション API がない。タイポや存在しない term を検出する手段がなく、
ユーザーは検索結果が 0 件になるまで気づけない。

API のない統制語について、各 provider で単独 count-only 検索を実行し、
hit 数 0 の term に警告を出すことで簡易バリデーションを実現する。

### バリデーション方式の比較

| 統制語 | 方式 | 精度 | 速度 |
|--------|------|------|------|
| MeSH | NLM API lookup（既存） | 高（exact match + suggestion） | 高（軽量 API） |
| ERIC Descriptors | count-only 検索（本タスク） | 中（hit 0 のみ検出） | 中（検索 API） |
| Emtree | count-only 検索（本タスク） | 中（hit 0 のみ検出） | 中（検索 API） |

### 警告の例

```
⚠ ERIC descriptor "Medcial Education" returned 0 results — possible typo?
  Did you mean: "Medical Education"?  (if suggestion available)
⚠ Emtree term "diabetis mellitus" returned 0 results on Scopus — possible typo?
```

## Related Specs

- [spec/tasks/20260211-01-scopus-emtree-support.md](20260211-01-scopus-emtree-support.md) - Task #107（Emtree サポート・前提タスク）
- [spec/tasks/completed/20260210-05-default-vocab-validation-with-cache.md](completed/20260210-05-default-vocab-validation-with-cache.md) - Task #100（MeSH バリデーション）

## Related Source Files

- `src/query/vocab-validator.ts` — 現在の MeSH バリデーション（拡張対象）
- `src/providers/eric/provider.ts` — ERIC count-only 検索
- `src/providers/scopus/provider.ts` — Scopus count-only 検索
- `src/cli/commands/search-executor.ts` — count-only 検索の実行パターン参考

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: VocabTerm の vocabulary 型を拡張

- [x] Write test: `src/query/vocab-validator.test.ts`
  - `VocabTerm.vocabulary` が `'mesh' | 'eric' | 'emtree'` を受け付けること
  - `extractControlledVocabTerms()` が eric / emtree term も抽出すること
- [x] Verify test fails (Red)
- [x] Implement: vocabulary 型を union に拡張、extractControlledVocabTerms を更新
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: 全統制語が抽出される

### Step 2: count-only 検索による hit 数チェック

- [x] Write test
  - ERIC descriptor を単独で count-only 検索し hit 数 0 で警告
  - Emtree term を Scopus で count-only 検索し hit 数 0 で警告
  - hit 数 > 0 の term には警告なし
  - レート制限・キャッシュが適用されること
- [x] Verify test fails (Red)
- [x] Implement
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: hit 数 0 の統制語に警告が出る

### Step 3: `query validate` に統合

- [ ] Write test
  - `query validate` 実行時に ERIC/Emtree term の hit 数チェックが行われること
  - `--no-vocab` で全てのチェックがスキップされること
  - キャッシュにより2回目以降は高速であること
- [ ] Verify test fails (Red)
- [ ] Implement
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: validate コマンドで hit 数チェックが動作する

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Write E2E test
  - 存在する ERIC descriptor で警告なし
  - 存在しない ERIC descriptor で警告
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: タイポを含む YAML で validate を実行し警告を確認
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- count-only 検索は provider の `search()` を `countOnly: true` で呼ぶ（Task #39 で実装済み）
- API 呼び出し数を制限するため、ファイルベースキャッシュ（Task #100 パターン）を適用する
- Scopus は API キー必須のため、キーがない場合は Emtree チェックをスキップする
- MeSH の NLM API lookup は引き続き既存方式を使用（count-only より高精度）
- 本タスクは Task #107（Scopus Emtree サポート）完了後に実施
