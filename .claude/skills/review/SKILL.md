---
name: review
description: Detects all open PRs and spawns reviewer agents for each. Use when starting batch review.
---

# Batch Review

全てのオープンPRを検出し、レビューエージェントを一括起動します。

## Open PRs
!`gh pr list --state open --json number,headRefName,title --jq '.[] | "PR #\(.number): \(.title) (\(.headRefName))"' 2>/dev/null || echo "No open PRs"`

## Active Reviewers
!`./scripts/monitor-agents.sh 2>/dev/null | grep -v "^$" || echo "No agents running"`

## Steps

### 1. Detect Open PRs

```bash
gh pr list --state open --json number,headRefName,title
```

### 2. Spawn Reviewers

For each PR (parallel). Worktrees are auto-created:
```bash
./scripts/spawn-reviewer.sh --pr <pr-number> &
# ... more PRs ...
wait
```

Or with explicit branch names:
```bash
./scripts/spawn-reviewer.sh <branch-name> <pr-number> --create &
```

### 4. Apply Layout

```bash
./scripts/apply-layout.sh
```

### 5. Start Orchestration

```bash
./scripts/orchestrate.sh --background
```

### 6. Report

List spawned agents:
- PR number
- Branch name
- Pane ID

Monitor command:
```bash
./scripts/monitor-agents.sh --watch
```

## Notes

- If no open PRs, report that and exit
- Verify tmux session before spawning
- Agents autonomously review and post results to GitHub
- Orchestrator handles transitions after review completion
