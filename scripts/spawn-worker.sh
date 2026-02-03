#!/usr/bin/env bash
set -euo pipefail

# Spawn a worker agent for a task in a new worktree.
#
# Usage: spawn-worker.sh <branch-name> <task-keyword>
# Example: spawn-worker.sh feat/deduplicate-results deduplicate
#
# What it does:
#   1. Creates worktree (via workmux or manually)
#   2. Sets role marker in CLAUDE.md
#   3. Delegates to launch-agent.sh for pane + Claude setup

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="${1:?Usage: spawn-worker.sh <branch-name> <task-keyword>}"
TASK_KEYWORD="${2:?Usage: spawn-worker.sh <branch-name> <task-keyword>}"

WORKTREE_BASE="/workspaces/search-hub--worktrees"
WORKTREE_DIR="$WORKTREE_BASE/$(echo "$BRANCH" | tr '/' '-')"

# --- 1. Create worktree ---
if [ -d "$WORKTREE_DIR" ]; then
  echo "[spawn-worker] Worktree already exists: $WORKTREE_DIR"
else
  if command -v workmux &>/dev/null; then
    echo "[spawn-worker] Creating worktree via workmux..."
    workmux add "$BRANCH" -b
  else
    echo "[spawn-worker] Creating worktree manually..."
    mkdir -p "$WORKTREE_BASE"
    git worktree add "$WORKTREE_DIR" -b "$BRANCH"
    (cd "$WORKTREE_DIR" && npm install)
  fi
fi

# --- 2. Set role marker in CLAUDE.md ---
echo "[spawn-worker] Setting role to 'implement' in CLAUDE.md..."
"$SCRIPT_DIR/set-role.sh" "$WORKTREE_DIR" implement

# --- 3. Delegate to launch-agent.sh ---
export LAUNCH_AGENT_LABEL="spawn-worker"
exec "$SCRIPT_DIR/launch-agent.sh" "$WORKTREE_DIR" "/code-with-task $TASK_KEYWORD"
