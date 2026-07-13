#!/usr/bin/env bash
set -euo pipefail

# Send a prompt/instruction to a running Claude agent via herdr.
#
# Usage: send-to-agent.sh <target> <prompt>
#   target: herdr pane id (e.g. w13:p2) or unique agent name
#
# Example: send-to-agent.sh feat-clipboard "/review-pr 44"
# Example: send-to-agent.sh w13:p2 "Fix the failing test in results.test.ts"
#
# Prerequisites:
#   - Agent must be in "idle" or "starting" state
#
# `herdr pane run` submits the text and Enter atomically, so there are no
# input races (unlike tmux send-keys).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/herdr-lib.sh"

TARGET="${1:?Usage: send-to-agent.sh <target> <prompt>}"
PROMPT="${2:?Usage: send-to-agent.sh <target> <prompt>}"

# Resolve target to a pane id and verify the agent exists
AGENT_JSON=$(herdr agent get "$TARGET" 2>/dev/null || true)
if [ -z "$AGENT_JSON" ] || echo "$AGENT_JSON" | jq -e '.error' >/dev/null 2>&1; then
  echo "[send-to-agent] ERROR: Agent not found: $TARGET" >&2
  exit 1
fi
PANE_ID=$(echo "$AGENT_JSON" | jq -r '.result.agent.pane_id')
STATE=$(echo "$AGENT_JSON" | jq -r '.result.agent.agent_status')

if [ "$STATE" != "idle" ] && [ "$STATE" != "done" ] && [ "$STATE" != "unknown" ]; then
  echo "[send-to-agent] ERROR: Agent is not ready for input (state: $STATE)" >&2
  echo "[send-to-agent] Wait for the agent to finish its current task" >&2
  exit 1
fi

echo "[send-to-agent] Sending prompt to pane $PANE_ID..."
RUN_OUT=$(herdr pane run "$PANE_ID" "$PROMPT" 2>/dev/null || true)
if [ -z "$RUN_OUT" ] || echo "$RUN_OUT" | jq -e '.error' >/dev/null 2>&1; then
  echo "[send-to-agent] ERROR: herdr pane run failed: $(echo "$RUN_OUT" | jq -r '.error.message // "no response"')" >&2
  exit 1
fi

# `herdr pane run` is supposed to submit text + Enter atomically, but with the
# Claude TUI the Enter can be swallowed, leaving the prompt sitting in the
# input box. Verify the agent actually starts working; nudge with an explicit
# Enter if it stays idle. (Enter on an empty/submitted input box is a no-op.)
for attempt in 1 2 3; do
  sleep 2
  STATE=$(agent_status "$PANE_ID")
  case "$STATE" in
    working|blocked)
      echo "[send-to-agent] Prompt submitted (state: $STATE)"
      exit 0
      ;;
  esac
  herdr pane send-keys "$PANE_ID" Enter >/dev/null 2>&1 || true
done

STATE=$(agent_status "$PANE_ID")
case "$STATE" in
  working|blocked|done)
    echo "[send-to-agent] Prompt submitted (state: $STATE)"
    ;;
  *)
    echo "[send-to-agent] WARNING: Could not confirm submission (state: $STATE)." >&2
    echo "[send-to-agent] Inspect with: herdr agent read $PANE_ID --lines 20" >&2
    exit 1
    ;;
esac
