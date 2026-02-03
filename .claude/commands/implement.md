spec/tasks/ROADMAP.md を確認し、並列実装可能なタスクを分析して実装を進めて下さい。

## 手順

### 1. タスク分析
- spec/tasks/ROADMAP.md を確認し、"Pending" のタスクを全て洗い出す
- 依存関係が満たされているタスクを特定（並列実行候補）
- 実装するタスクを選択
  - 並列実装が可能なタスクが複数ある場合、workmux経由でworkerエージェントに分担する

### 2. ブランチ & worktree セットアップ

#### workmuxが利用可能な場合（推奨）
```bash
# worktree作成 + tmuxウィンドウ + エージェント起動を一括実行
workmux add <branch-name>

# バックグラウンドで作成（複数タスク並列時）
workmux add <branch-name> -b

# スクリプトによるワーカー起動
./scripts/spawn-worker.sh <branch-name> <task-keyword>
```

#### workmuxが無い場合（フォールバック）
worktreeは必ずリポジトリの親ディレクトリ直下の `search-hub--worktrees/` 内に作成して下さい（例: `git worktree add ../search-hub--worktrees/<branch-name> -b <branch-name>`）。ブランチ名も無ければ適切なものを作成し、ブランチの作成を直接行うのでは無くgit worktree addで行います。git worktree作成時にはnpm install等の初期セットアップも行って下さい。

### 3. TDD実装サイクル
各ステップについて:
1. **Red**: 失敗するテストを書く
2. **Green**: テストを通す最小限の実装
3. **Refactor**: リファクタリング
4. 各ステップ完了後にcommit

### 4. 完了前チェック
```bash
npm run test:all
npm run lint
npm run typecheck
```

### 5. PR作成
- 全テスト通過を確認
- gh pr create でPR作成

### 5a. ワーカー完了検知 & レビューサイクル

#### エージェント状態の監視
```bash
# 全エージェントの状態を一覧表示
./scripts/monitor-agents.sh

# 継続監視モード（10秒ごとに更新）
./scripts/monitor-agents.sh --watch

# 特定ペインの状態を確認
./scripts/check-agent-state.sh <pane_id>
# 出力: "idle" / "working" / "trust"
```

#### タスク完了の確認（GitHub API）
```bash
# PR作成とCI完了を確認
./scripts/check-task-completion.sh <branch> pr-creation
# 出力: "pending" / "ci-pending" / "ci-failed" / "completed"

# レビュー状態を確認
./scripts/check-task-completion.sh <branch> review <pr-number>
# 出力: "pending" / "approved" / "changes_requested" / "commented"
```

#### 自動遷移（オプション）
```bash
# ワーカー完了を待ってレビュアーに自動遷移
./scripts/wait-and-transition.sh <branch> worker

# レビュー完了を待って次のアクションを決定
./scripts/wait-and-transition.sh <branch> reviewer --pr <pr-number>
```

#### 手動でのレビュー起動
```bash
# レビュアーエージェントを起動
./scripts/spawn-reviewer.sh <branch> <pr-number>
```

#### 修正指示の送信
```bash
# アイドル状態のエージェントに指示を送信
./scripts/send-to-agent.sh <pane_id> "修正指示テキスト"
```

### 5b. レイアウト適用
全ワーカー起動後、ペインレイアウトを整える:
```bash
./scripts/apply-layout.sh
```

### 6. マージ（mainエージェントで）
ワーカー/レビュアーはマージを行わない。mainエージェントが以下を実行:
```bash
# PRをマージ
gh pr merge <pr-number> --squash --delete-branch

# worktreeをクリーンアップ
git worktree remove <path> --force
git branch -D <branch>
```

### 7. マージ後（mainブランチで）
- ROADMAP.md のステータスを "Done" に更新
- タスクファイルを `spec/tasks/completed/` に移動
- worktree と ブランチを cleanup (`workmux remove <name>` または手動)

## 並列実行について
- `workmux list` で全worktreeのステータスを確認可能
- `./scripts/monitor-agents.sh` で全エージェントの状態を一覧表示
- 依存関係のconflictに注意
- マージ時の調整を意識する

## エージェント状態の判定
- **idle**: エージェントが入力待ち（プロンプト `❯` が表示）
- **working**: エージェントがタスク実行中
- **trust**: Trust prompt表示中（自動でEnter送信される）

**注意**: tmux出力にサジェスション（グレー表示のコマンド候補）が表示されることがあるが、これはアイドル状態であり、実行中ではない。完了判定には `check-task-completion.sh` を使うこと。

## context管理
次の作業の完了までにcompactが必要になりそうなら、その時点で作業を中断し、進捗を報告して下さい。
