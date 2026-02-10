# Task: Make `keywords` Optional in Term Block Schema

## Purpose

現在 `termBlockSchema` で `keywords` が必須（`z.array(z.string()).min(1)`）だが、
MeSH term のみでクエリブロックを構成したいケースに対応できない。

例えば以下の YAML はバリデーションエラーになる:
```yaml
query:
  - field: title_abstract
    terms:
      mesh:
        - "Artificial Intelligence"
    operator: OR
```

```
✗ query.1.terms.keywords: Invalid input: expected array, received undefined
```

統制語のみのブロックは systematic review で一般的なパターンであり、対応が必要。

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL 仕様（term block 定義）

## Related Source Files

- `src/query/validator.ts` — `termBlockSchema` の Zod 定義
- `src/query/validator.test.ts` — バリデーションテスト
- `src/providers/pubmed/translator.ts` — PubMed クエリ変換（keywords なしの場合の影響確認）
- `src/providers/eric/translator.ts` — ERIC クエリ変換
- `src/providers/arxiv/translator.ts` — arXiv クエリ変換
- `src/providers/scopus/translator.ts` — Scopus クエリ変換

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: `keywords` をオプションにし、最低1種の用語を必須にする

- [x] Write test: `src/query/validator.test.ts`
  - `mesh` のみ（`keywords` なし）のブロックが valid であること
  - `eric` のみのブロックが valid であること
  - `keywords` のみのブロックが valid であること（既存動作の維持）
  - `keywords`, `mesh`, `eric`, `emtree` のすべてが欠けたブロックが invalid であること
  - エラーメッセージが "At least one of keywords, mesh, emtree, or eric is required" であること
- [x] Verify test fails (Red)
- [x] Implement: `src/query/validator.ts`
  ```typescript
  const termBlockSchema = z.object({
    keywords: z.array(z.string()).min(1).optional(),
    mesh: z.array(z.string()).optional(),
    emtree: z.array(z.string()).optional(),
    eric: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  }).refine(
    (data) => data.keywords || data.mesh || data.emtree || data.eric,
    { message: 'At least one of keywords, mesh, emtree, or eric is required' }
  );
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: keywords なしの MeSH-only ブロックが valid

### Step 2: 各 provider translator が keywords なしでも正しく動作することを確認

keywords が `undefined` の場合にクエリ変換が壊れないことを確認する。

- [x] Write test: 各 translator のテストファイル
  - `keywords: undefined, mesh: ["Artificial Intelligence"]` のブロックで
    正しいクエリ文字列が生成されることを検証（PubMed, ERIC, arXiv, Scopus）
  - keywords と mesh 両方ある場合の既存動作が維持されることを検証
- [x] Verify test fails (Red)
- [x] Implement: 各 translator で `keywords` が undefined の場合のハンドリングを追加
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: 全 provider で keywords なしのブロックが正しくクエリ変換される

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Write E2E test: `src/query/validator.e2e.test.ts` or update `validate.e2e.test.ts`
  - MeSH のみのクエリファイルが validate をパスすること
  - MeSH のみのクエリで `query translate` が正しく動作すること
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: MeSH のみの YAML を作成し validate → translate の一連のフローを確認
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- `QueryAST` の `TermBlock.keywords` の型も `string[]` から `string[] | undefined` に変更が必要
- 各 provider translator での `block.terms.keywords` アクセスに null チェックが必要になる
- `query init` テンプレートは現状通り keywords 入りのまま維持する（最も一般的なケース）
