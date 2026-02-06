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

**分類**: Static

validate は構文チェックのみ（API不要）。成功したら、翻訳確認かプレビューへ進む。

```
Next:
  search-hub search <query-file> --dry-run        # DB別の翻訳を確認
  search-hub search <query-file> --preview        # ヒット数+サンプルタイトルを確認
```

#### `query validate` (失敗時)

**分類**: Static

```
Next:
  $EDITOR <query-file>                            # エラーを修正して再検証
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

**分類**: Static

`diff` はクエリ反復ループ内で使用される。比較結果を見た後のアクションは
ユーザーの判断次第（改善続行 or 決定）のため、強い Next は出さない。

```
See also:
  search-hub results <session-id>                 # 各セッションの結果を詳しく見る
```

### Phase 4: Review Workflow

レビューは `basis` フィールド（title / abstract / fulltext）によるフェーズ制で進行する。
`review status` の出力にはフェーズ別の内訳が含まれる前提で設計する。

#### 作業ファイルのセッション内管理

`review extract` の出力先はセッションディレクトリ内に固定する（`--name` オプション）。

```
sessions/<session-id>/
├── session.yaml
├── .internal/reviews.yaml            ← マスター
└── for-review/
    ├── title-screening/
    │   └── review.yaml               ← extract 出力
    ├── abstract-screening/
    │   └── review.yaml
    └── reviewer-a/
        └── review.yaml
```

- `--name <name>`: 作業ファイルの名前（ディレクトリ名）を指定。必須。
- 外部協力者に渡す場合は `for-review/<name>/` からコピーし、返送後に戻して merge する。
- AI エージェントはセッション内のパスを直接参照できる。

```
review status の出力例:
  Review Progress: 20260204_diabetesai_abc123
    Total:        847
    Pending:      520  (no reviews)
    Reviewed:     310  (title: 310, abstract: 0)
    Finalized:     17  (include: 11, exclude: 6)
```

フェーズの自然な進行:
```
  Phase 1: title screening     全件をタイトルのみで一次選別
      ↓
  Phase 2: abstract screening  一次通過分をアブストラクトで二次選別
      ↓
  Finalization                 最終判断を確定
      ↓
  register --reviewed          採択論文を登録
```

#### `review init`

**分類**: Static

init 直後は全件 pending。タイトルスクリーニングから始める。

```
Next:
  search-hub review extract --session <sid> --basis title --name title-screening
```

#### `review status`

**分類**: State-dependent

`review status` の数値から現在のフェーズを判定し、次のアクションを提案する。
判定は上から順に評価し、最初に該当した条件の suggestion を表示する。

**1. pending > 0（タイトルスクリーニング未完了）**:

```
Next:
  search-hub review extract --session <sid> --basis title --filter pending --name title-screening
```

**2. pending = 0, title reviewed > 0, abstract reviewed = 0（アブストラクトスクリーニング未開始）**:

タイトルで exclude されなかった論文をアブストラクトで精査する。

```
Next:
  search-hub review extract --session <sid> --basis abstract --filter uncertain --name abstract-screening
```

**3. abstract screening 進行中（一部 abstract reviewed）**:

```
Next:
  search-hub review extract --session <sid> --basis abstract --filter pending --name abstract-screening
```

**4. 全件レビュー済み, conflicting > 0**:

```
Next:
  search-hub review list --session <sid> --filter conflicting   # 判断不一致を確認・解決
```

**5. 全件レビュー済み, needs-final > 0, conflicting = 0**:

```
Next:
  search-hub review list --session <sid> --filter needs-final   # 最終判断を確定
```

**6. 全件 finalized**:

```
Next:
  search-hub register <sid> --reviewed            # 採択論文を登録
```

#### `review list`

**分類**: Static

```
See also:
  search-hub review extract --session <sid> --name <name>   # サブセットを抽出してレビュー
```

#### `review extract`

**分類**: Static

extract 後は作業ファイルを編集（または `review mark` で判定）し、merge する。
作業ファイルはセッション内 `for-review/<name>/review.yaml` に出力される。

```
Next:
  search-hub review mark --file <path> ...                     # 判定を記録 (AI/CLI)
  search-hub review merge --session <sid> --name <name>        # レビュー結果をマージ
```

#### `review merge`

**分類**: Static

merge 後は常に status で全体の進捗を確認する。
status が次のフェーズを案内するため、merge 自身は分岐を持たない。

```
Next:
  search-hub review status --session <sid>        # 進捗を確認
```

#### `review export`

**分類**: Static

```
See also:
  search-hub register <sid> --reviewed            # reference-managerに登録
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
}

interface SuggestionContext {
  command: string;                    // 実行されたコマンド名
  sessionId?: string;                // セッションID（あれば）
  sessionStatus?: SessionStatus;     // セッション状態
  reviewStatus?: ReviewStatusResult; // レビュー状態（basis別内訳含む）
  sessionCount?: number;             // 既存セッション数
  hasReviews?: boolean;              // reviews.yaml の存否
  queryFile?: string;                // クエリファイルパス
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
