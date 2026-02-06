---
name: implement
description: Analyzes ROADMAP and implements tasks in parallel with automatic orchestration. Use when starting implementation work.
---

# Parallel Implementation

spec/tasks/ROADMAP.md を確認し、並列実装可能なタスクを分析して実装を進めます。

## Current Status
!`grep -E "^\| [0-9]+" spec/tasks/ROADMAP.md 2>/dev/null | head -10 || echo "ROADMAP not found"`

## Active Worktrees
!`git worktree list --porcelain 2>/dev/null | grep -A1 "^worktree" | paste - - | grep -v "/search-hub$" | awk '{print $2}' || echo "None"`

## Steps

### 1. Task Analysis

- Check spec/tasks/ROADMAP.md for "Pending" tasks
- Identify tasks with satisfied dependencies (parallel candidates)
- Select tasks to implement
  - Multiple parallelizable tasks → use spawn-worker.sh

### 2. Spawn Workers

```bash
# Spawn worker for each task
./scripts/spawn-worker.sh <branch-name> <task-keyword>
```

spawn-worker.sh automatically:
1. Creates worktree at `search-hub--worktrees/<branch-name>`
2. Runs npm install
3. Creates new pane in current window
4. Starts Claude with the task

### 3. Start Orchestration

After spawning all workers:

```bash
# Background orchestration (recommended)
./scripts/orchestrate.sh --background
```

Orchestrator automatically:
- Worker completion → spawns Reviewer
- Reviewer approval → notifies main agent
- Changes requested → sends fix instructions
- Errors → notifies main agent

### 4. Apply Layout

```bash
./scripts/apply-layout.sh
```

### 5. Monitor (optional)

```bash
# Check orchestrator status
./scripts/orchestrate.sh --status

# View logs
tail -f /tmp/claude-orchestrator/orchestrator.log

# View notifications
cat /tmp/claude-orchestrator/notifications
```

### 6. Merge (main agent only)

When notified of approval:
```bash
gh pr merge <pr-number> --squash --delete-branch
git worktree remove <path> --force
git branch -D <branch>
```

### 7. Post-Merge (main branch)

- Update ROADMAP.md status to "Done"
- Move task file to `spec/tasks/completed/`

## Notes

- All agents run in panes within the same tmux window
- Use `git worktree list` to see all worktrees
- Use `./scripts/monitor-agents.sh` to see agent states
- Be aware of dependency conflicts during parallel work
