#!/usr/bin/env bash
set -euo pipefail

# Check the state of a Claude Code agent running in a tmux pane.
#
# Usage: check-agent-state.sh <pane-id>
# Output: "trust", "permission", "idle", or "working"
#
# States:
#   permission - Permission prompt is displayed, needs approval
#   trust      - Trust prompt is displayed, needs Enter to accept
#   idle       - Agent is ready for input (prompt ❯ visible)
#   working    - Agent is processing a task
#   starting   - Agent is starting up
#
# Detection methods (in priority order):
#   1. Hooks-based state file (/tmp/claude-agent-states/<pane-id>)
#   2. tmux capture-pane fallback (for non-script-launched agents)

PANE="${1:?Usage: check-agent-state.sh <pane-id>}"
WORKER_STATE_DIR="/tmp/claude-agent-states"
STATE_FILE="$WORKER_STATE_DIR/$PANE"

# --- Method 1: Hooks-based state file (highest priority) ---
if [[ -f "$STATE_FILE" ]]; then
  # Check file age - if older than 120s, consider it stale
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    FILE_MTIME=$(stat -f %m "$STATE_FILE" 2>/dev/null || echo 0)
  else
    # Linux
    FILE_MTIME=$(stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
  fi
  NOW=$(date +%s)
  AGE=$((NOW - FILE_MTIME))

  if [[ $AGE -lt 120 ]]; then
    STATE=$(cat "$STATE_FILE" 2>/dev/null || echo "")
    if [[ -n "$STATE" ]]; then
      # Map "permission" to "trust" for backward compatibility with callers
      # that expect "trust" for any permission-related prompt
      if [[ "$STATE" == "permission" ]]; then
        echo "trust"
      else
        echo "$STATE"
      fi
      exit 0
    fi
  fi
fi

# --- Method 2: tmux capture-pane fallback ---
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
#   - No spinner characters or "esc to interrupt" (working indicators)
if echo "$CONTENT" | grep -qE '^❯'; then
  # Check for working indicators
  if echo "$CONTENT" | grep -qE '(esc to interrupt|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏)'; then
    echo "working"
  else
    echo "idle"
  fi
  exit 0
fi

# Otherwise, agent is working
echo "working"
