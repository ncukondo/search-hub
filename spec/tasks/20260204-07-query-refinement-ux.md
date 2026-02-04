# Task: Query Refinement UX Improvements

## Purpose

arXivでの医学教育検索テスト中に発見された問題を解決する。

**発見された課題**:
1. `--query` オプションの存在により、YAMLファイルを使わずに直接クエリを実行してしまう
2. 略語（EPA, OSCE等）が他分野の用語と誤マッチし、ノイズが混入する
3. `--count-only` では件数しかわからず、クエリ品質の確認ができない

**改善目標**:
- YAMLファイル使用を自然に促すUX
- 略語使用時のリスクを可視化
- クエリ品質を素早く確認できるプレビュー機能

## Related Specs

- [spec/cli.md](../cli.md) - CLI commands
- [spec/query.md](../query.md) - Query DSL

## Related Source Files

- `src/cli/commands/search.ts` - search command
- `src/cli/commands/query.ts` - query init command
- `src/query/parser.ts` - query parsing

## Implementation Steps

### Step 1: Display YAML recommendation hint when using --query

`--query` オプション使用時に、YAMLファイルの使用を推奨するヒントを表示する。

- [x] Write test: `src/cli/commands/search.test.ts`
  - `--query` 使用時にヒントメッセージが stderr に出力されることを確認
- [x] Implement in `src/cli/commands/search.ts`
  - 検索実行後に以下のヒントを表示:
    ```
    Tip: For reproducible searches, consider using a YAML query file:
         search-hub query init -o my-search.yaml
    ```
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `--query` 使用時にヒントが表示される

### Step 2: Add --preview option to search command

`--count-only` の代わりに、件数と最初の数件のタイトルを表示する `--preview` オプションを追加。

- [x] Write test: `src/cli/commands/search.test.ts`
  - `--preview` オプションで件数と最初の5件のタイトルが表示されることを確認
- [x] Update command options in `src/cli/commands/search.ts`
  - `--preview` オプション追加（`--count-only` と排他）
- [x] Implement preview logic
  - 各プロバイダーから最大5件取得
  - 件数とタイトル一覧を表示
  - セッションは作成しない（一時的な取得のみ）
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `--preview` で件数とタイトルプレビューが表示される

### Step 3: Add short keyword warning

3文字以下のキーワード（略語）が含まれる場合に警告を表示する。

- [x] Write test: `src/query/parser.test.ts`
  - 短いキーワードを検出する関数のテスト
- [x] Write test: `src/cli/commands/search.test.ts`
  - 短いキーワード使用時に警告が表示されることを確認
- [x] Implement short keyword detection in `src/query/parser.ts`
  - `detectShortKeywords(query: QueryFile): string[]` 関数追加
- [x] Display warning in search command
  - 検索実行前に警告を表示:
    ```
    ⚠ Query contains short keywords: OSCE, EPA
      Short terms may match unrelated acronyms. Consider:
      - Adding full phrases (e.g., "Objective Structured Clinical Examination")
      - Using exclude terms to filter false matches
    ```
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 短いキーワード使用時に警告が表示される

### Step 4: Improve query init template with exclude examples

`query init` のテンプレートで `exclude` セクションを目立たせる。

- [x] Write test: `src/cli/commands/query.test.ts`
  - 生成されるテンプレートに `exclude: []` が含まれることを確認
- [x] Update template in `src/cli/commands/query.ts`
  - `exclude` を空配列として明示的に表示
  - コメントで使用例を追加
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: テンプレートに `exclude` が目立つ形で含まれる

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - `--query` 使用時のヒント表示を確認
  - `--preview` の動作を確認（実APIまたはモック）
  - 短いキーワード警告の表示を確認
- [x] Write E2E test: `src/cli/commands/query/init.e2e.test.ts`
  - `query init` のテンプレート内容を確認
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - [ ] `search-hub search --db arXiv --query "test"` でヒント表示確認
  - [ ] `search-hub search query.yaml --preview` でプレビュー表示確認
  - [ ] 短いキーワードを含むYAMLで警告表示確認
  - [ ] `search-hub query init` でテンプレート確認
- [ ] Acceptance: All tests pass, features work in real usage

## Notes

- `--preview` はセッションを作成しない（結果を保存しない）
- 短いキーワードの閾値は3文字以下（調整可能）
- 警告は stderr に出力し、パイプライン処理を妨げない
