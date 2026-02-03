# Scripts

This directory contains shell scripts for managing parallel agent workflows with tmux and git worktrees.

## Agent Lifecycle Scripts

### spawn-worker.sh
Spawn a worker agent for implementing a task.
```bash
./scripts/spawn-worker.sh <branch-name> <task-keyword>
# Example: ./scripts/spawn-worker.sh feat/results-list 20260203-01
```

### spawn-reviewer.sh
Spawn a reviewer agent for reviewing a PR.
```bash
./scripts/spawn-reviewer.sh <branch-name> <pr-number>
# Example: ./scripts/spawn-reviewer.sh feat/results-list 44
```

### kill-agent.sh
Gracefully terminate an agent in a tmux pane.
```bash
./scripts/kill-agent.sh <pane-id> [--keep-pane]
# Example: ./scripts/kill-agent.sh %31
# Example: ./scripts/kill-agent.sh %31 --keep-pane
```

### launch-agent.sh
Low-level script to launch Claude in a tmux pane (used by spawn-*.sh).
```bash
./scripts/launch-agent.sh <worktree-dir> <prompt>
```

## Monitoring Scripts

### monitor-agents.sh
Display status of all active agents.
```bash
./scripts/monitor-agents.sh           # One-time display
./scripts/monitor-agents.sh --watch   # Continuous monitoring
./scripts/monitor-agents.sh --json    # JSON output
```

Output columns:
- **BRANCH**: Git branch name
- **AGENT**: Agent state (idle/working/trust/-)
- **PR**: PR number or "-"
- **CI**: CI status (pass/fail/pending/-)
- **REVIEW**: Review status (approved/changes/pending/-)

### check-agent-state.sh
Check the state of a specific agent pane.
```bash
./scripts/check-agent-state.sh <pane-id>
# Output: "idle" | "working" | "trust" | "error"
```

States:
- **idle**: Agent is ready for input (prompt `❯` visible)
- **working**: Agent is processing a task
- **trust**: Trust prompt is displayed, needs Enter to accept

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

## Agent Interaction Scripts

### send-to-agent.sh
Send a prompt to an idle agent.
```bash
./scripts/send-to-agent.sh <pane-id> <prompt>
# Example: ./scripts/send-to-agent.sh %31 "/review-pr 44"
# Example: ./scripts/send-to-agent.sh %31 "Fix the failing test"
```

Requires the agent to be in "idle" state.

### wait-and-transition.sh
Wait for an agent to complete its task and transition to the next role.
```bash
# Wait for worker to complete, then spawn reviewer
./scripts/wait-and-transition.sh <branch> worker

# Wait for reviewer to complete, handle based on result
./scripts/wait-and-transition.sh <branch> reviewer --pr <pr-number>

# Options
--to <role>      Target role (default: auto-detect)
--pr <number>    PR number (required for reviewer transitions)
--timeout <s>    Timeout in seconds (default: 1800)
```

Transitions:
- `worker → reviewer`: After PR creation + CI pass
- `reviewer → worker`: After changes_requested (sends fix instruction)
- `reviewer → done`: After approved (ready for merge)

## Layout Scripts

### apply-layout.sh
Apply a balanced tmux layout after spawning agents.
```bash
./scripts/apply-layout.sh
```

### set-role.sh
Set the role marker in a worktree's CLAUDE.md.
```bash
./scripts/set-role.sh <worktree-dir> <role>
# Example: ./scripts/set-role.sh /path/to/worktree implement
```

## Typical Workflow

```bash
# 1. Spawn workers (automatically creates worktrees and panes)
./scripts/spawn-worker.sh feat-task-a 20260203-01
./scripts/spawn-worker.sh feat-task-b 20260203-02
./scripts/apply-layout.sh

# 2. Monitor progress
./scripts/monitor-agents.sh --watch

# 3. When workers complete (idle + PR created), spawn reviewers
./scripts/spawn-reviewer.sh feat/task-a 44
./scripts/spawn-reviewer.sh feat/task-b 45

# 4. If changes requested, send fix instruction
./scripts/send-to-agent.sh %31 "Fix the test failure in results.test.ts"

# 5. After approval, merge from main agent
gh pr merge 44 --squash --delete-branch
```

## Notes

- All scripts use `set -euo pipefail` for safety
- tmux text and Enter are always sent separately with `sleep 1` between
- Agent state detection uses `-J` flag to handle narrow panes
- Completion detection uses GitHub API, not tmux output parsing
