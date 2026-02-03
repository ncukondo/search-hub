#!/usr/bin/env bash
set -euo pipefail

# Check the state of a Claude Code agent running in a tmux pane.
#
# Usage: check-agent-state.sh <pane-id>
# Output: "trust", "idle", or "working"
#
# States:
#   trust   - Trust prompt is displayed, needs Enter to accept
#   idle    - Agent is ready for input (prompt ❯ visible)
#   working - Agent is processing a task
#
# This script uses robust detection:
#   - Uses -J to join wrapped lines (handles narrow panes)
#   - Checks last 15 lines to handle varying layouts
#   - Distinguishes Trust prompt's " ❯ 1." from input prompt's "^❯"

PANE="${1:?Usage: check-agent-state.sh <pane-id>}"

# Check pane exists
if ! tmux has-session -t "$PANE" 2>/dev/null; then
  echo "error: pane not found"
  exit 1
fi

# Capture pane content with wrapped lines joined
CONTENT=$(tmux capture-pane -t "$PANE" -p -J 2>/dev/null | tail -15)

# Trust prompt detection:
#   - Has selection marker " ❯ 1." or " ❯ 2." (indented)
#   - Has "Enter to confirm" text
if echo "$CONTENT" | grep -qE '^\s+❯\s+[12]\.' && \
   echo "$CONTENT" | grep -q 'Enter to confirm'; then
  echo "trust"
  exit 0
fi

# Idle detection:
#   - Has input prompt "❯" at line start (not indented)
#   - This covers both empty prompt and suggestion display
if echo "$CONTENT" | grep -qE '^❯'; then
  echo "idle"
  exit 0
fi

# Otherwise, agent is working
echo "working"
