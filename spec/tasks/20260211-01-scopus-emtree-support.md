# Task: Scopus Emtree Support & Unsupported Vocab Warnings

## Purpose

Scopus translator (`src/providers/scopus/translator.ts`) は現在 `keywords` のみを使用しており、
`emtree` (Embase Thesaurus) を完全に無視している。Scopus は Embase のインデクシングデータを含んでおり、
Emtree term を `INDEXTERMS()` フィールド等で検索可能。

Task #104 で `keywords` がオプションになったことで、emtree のみのブロックが Scopus で
空クエリ `TITLE-ABS-KEY()` を生成する問題が顕在化した。

また、各 provider が対応していない統制語が含まれる場合に警告がない。
例えば arXiv に mesh を含むブロックを指定すると、mesh term が黙って無視される。

### 対応項目

1. **Scopus translator に Emtree サポートを追加**: `emtree` 配列の term を適切なフィールドで検索
2. **未対応統制語の警告**: provider が対応していない統制語がブロックに含まれる場合に警告
   （mesh-only ブロックだけでなく、keywords + mesh のブロックでも provider が mesh 非対応なら警告）

### 各 provider の統制語対応状況

| Provider | MeSH | Emtree | ERIC Descriptors | 備考 |
|----------|------|--------|------------------|------|
| PubMed   | ✅ `[mh]` | ❌ | ❌ | |
| Scopus   | ❌ | ❌→✅ (本タスク) | ❌ | Embase データを含む |
| ERIC     | ❌ | ❌ | ✅ `subject:` | |
| arXiv    | ❌ | ❌ | ❌ | 統制語なし（プレプリントサーバー） |

### 警告の例

```
⚠ arXiv does not support MeSH terms — mesh terms in block 1 will be ignored
⚠ ERIC does not support Emtree terms — emtree terms in block 2 will be ignored
⚠ Scopus does not support MeSH terms — mesh terms in block 1 will be ignored
```

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL 仕様（term block 定義）
- [spec/tasks/20260210-09-optional-keywords-in-term-block.md](20260210-09-optional-keywords-in-term-block.md) - Task #104（keywords optional 化）

## Related Source Files

- `src/providers/scopus/translator.ts` — Scopus クエリ変換（Emtree サポート追加）
- `src/providers/scopus/translator.test.ts` — テスト
- `src/query/validator.ts` — バリデーション
- `src/providers/arxiv/translator.ts` — arXiv（統制語非対応の明示的ハンドリング参考）
- `src/cli/index.ts` — validate / dry-run コマンド（警告表示箇所）

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Scopus translator に Emtree term サポートを追加

- [x] Write test: `src/providers/scopus/translator.test.ts`
  - emtree のみのブロックで正しいクエリが生成されること
  - keywords + emtree 両方のブロックで正しくクエリが生成されること
  - emtree term のフィールドマッピングが正しいこと
- [x] Verify test fails (Red)
- [x] Implement: `translateBlock()` で `terms.emtree` を処理
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Emtree term が Scopus クエリに反映される

### Step 2: 未対応統制語の警告

provider が対応していない統制語がブロックに含まれる場合に警告を出す。
keywords の有無に関わらず、未対応統制語が含まれていれば常に警告する。

- [x] Write test
  - arXiv + mesh を含むブロック → 警告が出ること
  - arXiv + keywords + mesh のブロック → 警告が出ること（keywords があっても警告）
  - Scopus + mesh を含むブロック → 警告が出ること
  - PubMed + emtree を含むブロック → 警告が出ること
  - PubMed + mesh → 警告なし（対応済み）
  - Scopus + emtree → 警告なし（本タスクで対応済み）
  - ERIC + eric → 警告なし（対応済み）
- [x] Verify test fails (Red)
- [x] Implement
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: 未対応統制語に対して適切な警告が表示される

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Write E2E test
  - Emtree term を含む Scopus クエリが正しく変換されること
  - 未対応統制語の警告が表示されること
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Emtree term を含む YAML で validate → translate を確認
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- Scopus API の Emtree 検索フィールドは `INDEXTERMS()` が候補だが、API ドキュメントで確認が必要
- arXiv の統制語非対応は明示的にコメント済み（L74）。Scopus にも同様のコメントを追加すること
