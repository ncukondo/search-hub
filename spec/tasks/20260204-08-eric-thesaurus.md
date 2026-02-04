# Task: ERIC Thesaurus (Descriptors) Support

## Purpose

PubMedのMeSH用語と同様に、ERICでも統制語彙（ERIC Descriptors）を使用できるようにする。
これにより、ERICでの検索精度が向上し、教育分野の文献を効果的に検索できるようになる。

**背景**:
- 現在のTermBlockには`mesh`（PubMed）と`emtree`（Embase）があるが、ERIC用がない
- ERICには独自の統制語彙（ERIC Thesaurus/Descriptors）があり、`subject:`フィールドで検索可能
- 医学教育×AIの検索テストで、ERICのヒット数が少なかった原因の一つ

## Related Specs

- [spec/query.md](../query.md) - Query DSL
- [spec/providers/eric.md](../providers/eric.md) - ERIC provider

## Related Source Files

- `src/query/types.ts` - TermBlock interface
- `src/query/parser.ts` - YAML parsing
- `src/query/validator.ts` - Query validation
- `src/providers/eric/translator.ts` - ERIC query translation
- `docs/query-guide.md` - User documentation

## Implementation Steps

### Step 1: Add `eric` field to TermBlock interface

- [x] Write test: `src/query/types.test.ts`
  - TermBlockが`eric`プロパティを持つことを型レベルで確認
- [x] Update `src/query/types.ts`
  - TermBlockに`eric?: string[]`を追加
  - JSDocコメントで「ERIC Descriptors (ERIC only)」と記載
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: TermBlockにericプロパティが存在する

### Step 2: Parse `eric` field from YAML

- [x] Write test: `src/query/parser.test.ts`
  - `eric`フィールドを含むYAMLが正しくパースされることを確認
  - 空配列、単一要素、複数要素のケースをテスト
- [x] Update `src/query/parser.ts`
  - `eric`フィールドのパース処理を追加
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: YAMLの`eric`フィールドがTermBlockに正しく格納される

### Step 3: Validate `eric` field

- [x] Write test: `src/query/validator.test.ts`
  - `eric`フィールドが文字列配列であることを検証
  - 空文字列を含む場合のエラーをテスト
- [x] Update `src/query/validator.ts`
  - `eric`フィールドのバリデーション追加
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 不正な`eric`フィールドでバリデーションエラー

### Step 4: Translate ERIC Descriptors to query syntax

- [x] Write test: `src/providers/eric/translator.test.ts`
  - `eric`用語が`subject:"term"`形式に変換されることを確認
  - keywordsとericの両方がある場合、ORで結合されることを確認
  - 例: `keywords: ["medical education"], eric: ["Medical Education"]`
    → `(title:"medical education" OR description:"medical education") OR subject:"Medical Education"`
- [x] Update `src/providers/eric/translator.ts`
  - translateBlock関数で`terms.eric`を処理
  - ディスクリプタは`subject:"term"`形式で出力
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: ERICディスクリプタが正しくクエリに変換される

### Step 5: Update documentation

- [x] Update `docs/query-guide.md`
  - TermBlockセクションに`eric`フィールドの説明を追加
  - 使用例を追加
- [x] Update query template in `src/cli/commands/query.ts`
  - `query init`で生成されるテンプレートに`eric`のコメント例を追加
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: ドキュメントとテンプレートが更新されている

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/providers/eric/eric.e2e.test.ts`
  - `eric`ディスクリプタを含むクエリで実際にERIC APIを呼び出す
  - 結果が返ることを確認（ヒット数 > 0）
- [ ] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - `eric`フィールドを含むYAMLファイルでCLI検索が動作することを確認
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - [ ] 以下のYAMLでヒット数を確認:
    ```yaml
    name: eric_descriptor_test
    query:
      - field: title_abstract
        terms:
          keywords:
            - "medical education"
          eric:
            - "Medical Education"
            - "Clinical Experience"
        operator: OR
    filters:
      year_from: 2020
    ```
  - [ ] `--dry-run`で変換結果を確認
- [ ] Acceptance: All tests pass, ERIC descriptors work in real usage

## Notes

- ERIC Descriptorsの一覧: https://eric.ed.gov/?ti=all
- keywordsとericは同じブロック内でORで結合される（MeSHと同様）
- ERICでは`subject:`フィールドがディスクリプタ用
- 他のプロバイダー（PubMed, arXiv, Scopus）では`eric`フィールドは無視される
