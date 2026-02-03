#!/usr/bin/env bash
set -euo pipefail

# Spawn a reviewer agent for a PR in an existing worktree.
#
# Usage: spawn-reviewer.sh <branch-name> <pr-number>
# Example: spawn-reviewer.sh feat/session-diff 40
#
# What it does:
#   1. Locates the existing worktree (must already exist)
#   2. Sets role marker to 'review' in CLAUDE.md
#   3. Delegates to launch-agent.sh with /review-pr prompt

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="${1:?Usage: spawn-reviewer.sh <branch-name> <pr-number>}"
PR_NUMBER="${2:?Usage: spawn-reviewer.sh <branch-name> <pr-number>}"

WORKTREE_BASE="/workspaces/search-hub--worktrees"
WORKTREE_DIR="$WORKTREE_BASE/$(echo "$BRANCH" | tr '/' '-')"

if [ ! -d "$WORKTREE_DIR" ]; then
  echo "[spawn-reviewer] ERROR: Worktree does not exist: $WORKTREE_DIR"
  echo "[spawn-reviewer] Create it first with: git worktree add $WORKTREE_DIR -b $BRANCH && (cd $WORKTREE_DIR && npm install)"
  exit 1
fi

# --- 1. Set role marker in CLAUDE.md ---
echo "[spawn-reviewer] Setting role to 'review' in CLAUDE.md..."
"$SCRIPT_DIR/set-role.sh" "$WORKTREE_DIR" review

# --- 2. Delegate to launch-agent.sh ---
export LAUNCH_AGENT_LABEL="spawn-reviewer"
exec "$SCRIPT_DIR/launch-agent.sh" "$WORKTREE_DIR" "/review-pr $PR_NUMBER"
