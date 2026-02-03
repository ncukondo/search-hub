#!/usr/bin/env bash
set -euo pipefail

# Wait for an agent to complete its task and transition to the next role.
#
# Usage: wait-and-transition.sh <branch> <from-role> [--to <to-role>] [--pr <pr-number>]
#
# Roles:
#   worker   - Implementation worker (creates PR)
#   reviewer - PR reviewer (posts review)
#
# Transitions:
#   worker → reviewer    After PR creation + CI pass, start review
#   reviewer → worker    After changes_requested, send fix instruction
#   reviewer → done      After approved, ready for merge
#
# Options:
#   --to <role>    Target role (default: auto-detect based on from-role)
#   --pr <number>  PR number (required for reviewer transitions)
#   --timeout <s>  Timeout in seconds (default: 1800 = 30 minutes)
#
# Example:
#   wait-and-transition.sh feat/xxx worker
#   wait-and-transition.sh feat/xxx reviewer --pr 44

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_BASE="/workspaces/search-hub--worktrees"

BRANCH="${1:?Usage: wait-and-transition.sh <branch> <from-role> [options]}"
FROM_ROLE="${2:?Usage: wait-and-transition.sh <branch> <from-role> [options]}"
TO_ROLE=""
PR_NUM=""
TIMEOUT=1800

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)
      TO_ROLE="$2"
      shift 2
      ;;
    --pr)
      PR_NUM="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Auto-detect target role if not specified
if [ -z "$TO_ROLE" ]; then
  case "$FROM_ROLE" in
    worker)
      TO_ROLE="reviewer"
      ;;
    reviewer)
      TO_ROLE="auto"  # Will be determined by review result
      ;;
    *)
      echo "Unknown from-role: $FROM_ROLE" >&2
      exit 1
      ;;
  esac
fi

# Find the pane for this branch
BRANCH_DASH=$(echo "$BRANCH" | tr '/' '-')
WINDOW_NAME="sh-$BRANCH_DASH"
PANE_ID=$(tmux list-panes -a -F "#{pane_id} #{window_name}" 2>/dev/null | \
  grep " $WINDOW_NAME$" | head -1 | cut -d' ' -f1 || true)

if [ -z "$PANE_ID" ]; then
  echo "[wait-and-transition] ERROR: No tmux pane found for branch $BRANCH" >&2
  exit 1
fi

echo "[wait-and-transition] Monitoring branch: $BRANCH"
echo "[wait-and-transition] From role: $FROM_ROLE → To role: $TO_ROLE"
echo "[wait-and-transition] Pane: $PANE_ID"
echo "[wait-and-transition] Timeout: ${TIMEOUT}s"
echo ""

START_TIME=$(date +%s)

# Wait for agent to become idle and task to complete
while true; do
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
    echo "[wait-and-transition] ERROR: Timeout after ${TIMEOUT}s" >&2
    exit 1
  fi

  # Check agent state
  STATE=$("$SCRIPT_DIR/check-agent-state.sh" "$PANE_ID" 2>/dev/null || echo "error")

  if [ "$STATE" != "idle" ]; then
    echo -ne "\r[wait-and-transition] Agent state: $STATE (${ELAPSED}s elapsed)    "
    sleep 10
    continue
  fi

  # Agent is idle - check task completion
  case "$FROM_ROLE" in
    worker)
      # Check if PR exists and CI passes
      TASK_STATUS=$("$SCRIPT_DIR/check-task-completion.sh" "$BRANCH" pr-creation 2>/dev/null || echo "error")

      case "$TASK_STATUS" in
        completed)
          echo -e "\n[wait-and-transition] Worker completed! PR created and CI passed."
          PR_NUM=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
          break
          ;;
        ci-pending)
          echo -ne "\r[wait-and-transition] PR created, waiting for CI... (${ELAPSED}s)    "
          sleep 10
          ;;
        ci-failed)
          echo -e "\n[wait-and-transition] WARNING: CI failed. Agent may need to fix."
          # Don't transition - let the agent handle it or wait for user input
          sleep 30
          ;;
        pending)
          echo -ne "\r[wait-and-transition] Waiting for PR creation... (${ELAPSED}s)    "
          sleep 10
          ;;
        *)
          echo -ne "\r[wait-and-transition] Unknown status: $TASK_STATUS (${ELAPSED}s)    "
          sleep 10
          ;;
      esac
      ;;

    reviewer)
      if [ -z "$PR_NUM" ]; then
        # Try to find PR number
        PR_NUM=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
        if [ -z "$PR_NUM" ]; then
          echo "[wait-and-transition] ERROR: No PR found for branch $BRANCH" >&2
          exit 1
        fi
      fi

      REVIEW_STATUS=$("$SCRIPT_DIR/check-task-completion.sh" "$BRANCH" review "$PR_NUM" 2>/dev/null || echo "error")

      case "$REVIEW_STATUS" in
        approved)
          echo -e "\n[wait-and-transition] Review approved! Ready for merge."
          TO_ROLE="done"
          break
          ;;
        changes_requested)
          echo -e "\n[wait-and-transition] Changes requested. Transitioning back to worker."
          TO_ROLE="worker"
          break
          ;;
        commented)
          echo -e "\n[wait-and-transition] Review commented (no approval/rejection)."
          # Treat as needing attention
          TO_ROLE="worker"
          break
          ;;
        pending)
          echo -ne "\r[wait-and-transition] Waiting for review... (${ELAPSED}s)    "
          sleep 10
          ;;
        *)
          echo -ne "\r[wait-and-transition] Unknown review status: $REVIEW_STATUS (${ELAPSED}s)    "
          sleep 10
          ;;
      esac
      ;;
  esac
done

echo ""
echo "[wait-and-transition] Transitioning to: $TO_ROLE"

# Execute transition
case "$TO_ROLE" in
  reviewer)
    echo "[wait-and-transition] Killing current agent and spawning reviewer..."
    "$SCRIPT_DIR/kill-agent.sh" "$PANE_ID" --keep-pane 2>/dev/null || true
    sleep 2
    "$SCRIPT_DIR/spawn-reviewer.sh" "$BRANCH" "$PR_NUM"
    echo "[wait-and-transition] Reviewer agent started for PR #$PR_NUM"
    ;;

  worker)
    # Get review comments to include in the fix instruction
    REVIEW_BODY=$(gh pr view "$PR_NUM" --json reviews --jq '.reviews[-1].body // "No details provided"' 2>/dev/null || echo "")

    echo "[wait-and-transition] Sending fix instruction to worker..."
    "$SCRIPT_DIR/send-to-agent.sh" "$PANE_ID" "レビューで修正が要求されました。以下のフィードバックに対応してください:

$REVIEW_BODY

修正が完了したらpushしてください。"
    echo "[wait-and-transition] Fix instruction sent to worker"
    ;;

  done)
    echo "[wait-and-transition] Review approved. PR #$PR_NUM is ready for merge."
    echo ""
    echo "To merge:"
    echo "  gh pr merge $PR_NUM --squash --delete-branch"
    ;;

  *)
    echo "[wait-and-transition] Unknown target role: $TO_ROLE" >&2
    exit 1
    ;;
esac

echo ""
echo "[wait-and-transition] Transition complete."
