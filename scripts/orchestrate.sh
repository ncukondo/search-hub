#!/usr/bin/env bash
set -euo pipefail

# Orchestrate all worker agents - monitor and auto-transition through workflow.
#
# Usage: orchestrate.sh [options]
#
# Options:
#   --background, -b    Run in background (detach from terminal)
#   --interval <sec>    Check interval in seconds (default: 15)
#   --main-pane <id>    Main agent pane ID for notifications (auto-detect if omitted)
#
# Workflow:
#   Worker (idle + PR created + CI pass) → kill → spawn Reviewer
#   Reviewer (idle + review posted) → notify main agent with result
#   Fixer (idle + push done) → notify main agent
#
# Unexpected situations are always reported to main agent:
#   - CI failure
#   - Agent error state
#   - Timeout
#   - Unknown states

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="/tmp/claude-orchestrator"
LOG_FILE="$STATE_DIR/orchestrator.log"
NOTIFY_FILE="$STATE_DIR/notifications"
PID_FILE="$STATE_DIR/orchestrator.pid"
WORKTREE_BASE="/workspaces/search-hub--worktrees"

BACKGROUND=false
INTERVAL=15
MAIN_PANE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --background|-b)
      BACKGROUND=true
      shift
      ;;
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    --main-pane)
      MAIN_PANE="$2"
      shift 2
      ;;
    --stop)
      if [ -f "$PID_FILE" ]; then
        kill "$(cat "$PID_FILE")" 2>/dev/null || true
        rm -f "$PID_FILE"
        echo "[orchestrate] Stopped"
      else
        echo "[orchestrate] Not running"
      fi
      exit 0
      ;;
    --status)
      if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "running (PID: $(cat "$PID_FILE"))"
      else
        echo "stopped"
      fi
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Setup
mkdir -p "$STATE_DIR"

# Auto-detect main pane (the pane running in main worktree)
if [ -z "$MAIN_PANE" ]; then
  # Find pane with cwd = /workspaces/search-hub (not worktrees)
  MAIN_PANE=$(tmux list-panes -a -F "#{pane_id} #{pane_current_path}" 2>/dev/null | \
    grep " /workspaces/search-hub$" | head -1 | cut -d' ' -f1 || true)
fi

log() {
  local msg="[$(date '+%H:%M:%S')] $*"
  echo "$msg" >> "$LOG_FILE"
  if [ "$BACKGROUND" = false ]; then
    echo "$msg"
  fi
}

# Notify main agent about an event
notify_main() {
  local level="$1"  # info, warning, error
  local message="$2"

  local timestamp
  timestamp=$(date '+%H:%M:%S')

  # Append to notification file
  echo "[$timestamp] [$level] $message" >> "$NOTIFY_FILE"

  # Send to main pane if available
  if [ -n "$MAIN_PANE" ] && tmux has-session -t "$MAIN_PANE" 2>/dev/null; then
    # Use a visible notification format
    local prefix=""
    case "$level" in
      error)   prefix="[ORCHESTRATOR ERROR]" ;;
      warning) prefix="[ORCHESTRATOR WARNING]" ;;
      info)    prefix="[ORCHESTRATOR]" ;;
    esac

    # Send notification as a comment (won't execute)
    tmux send-keys -t "$MAIN_PANE" "# $prefix $message" 2>/dev/null || true
    sleep 0.5
    tmux send-keys -t "$MAIN_PANE" Enter 2>/dev/null || true
  fi

  log "NOTIFY [$level]: $message"
}

# Get all active worktree branches (excluding main)
get_active_branches() {
  git worktree list --porcelain 2>/dev/null | \
    grep "^branch refs/heads/" | \
    sed 's|^branch refs/heads/||' | \
    grep -v "^main$" || true
}

# Find pane ID for a branch
find_pane_for_branch() {
  local branch="$1"
  local branch_dash
  branch_dash=$(echo "$branch" | tr '/' '-')
  local worktree_path="$WORKTREE_BASE/$branch_dash"

  # Find pane with matching cwd
  tmux list-panes -a -F "#{pane_id} #{pane_current_path}" 2>/dev/null | \
    grep " $worktree_path$" | head -1 | cut -d' ' -f1 || true
}

# Get current role from CLAUDE.md
get_current_role() {
  local branch="$1"
  local branch_dash
  branch_dash=$(echo "$branch" | tr '/' '-')
  local claude_md="$WORKTREE_BASE/$branch_dash/CLAUDE.md"

  if [ -f "$claude_md" ]; then
    grep "^<!-- role:" "$claude_md" | sed 's/<!-- role: \(.*\) -->/\1/' || echo "unknown"
  else
    echo "unknown"
  fi
}

# Track branch states to detect changes
declare -A BRANCH_STATES
declare -A BRANCH_LAST_ACTIVITY

# Process a single branch
process_branch() {
  local branch="$1"
  local pane_id
  pane_id=$(find_pane_for_branch "$branch")

  if [ -z "$pane_id" ]; then
    # No pane found - might be cleaned up or not yet started
    return
  fi

  # Check if pane still exists
  if ! tmux has-session -t "$pane_id" 2>/dev/null; then
    log "Branch $branch: pane $pane_id no longer exists"
    return
  fi

  # Get agent state
  local agent_state
  agent_state=$("$SCRIPT_DIR/check-agent-state.sh" "$pane_id" 2>/dev/null || echo "error")

  local role
  role=$(get_current_role "$branch")

  local state_key="${branch}:${role}"
  local prev_state="${BRANCH_STATES[$state_key]:-unknown}"

  # Handle error state
  if [ "$agent_state" = "error" ]; then
    if [ "$prev_state" != "error" ]; then
      notify_main "error" "Branch $branch ($role): Agent in error state"
      BRANCH_STATES[$state_key]="error"
    fi
    return
  fi

  # Only process when agent becomes idle
  if [ "$agent_state" != "idle" ]; then
    BRANCH_STATES[$state_key]="$agent_state"
    BRANCH_LAST_ACTIVITY[$branch]=$(date +%s)
    return
  fi

  # Agent is idle - check what to do based on role
  case "$role" in
    implement)
      process_implement_completion "$branch" "$pane_id"
      ;;
    review)
      process_review_completion "$branch" "$pane_id"
      ;;
    *)
      # Unknown role - just log
      if [ "$prev_state" != "idle-$role" ]; then
        log "Branch $branch: idle with unknown role '$role'"
        BRANCH_STATES[$state_key]="idle-$role"
      fi
      ;;
  esac
}

process_implement_completion() {
  local branch="$1"
  local pane_id="$2"

  local task_status
  task_status=$("$SCRIPT_DIR/check-task-completion.sh" "$branch" pr-creation 2>/dev/null || echo "error")

  case "$task_status" in
    completed)
      local pr_num
      pr_num=$(gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null || true)

      if [ -n "$pr_num" ]; then
        log "Branch $branch: Worker completed, PR #$pr_num ready. Transitioning to reviewer..."

        # Kill current agent
        "$SCRIPT_DIR/kill-agent.sh" "$pane_id" --keep-pane 2>/dev/null || true
        sleep 2

        # Spawn reviewer
        "$SCRIPT_DIR/spawn-reviewer.sh" "$branch" "$pr_num" 2>/dev/null || {
          notify_main "error" "Branch $branch: Failed to spawn reviewer for PR #$pr_num"
          return
        }

        notify_main "info" "Branch $branch: Reviewer started for PR #$pr_num"
        BRANCH_STATES["${branch}:implement"]="transitioned"
      else
        notify_main "warning" "Branch $branch: PR completed but could not find PR number"
      fi
      ;;

    ci-pending)
      # Still waiting - no action needed
      ;;

    ci-failed)
      local state_key="${branch}:implement:ci-failed"
      if [ "${BRANCH_STATES[$state_key]:-}" != "notified" ]; then
        notify_main "warning" "Branch $branch: CI failed. Worker may need to fix or manual intervention required."
        BRANCH_STATES[$state_key]="notified"
      fi
      ;;

    pending)
      # No PR yet - worker still working or idle without completion
      ;;

    error|*)
      notify_main "error" "Branch $branch: Unexpected task status: $task_status"
      ;;
  esac
}

process_review_completion() {
  local branch="$1"
  local pane_id="$2"

  local pr_num
  pr_num=$(gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null || true)

  if [ -z "$pr_num" ]; then
    notify_main "error" "Branch $branch: Reviewer active but no PR found"
    return
  fi

  local review_status
  review_status=$("$SCRIPT_DIR/check-task-completion.sh" "$branch" review "$pr_num" 2>/dev/null || echo "error")

  case "$review_status" in
    approved)
      notify_main "info" "Branch $branch: PR #$pr_num APPROVED - Ready for merge"

      # Kill reviewer agent
      "$SCRIPT_DIR/kill-agent.sh" "$pane_id" 2>/dev/null || true

      BRANCH_STATES["${branch}:review"]="approved"
      ;;

    changes_requested)
      # Get review body for the notification
      local review_body
      review_body=$(gh pr view "$pr_num" --json reviews --jq '.reviews[-1].body // "No details"' 2>/dev/null | head -c 200 || echo "")

      notify_main "info" "Branch $branch: PR #$pr_num CHANGES REQUESTED - $review_body"

      # Transition back to fixer
      log "Branch $branch: Sending fix instructions to worker..."

      local full_review
      full_review=$(gh pr view "$pr_num" --json reviews --jq '.reviews[-1].body // "修正が必要です"' 2>/dev/null || echo "修正が必要です")

      "$SCRIPT_DIR/send-to-agent.sh" "$pane_id" "レビューで修正が要求されました。以下のフィードバックに対応してください:

$full_review

修正が完了したらpushしてください。" 2>/dev/null || {
        notify_main "error" "Branch $branch: Failed to send fix instructions"
        return
      }

      # Update role to implement (fixer mode)
      "$SCRIPT_DIR/set-role.sh" "$WORKTREE_BASE/$(echo "$branch" | tr '/' '-')" implement 2>/dev/null || true

      BRANCH_STATES["${branch}:review"]="fix-requested"
      ;;

    commented)
      # Review with comments only (no approve/reject)
      local review_body
      review_body=$(gh pr view "$pr_num" --json reviews --jq '.reviews[-1].body // "No details"' 2>/dev/null | head -c 200 || echo "")

      notify_main "info" "Branch $branch: PR #$pr_num COMMENTED (no decision) - $review_body"
      BRANCH_STATES["${branch}:review"]="commented"
      ;;

    pending)
      # Review not yet posted - still working
      ;;

    error|*)
      notify_main "error" "Branch $branch: Unexpected review status: $review_status"
      ;;
  esac
}

# Main loop
main_loop() {
  log "Orchestrator started (interval: ${INTERVAL}s, main pane: ${MAIN_PANE:-none})"

  while true; do
    for branch in $(get_active_branches); do
      process_branch "$branch"
    done

    sleep "$INTERVAL"
  done
}

# Run
if [ "$BACKGROUND" = true ]; then
  # Daemonize
  echo $$ > "$PID_FILE"
  exec >> "$LOG_FILE" 2>&1
  main_loop &
  disown
  echo "[orchestrate] Started in background (PID: $$)"
  echo "[orchestrate] Log: $LOG_FILE"
  echo "[orchestrate] Stop: $0 --stop"
else
  # Foreground
  echo $$ > "$PID_FILE"
  trap 'rm -f "$PID_FILE"; exit 0' INT TERM
  main_loop
fi
