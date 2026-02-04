# Task: Query Diff Enhancement

## Purpose

`search-hub diff`コマンドを強化し、2つのセッション間でクエリ自体の変更点も表示できるようにする。
これにより、「どのキーワード変更がどの結果変化を引き起こしたか」の因果関係が分かりやすくなる。

**背景**:
医学教育×AI検索のクエリ開発プロセスで、v1→v2→v3とクエリを改善した際、
結果のdiffは見られるが、クエリの何が変わったのか確認するには手動でファイルを比較する必要があった。

**現在の出力**:
```
Diff: session1 → session2
  Common:  58 articles
  Added:   55 articles
  Removed: 46 articles
```

**改善後の出力**:
```
Diff: session1 → session2

Query changes:
  Block 1 (title_abstract): no changes
  Block 2 (title_abstract):
    + OSCE
    + "objective structured clinical examination"
    - "clinical assessment"
  Block 3 (title_abstract):
    + "artificial intelligence"
    + Claude
    + Gemini

Result changes:
  Common:  58 articles
  Added:   55 articles
  Removed: 46 articles
```

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - diff command
- [spec/models/session.md](../models/session.md) - SessionFile structure

## Related Source Files

- `src/cli/commands/diff.ts` - diff command implementation
- `src/session/manager.ts` - session loading
- `src/session/types.ts` - SessionFile type

## Implementation Steps

### Step 1: Extract query from SessionFile

- [ ] Write test: `src/cli/commands/diff.test.ts`
  - SessionFileからクエリ情報を取得できることを確認
- [ ] Verify that SessionFile contains query information
  - `query`フィールドにQueryASTが保存されていることを確認
- [ ] Acceptance: セッションからクエリ情報にアクセスできる

### Step 2: Implement query comparison function

- [ ] Write test: `src/cli/commands/diff.test.ts`
  - `computeQueryDiff(query1, query2)`関数のテスト
  - 各ブロックのキーワード追加・削除を検出
  - mesh, eric等の統制語彙の変更も検出
  - フィルター変更（年、言語）も検出
- [ ] Implement `computeQueryDiff` in `src/cli/commands/diff.ts`
  ```typescript
  interface QueryDiff {
    blocks: BlockDiff[];
    filters: FilterDiff;
  }
  interface BlockDiff {
    index: number;
    field: string;
    added: string[];
    removed: string[];
    meshAdded?: string[];
    meshRemoved?: string[];
    ericAdded?: string[];
    ericRemoved?: string[];
  }
  interface FilterDiff {
    yearFromChanged: boolean;
    yearToChanged: boolean;
    languagesAdded: string[];
    languagesRemoved: string[];
  }
  ```
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: クエリの差分が正しく計算される

### Step 3: Format query diff output

- [ ] Write test: `src/cli/commands/diff.test.ts`
  - `formatQueryDiff(queryDiff)`関数のテスト
  - 変更がないブロックは "no changes" と表示
  - 追加キーワードは `+` プレフィックス、削除は `-` プレフィックス
- [ ] Implement `formatQueryDiff` in `src/cli/commands/diff.ts`
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: クエリdiffが読みやすくフォーマットされる

### Step 4: Integrate query diff into diff command

- [ ] Write test: `src/cli/commands/diff.test.ts`
  - diff出力に「Query changes」セクションが含まれることを確認
  - `--no-query-diff`オプションでクエリdiffを非表示にできることを確認
- [ ] Update `src/cli/commands/diff.ts`
  - セッションからクエリを読み込み
  - `formatDiff`の出力に`formatQueryDiff`の結果を追加
  - `--no-query-diff`オプション追加
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: diffコマンドでクエリ変更が表示される

### Step 5: Handle missing query data gracefully

- [ ] Write test: `src/cli/commands/diff.test.ts`
  - 古いセッション（query情報なし）でもエラーにならないことを確認
  - クエリ情報がない場合は「Query changes: (query data not available)」と表示
- [ ] Update implementation to handle missing query
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: クエリ情報がないセッションでも正常動作

### Step 6: Add JSON output support

- [ ] Write test: `src/cli/commands/diff.test.ts`
  - `--json`オプションでqueryDiffがJSON出力に含まれることを確認
- [ ] Update `formatDiffJson` in `src/cli/commands/diff.ts`
  - `queryDiff`フィールドを追加
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: JSON出力にクエリdiffが含まれる

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/diff.e2e.test.ts`
  - 2つの異なるクエリで検索を実行
  - diffコマンドでクエリ変更が表示されることを確認
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - [ ] 実際に2つのセッションを作成してdiffを実行
  - [ ] クエリ変更が正しく表示されることを確認
  - [ ] `--no-query-diff`で非表示になることを確認
  - [ ] `--json`でJSON出力を確認
- [ ] Acceptance: All tests pass, query diff works in real usage

## Notes

- クエリ情報はSessionFileの`query`フィールドに保存されている
- ブロック数が異なる場合は、追加/削除されたブロックとして表示
- 将来的に「この変更がこの結果差分を引き起こした可能性」の示唆も検討できる
