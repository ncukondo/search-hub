# Scripts

Shell scripts for managing parallel agent workflows with tmux and git worktrees.

## Quick Start

```bash
# 1. Spawn workers for parallel implementation
./scripts/spawn-worker.sh feat/task-a 20260203-01
./scripts/spawn-worker.sh feat/task-b 20260203-02
./scripts/apply-layout.sh

# 2. Start orchestration (auto-transitions workers → reviewers)
./scripts/orchestrate.sh --background

# 3. When PRs are approved, merge
./scripts/merge-pr.sh 123
./scripts/merge-pr.sh 124
```

## Agent Lifecycle

### spawn-worker.sh
Spawn a worker agent for implementing a task.
```bash
./scripts/spawn-worker.sh <branch-name> <task-keyword>
# Example: ./scripts/spawn-worker.sh feat/results-list 20260203-01
```

### spawn-reviewer.sh
Spawn a reviewer agent for reviewing a PR.
```bash
# With branch name and PR number
./scripts/spawn-reviewer.sh <branch-name> <pr-number>

# With PR number only (auto-detects branch, auto-creates worktree)
./scripts/spawn-reviewer.sh --pr <pr-number>

# With explicit worktree creation
./scripts/spawn-reviewer.sh <branch-name> <pr-number> --create
```

### kill-agent.sh
Gracefully terminate an agent in a tmux pane.
```bash
./scripts/kill-agent.sh <pane-id> [--keep-pane]
# Example: ./scripts/kill-agent.sh %31
```

### launch-agent.sh
Low-level script to launch Claude in a tmux pane (used by spawn-*.sh).
```bash
./scripts/launch-agent.sh <worktree-dir> <prompt>
```

## Orchestration

### orchestrate.sh
Monitor all agents and automatically transition through the workflow.
```bash
# Start in background (recommended)
./scripts/orchestrate.sh --background

# Check status
./scripts/orchestrate.sh --status

# Stop
./scripts/orchestrate.sh --stop

# View logs
tail -f /tmp/claude-orchestrator/orchestrator.log

# View notifications
cat /tmp/claude-orchestrator/notifications
```

Automatic transitions:
- **Worker completes** (idle + PR + CI pass) → spawns Reviewer
- **Reviewer approves** → notifies main agent, ready for merge
- **Reviewer requests changes** → sends fix instructions to worker
- **Errors/CI failures** → notifies main agent

### merge-pr.sh
Merge a PR with automatic cleanup.
```bash
./scripts/merge-pr.sh <pr-number> [options]

# Options:
#   --squash    Squash merge (default)
#   --merge     Regular merge commit
#   --rebase    Rebase merge
#   --no-task   Skip task file management
#   --dry-run   Preview actions without executing
```

Handles automatically:
- CI completion wait
- Worktree removal (force if locked)
- Agent termination
- Branch deletion (local + remote)
- Task file move to completed/

## Monitoring

### monitor-agents.sh
Display status of all active agents.
```bash
./scripts/monitor-agents.sh           # One-time display
./scripts/monitor-agents.sh --watch   # Continuous monitoring
./scripts/monitor-agents.sh --json    # JSON output
```

### check-agent-state.sh
Check the state of a specific agent pane.
```bash
./scripts/check-agent-state.sh <pane-id>
# Output: "idle" | "working" | "trust" | "error"
```

### check-task-completion.sh
Check task completion status using GitHub API.
```bash
# Check if PR exists and CI passes
./scripts/check-task-completion.sh <branch> pr-creation
# Output: "pending" | "ci-pending" | "ci-failed" | "completed"

# Check if review has been posted
./scripts/check-task-completion.sh <branch> review <pr-number>
# Output: "pending" | "approved" | "changes_requested" | "commented"
```

## Agent Interaction

### send-to-agent.sh
Send a prompt to an idle agent.
```bash
./scripts/send-to-agent.sh <pane-id> <prompt>
# Example: ./scripts/send-to-agent.sh %31 "Fix the failing test"
```

## Layout & Setup

### apply-layout.sh
Apply a balanced tmux layout after spawning agents.
```bash
./scripts/apply-layout.sh
```

### set-role.sh
Set the role marker in a worktree's CLAUDE.md.
```bash
./scripts/set-role.sh <worktree-dir> <role>
# Roles: implement, review
```

### check-worker-launch.sh
Session hook to verify proper worker launch method.

## Typical Workflow

```bash
# 1. Spawn workers (creates worktrees and panes)
./scripts/spawn-worker.sh feat/task-a 20260203-01
./scripts/spawn-worker.sh feat/task-b 20260203-02
./scripts/apply-layout.sh

# 2. Start orchestration
./scripts/orchestrate.sh --background

# 3. Monitor progress (optional)
./scripts/monitor-agents.sh --watch

# 4. Orchestrator automatically:
#    - Detects worker completion
#    - Spawns reviewers
#    - Handles review results

# 5. When notified of approval, merge from main agent
./scripts/merge-pr.sh 44
./scripts/merge-pr.sh 45

# 6. Update ROADMAP.md and commit
```

## Script Inventory

| Script | Purpose |
|:-------|:--------|
| `spawn-worker.sh` | Start implementation worker |
| `spawn-reviewer.sh` | Start PR reviewer |
| `kill-agent.sh` | Terminate agent |
| `launch-agent.sh` | Low-level agent launcher |
| `orchestrate.sh` | Auto-transition controller |
| `merge-pr.sh` | PR merge + cleanup |
| `monitor-agents.sh` | Agent status display |
| `check-agent-state.sh` | Single agent state |
| `check-task-completion.sh` | GitHub API status check |
| `send-to-agent.sh` | Send prompt to agent |
| `apply-layout.sh` | Arrange tmux panes |
| `set-role.sh` | Set CLAUDE.md role |
| `check-worker-launch.sh` | Session start hook |

## Notes

- All scripts use `set -euo pipefail` for safety
- tmux text and Enter are always sent separately with `sleep 1` between
- Agent state detection uses `-J` flag to handle narrow panes
- Completion detection uses GitHub API, not tmux output parsing
