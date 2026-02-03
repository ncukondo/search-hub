全てのオープンPRを検出し、レビューエージェントを一括起動して下さい。

## 手順

### 1. オープンPRの検出
```bash
gh pr list --state open --json number,headRefName,title
```

### 2. worktreeの確認・作成
各PRについて:
- ブランチ名からworktreeパスを算出（`/workspaces/search-hub--worktrees/<branch>`、`/` は `-` に変換）
- worktreeが無ければ作成:
  ```bash
  git worktree add /workspaces/search-hub--worktrees/<branch-dir> <branch-name>
  ```

### 3. レビューエージェントの起動
各PRについて `spawn-reviewer.sh` でtmuxペインにレビューエージェントを起動する。
複数PRがある場合は並列起動（バックグラウンド実行 + wait）:
```bash
./scripts/spawn-reviewer.sh <branch-name> <pr-number> &
# ... 他のPRも同様 ...
wait
```

### 4. レイアウト適用
全エージェント起動後:
```bash
./scripts/apply-layout.sh
```

### 5. 結果報告
起動したエージェントの一覧（PR番号、ブランチ、ペインID）を報告する。
監視コマンドも提示:
```bash
tmux capture-pane -t <pane_id> -p | tail -20
```

## 注意
- レビュー対象が無い場合はその旨を報告して終了
- tmuxセッションの中にいることを確認してから起動する
- エージェントは自律的にレビューを行い、GitHub PRにレビュー結果を投稿する
