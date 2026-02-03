PR #$ARGUMENTS のマージ処理を行って下さい。

## 手順

### 1. CI確認
- CIが通っていればマージ
- まだCIが走っている場合は終了するまで待ってから確認

### 2. マージ実行
```bash
# --delete-branch は使わない（worktree存在時に失敗するため）
gh pr merge $ARGUMENTS --merge
```

### 3. cleanup（順序重要）

**必ずこの順序で実行する**（worktree存在時にブランチ削除は失敗する）:

1. mainを最新にする:
   ```bash
   git checkout main && git pull
   ```
2. worktreeを削除:
   ```bash
   git worktree list  # 該当worktreeのパスを確認
   git worktree remove ../search-hub--worktrees/<branch-name>
   ```
3. ブランチを削除:
   ```bash
   git branch -d <branch-name>
   ```

### 4. タスク完了処理（mainブランチで）
- 該当タスクファイルを `spec/tasks/active/` から `spec/tasks/completed/` に移動
- spec/tasks/ROADMAP.md のステータスを "Done" に更新
- commit & push

## 複数PRの一括マージ

複数PRを順番にマージする場合:

```bash
# 1. 全PRのCIを確認
gh pr list --state open

# 2. 各PRを順番にマージ（コンフリクトが起きにくい順序で）
gh pr merge <PR1> --merge
gh pr merge <PR2> --merge
gh pr merge <PR3> --merge

# 3. mainを最新にする
git checkout main && git pull

# 4. worktreeを一括削除
git worktree list
git worktree remove ../search-hub--worktrees/<branch1>
git worktree remove ../search-hub--worktrees/<branch2>
git worktree remove ../search-hub--worktrees/<branch3>

# 5. ブランチを一括削除
git branch -d <branch1> <branch2> <branch3>
```

**注意**: 2つ目以降のPRでコンフリクトが発生した場合は、該当ブランチでrebaseしてから再度マージする。
