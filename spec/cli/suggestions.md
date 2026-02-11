# Next Step Suggestions

## 概要

各コマンド実行後に、次に行うべきアクションのsuggestionを表示する機能。
ユーザーがワークフロー全体を把握していなくても、CLIが文脈に応じた案内を行う。

## 設計方針

### 2つの案内メカニズム

| メカニズム | 目的 | 表示タイミング | 内容 |
|-----------|------|---------------|------|
| **Workflow Guide** (`--help`) | ワークフロー全体の理解 | `--help` 実行時 | 静的なフロー図 |
| **Next Step Suggestion** | 次の具体的なアクション提示 | コマンド正常完了後 | 動的・文脈依存 |

これらは相互補完的であり、排他的ではない。

- `--help` はまだ何をすべきか分からないユーザー向け（教育的）
- Next Step Suggestion は今まさに作業中のユーザー向け（行動指向）

### Suggestion の分類

| 分類 | 説明 | 例 |
|------|------|----|
| **Static** | 状態に依らず常に同じ | `query init` → `query validate` |
| **State-dependent** | セッション/レビュー状態で変化 | `search` 完了: partial → `resume`, complete → `results` |
| **Conditional** | 特定の条件が成立する場合のみ表示 | `diff` は2つ以上のセッションが存在する場合のみ提案 |

### 出力フォーマット

```
Next:
  search-hub results 20260204_query_abc123        # 結果を確認
  search-hub summary 20260204_query_abc123        # 統計を確認

See also:
  search-hub diff <other-session> 20260204_query_abc123   # 別バージョンと比較
```

- **Next**: 最も自然な次のステップ（1-2個）
- **See also**: 状況によっては有用な代替パス（0-2個）
- 各行にインラインコメントで目的を簡潔に記述
- `--quiet` (`-q`) で抑制可能（既存の仕組みを踏襲）

---

## コマンド別 Suggestion マップ

### Phase 1: Query Preparation

#### `query init`

**分類**: Static

`query init` はテンプレートを生成するだけなので、次は必ず編集が必要。

```
Next:
  $EDITOR <output-file>                           # クエリを編集
```

#### `query validate` (成功時)

**分類**: State-dependent（`$schema` リンクの有無で分岐）

validate 成功後は翻訳確認かプレビューへ進む。`$schema` リンクがない場合は `Tip` でテンプレートからの
作り直しを案内する。`query init` のテンプレートには mesh/eric/emtree/exclude/filters/overrides の
コメント付き説明が含まれており、フォーマットを知らないユーザーにとって有用。

**`$schema` リンクあり:**
```
Next:
  search-hub search <query-file> --dry-run        # DB別の翻訳を確認
  search-hub search <query-file> --preview        # ヒット数+サンプルタイトルを確認
```

**`$schema` リンクなし:**
```
Tip: Start from a template to get $schema support and usage examples:
     search-hub query init -o query.yaml

Next:
  search-hub search <query-file> --dry-run        # DB別の翻訳を確認
  search-hub search <query-file> --preview        # ヒット数+サンプルタイトルを確認
```

#### `query validate` (失敗時)

**分類**: State-dependent（`$schema` リンクの有無で分岐）

**`$schema` リンクあり:**
```
Next:
  $EDITOR <query-file>                            # エラーを修正して再検証
```

**`$schema` リンクなし:**
```
Next:
  $EDITOR <query-file>                            # エラーを修正して再検証

Or create a new query from the template:
  search-hub query init -o query.yaml
```

#### `query translate`

**分類**: Static

`query translate` は翻訳を表示するのみ。ほぼ `--dry-run` の軽量版。

```
Next:
  search-hub search <query-file> --preview        # ヒット数+サンプルタイトルを確認
  search-hub search <query-file>                  # 検索を実行
```

### Phase 2: Search Execution

#### `search --dry-run`

**分類**: Static

`--dry-run` は翻訳 + provider readiness + 構文診断を表示。暗黙に validate も兼ねる。

```
Next:
  search-hub search <query-file> --preview        # ヒット数+サンプルタイトルを確認
  search-hub search <query-file>                  # 検索を実行
```

#### `search --preview`

**分類**: Static

`--preview` はヒット数 + 先頭5件のタイトルを表示。クエリの量（recall）と質（precision）を同時に確認できる。

```
Next:
  search-hub search <query-file>                  # 全文検索を実行
```

**条件付き（ヒット数が多い場合）**:
```
See also:
  search-hub search <query-file> --max-results 200   # 結果数を制限して実行
```

#### `search --count-only`

**分類**: Static

`--count-only` は `--preview` の軽量版。クエリ反復時の素早いチェック向け。

```
Next:
  search-hub search <query-file>                  # 全文検索を実行
```

#### `search` (全文検索 完了)

**分類**: State-dependent

**status = completed の場合**:
```
Next:
  search-hub results <session-id>                 # 結果を確認
```
```
See also:                                         # 他のセッションが存在する場合のみ
  search-hub diff <other-session> <session-id>    # 別バージョンと比較
```

**status = partial の場合**:
```
Next:
  search-hub resume <session-id>                  # 失敗したDBを再試行
```

**status = failed の場合**:
```
Next:
  search-hub resume <session-id> --retry-failed   # 全DBを再試行
  search-hub status <session-id>                  # エラー詳細を確認
```

#### `search --query` (直接クエリモード)

**分類**: Static

直接クエリモードはテスト用途。再現性のために YAML 化を推奨する。

```
See also:
  search-hub query init -o my-search.yaml         # YAML化して再現可能にする
```

※ 通常の completion/partial/failed の suggestion に加えて表示する。

#### `resume`

**分類**: State-dependent（searchと同じルールに従う）

### Phase 3: Result Analysis

#### `status <session-id>`

**分類**: State-dependent

**status = completed の場合**:
```
Next:
  search-hub results <session-id>                 # 結果を確認
```

**status = partial の場合**:
```
Next:
  search-hub resume <session-id>                  # 検索を再開
```

**status = failed の場合**:
```
Next:
  search-hub resume <session-id> --retry-failed   # 全DBを再試行
```

#### `results`

**分類**: Conditional

`results` 後は2つのパスがある:
- クエリ改善 → 新 yaml 作成 → search → diff（エディタ作業から始まるため CLI suggestion に不向き）
- レビューに進む → `review init`

```
Next:                                              # reviews.yaml が未作成の場合のみ
  search-hub review init --session <session-id>   # レビューに進む
```

reviews.yaml が既に存在する場合は `review init` を表示しない（`review status` を代わりに提案）。

```
Next:                                              # reviews.yaml が存在する場合
  search-hub review status --session <session-id> # レビュー進捗を確認
```

#### `summary`

**分類**: Conditional

`summary` は統計概要。通常 `results` の後に見ることが多い。次のステップは `results` と同様。

```
Next:                                              # reviews.yaml が未作成の場合
  search-hub review init --session <session-id>   # レビューに進む
```
```
Next:                                              # reviews.yaml が存在する場合
  search-hub review status --session <session-id> # レビュー進捗を確認
```

#### `diff`

**分類**: Conditional

Added > 0 かつ Removed > 0 の場合（双方に固有の論文がある場合）、merge を提案。

```
See also:
  search-hub merge <session-id-1> <session-id-2>   # 両セッションの結果を統合
  search-hub results <session-id>                   # 各セッションの結果を詳しく見る
```

Added > 0 かつ Removed = 0 の場合（session-2 が session-1 の上位集合）は merge 不要のため提案しない。

#### `merge`

**分類**: Static

```
Next:
  search-hub results <merged-session-id>            # 統合結果を確認
  search-hub summary <merged-session-id>            # 統計を確認
```

### Phase 4: Review Workflow

Review commands use **dynamic Next Steps** generated by `generateReviewNextSteps()`.
See `spec/cli/review.md` for the full review workflow specification.

#### Design Principle

All review commands (`merge`, `finalize`, `extract`, `status`) generate context-aware
Next Steps based on the current article status distribution. This replaces all static
workflow templates. Users can progress through the entire screening workflow by
copy-pasting suggested commands.

#### Session Directory Structure

```
sessions/<session-id>/
├── session.yaml
├── .internal/reviews.yaml            ← master file
└── for-review/
    ├── title-screening/
    │   └── review.yaml               ← extract output (work file or review file)
    ├── abstract-screening/
    │   └── review.yaml
    └── finalize-check/
        └── review.yaml               ← review file with reviewHistory
```

#### Dynamic Next Steps Logic

Implemented by `generateReviewNextSteps()` in `src/cli/commands/review/next-steps.ts`. Evaluated top-to-bottom:

**1. pending > 0 (initial screening)**:
```
Next:
  search-hub review extract --session <sid> --filter pending \
    --basis title --reviewer "name" --name title-screening
```

**2. agreed > 0 (consensus exists, can finalize)**:
```
Next:
  search-hub review finalize --session <sid>                    # auto-finalize agreed articles
```

**3. (conflicting + uncertain + incomplete) > 0 (needs further review)**:
Detect next basis from reviewer registry (title → abstract → fulltext).
```
Next:
  search-hub review extract --session <sid> --filter conflicting,uncertain,incomplete \
    --basis <next_basis> --reviewer "name" --name <next_basis>-screening
```

**4. all finalized**:
```
Next:
  search-hub register <sid> --reviewed                          # register accepted articles
```

**5. batch continuation (--limit used with remaining articles)**:
Appended to other suggestions when applicable.
```
  N articles remaining. Extract next batch:
  $ search-hub review extract --session <sid> --filter ... \
      --offset <next> --limit <n> --name <next_name>
```

#### Per-Command Behavior

##### `review init`
**分類**: Static (unchanged)
```
Next:
  search-hub review extract --session <sid> --basis title \
    --reviewer "name" --name title-screening
```

##### `review status`
**分類**: State-dependent (dynamic)
Uses `generateReviewNextSteps` with current status counts.

##### `review extract`
**分類**: State-dependent (dynamic)
Suggests merge command. If `--limit` was used with remaining, suggests next batch.
```
Next:
  search-hub review merge --session <sid> --name <name>         # merge results
```

##### `review merge`
**分類**: State-dependent (dynamic)
Uses `generateReviewNextSteps` with post-merge status.

##### `review finalize`
**分類**: State-dependent (dynamic)
Uses `generateReviewNextSteps` with post-finalize status.

##### `review list`
**分類**: Static
```
See also:
  search-hub review extract --session <sid> --name <name>       # extract subset for review
```

##### `review export`
**分類**: Static
```
See also:
  search-hub register <sid> --reviewed                          # register with reference-manager
```

### Phase 5: Registration & Export

#### `export`

**分類**: Conditional

```
See also:                                         # reviews.yaml が無い場合のみ
  search-hub review init --session <sid>          # レビューワークフローを開始
```

#### `register`

**分類**: Conditional

**reviews.yaml が無い場合**:
```
See also:
  search-hub review init --session <sid>          # 体系的レビューを行う場合
```

**Terminal state**: `register` 後は suggestion なし（ワークフロー終端）

### Notes

#### `notes add`, `notes assess`

**分類**: Static

```
See also:
  search-hub notes list <sid>                     # ノートを確認
```

---

## `--help` のワークフローガイド

各コマンドの `--help` にはワークフロー全体における位置づけを示す。
これは静的コンテンツであり、suggestion とは別の役割を持つ。

### メインコマンドの `--help`

```
Workflow:
  1. query init → edit → validate / --dry-run        Query preparation
  2. search --preview → search                       Preview & execute
  3. results / summary / diff                        Inspect & compare
  4. review init → extract → merge → status          Systematic review
  5. register / export                               Output

  Iterate: search v1 → search v2 → diff             Query refinement
  Combine: merge v1 + v2                             Multi-strategy union
```

### サブコマンドの `--help`

各サブコマンドには、そのコマンドが属するフェーズと前後関係を簡潔に記載する。

```
Workflow position:
  query validate → [this command: search --count-only] → search (full)
```

---

## 実装方針

### アーキテクチャ

```
src/cli/suggestions/
├── index.ts              # formatSuggestion() - 統合エントリポイント
├── types.ts              # Suggestion, SuggestionContext 型定義
├── rules.ts              # コマンド別 suggestion ルール定義
└── conditions.ts         # 状態チェック関数 (sessionExists, hasReviews, etc.)
```

### 型定義

```typescript
interface Suggestion {
  command: string;        // 実行可能なコマンド文字列
  description: string;    // インラインコメント（目的の簡潔な説明）
}

interface SuggestionResult {
  next: Suggestion[];     // 主要な次のステップ (1-2個)
  seeAlso: Suggestion[];  // 代替パス (0-2個)
  tip?: string;           // Next の前に表示するアドバイス（プレーンテキスト）
  or?: {                  // Next の後に表示する代替セクション
    label: string;        // セクションラベル (e.g. "Or create a new query from the template")
    items: Suggestion[];  // コマンドリスト
  };
}
```

表示順: `tip` → `Next:` → `or` → `See also:`

```typescript
interface SuggestionContext {
  command: string;                    // 実行されたコマンド名
  sessionId?: string;                // セッションID（あれば）
  sessionStatus?: SessionStatus;     // セッション状態
  reviewStatus?: ReviewStatusResult; // レビュー状態（basis別内訳含む）
  sessionCount?: number;             // 既存セッション数
  hasReviews?: boolean;              // reviews.yaml の存否
  queryFile?: string;                // クエリファイルパス
  hasSchemaLink?: boolean;           // query YAML に $schema リンクがあるか
  extractName?: string;              // extract の --name 値
}
```

### ルール定義パターン

```typescript
// 各コマンドのルールは (context) => SuggestionResult | null の関数
type SuggestionRule = (ctx: SuggestionContext) => SuggestionResult | null;
```

### 呼び出しパターン

各コマンドのアクション末尾で:

```typescript
if (!options.quiet) {
  const suggestions = formatSuggestion({
    command: 'search',
    sessionId: result.sessionId,
    sessionStatus: result.status,
    sessionCount: await countSessions(),
  });
  if (suggestions) {
    console.log(suggestions);
  }
}
```

### 既存 Tip 関数との関係

既存の `formatSearchCompletionTip()`, `formatCountOnlyTip()`, `formatDirectQueryTip()`,
`formatReviewWorkflowTip()` は新しい suggestion システムに統合し、段階的に置き換える。

---

## 抑制

- `--quiet` (`-q`): 既存のグローバルオプション。suggestion を含むすべての補助出力を抑制する。
- suggestion 専用のオプションは設けない（YAGNI）。

## 設計上の判断

### Q: `--help` に動的な状態を反映すべきか？

**A: No.** `--help` は純粋にコマンドの使い方とワークフロー上の位置を示す静的ドキュメント。
状態に応じた案内はコマンド実行後の suggestion が担当する。役割の分離を明確にする。

### Q: suggestion で全ての選択肢を列挙すべきか？

**A: No.** 最も自然な1-2個の Next と、条件付きの0-2個の See also に絞る。
情報過多は案内として機能しない。分岐が多い場合は最も頻度の高いパスを優先する。

### Q: suggestion にセッション一覧やファイル一覧を動的に埋め込むか？

**A: 限定的に Yes.** 直前のコマンドで生成/操作した sessionId やファイルパスは埋め込む。
ただし、他のセッションの一覧取得など追加 I/O が必要なものは `<other-session>` のように
プレースホルダで示す。パフォーマンスへの影響を避けるため。

### Q: 条件チェック（sessionCount, hasReviews 等）の I/O コストは？

**A: 最小限に抑える.** 条件チェックはファイル存在確認（`fs.existsSync`）程度に留める。
セッション数のカウントなど若干のコストがあるものは、表示に必要な場合のみ実行する。
