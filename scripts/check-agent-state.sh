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

# Track if we're in starting state (used to relax working indicator detection)
IS_STARTING=false

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
      # "starting" state means hooks are set up but idle_prompt hasn't fired yet
      # (idle_prompt only fires after 60s of idle). Fall through to tmux detection.
      if [[ "$STATE" == "starting" ]]; then
        IS_STARTING=true
        # Fall through to tmux detection below
      # Map "permission" to "trust" for backward compatibility with callers
      # that expect "trust" for any permission-related prompt
      elif [[ "$STATE" == "permission" ]]; then
        echo "trust"
        exit 0
      else
        echo "$STATE"
        exit 0
      fi
    fi
  fi
fi

# --- Method 2: tmux capture-pane fallback ---
# Check pane exists
if ! tmux has-session -t "$PANE" 2>/dev/null; then
  echo "error: pane not found"
  exit 1
fi

# Capture pane content (include scroll-back to ensure we get content)
CONTENT=$(tmux capture-pane -t "$PANE" -p -S -50 2>/dev/null | tail -20)

# Trust prompt detection:
#   - Contains "Yes, I trust" (from the trust folder prompt)
#   - Contains "confirm" (from "Enter to confirm")
#   Note: We use keyword-based detection instead of line patterns because
#   narrow panes cause line wrapping that breaks pattern matching.
if echo "$CONTENT" | grep -q 'Yes, I trust' && \
   echo "$CONTENT" | grep -q 'confirm'; then
  echo "trust"
  exit 0
fi

# Idle detection:
#   - Has input prompt "❯" (with or without suggestion text)
#   - No spinner characters (working indicators)
#   Note: In narrow panes, "❯" may not be at line start due to wrapping.
#   We check for "❯" anywhere, then distinguish idle from working by spinners.
if echo "$CONTENT" | grep -q '❯'; then
  # Check for spinner characters (working indicators)
  if echo "$CONTENT" | grep -qE '(⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏)'; then
    echo "working"
  else
    echo "idle"
  fi
  exit 0
fi

# No "❯" prompt found
# If state file says "starting", return "starting" (Claude may still be initializing,
# or tmux capture-pane hasn't caught up with the display yet)
if [[ "$IS_STARTING" == "true" ]]; then
  echo "starting"
  exit 0
fi

# Otherwise, agent is working
echo "working"
