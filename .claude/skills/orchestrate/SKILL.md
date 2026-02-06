---
name: orchestrate
description: Monitors all worker agents and automatically transitions them through the workflow. Use after spawning workers with /implement, or to check orchestration status.
---

# Orchestration Control

ワーカーエージェントを監視し、ワークフローを自動遷移させるオーケストレーターを制御します。

## Current Status

### Orchestrator
!`./scripts/orchestrate.sh --status 2>/dev/null`

### Active Agents
!`./scripts/monitor-agents.sh 2>/dev/null`

### Active Worktrees
!`git worktree list`

### Recent Notifications
!`tail -5 /tmp/claude-orchestrator/notifications 2>/dev/null`

## Commands

### Start Orchestration
```bash
# Foreground (see output)
./scripts/orchestrate.sh

# Background (recommended after worker spawn)
./scripts/orchestrate.sh --background
```

### Check Status
```bash
./scripts/orchestrate.sh --status
```

### View Logs
```bash
tail -f /tmp/claude-orchestrator/orchestrator.log
```

### View Notifications
```bash
cat /tmp/claude-orchestrator/notifications
```

### Stop Orchestration
```bash
./scripts/orchestrate.sh --stop
```

## Workflow

```
Worker (implement)
    ↓ idle + PR created + CI pass
    ↓ [auto: kill worker, spawn reviewer]
Reviewer (review)
    ↓ idle + review posted
    ├─→ approved: notify main, kill reviewer, ready for merge
    ├─→ changes_requested: notify main, send fix instructions
    └─→ commented: notify main (no decision)
```

## Notifications

オーケストレーターは以下の場合にメインエージェントに通知します：

- **INFO**: 正常な遷移完了（reviewer開始、approve、changes_requested）
- **WARNING**: CI失敗、予期しない状態
- **ERROR**: エージェントエラー、遷移失敗

通知はメインエージェントのペインにコメント形式で送信されます：
```
# [ORCHESTRATOR] Branch feat/xxx: PR #123 APPROVED - Ready for merge
```

## After Orchestration

PRがapproveされたら、メインエージェントでマージ：
```bash
gh pr merge <pr-number> --squash --delete-branch
git worktree remove /workspaces/search-hub--worktrees/<branch> --force
```
