#!/usr/bin/env bash
set -euo pipefail

# Monitor all workmux agents and display their status.
#
# Usage: monitor-agents.sh [--watch] [--json]
#
# Options:
#   --watch   Continuously monitor (refresh every 10s)
#   --json    Output as JSON instead of table
#
# Output columns:
#   BRANCH  - Git branch name
#   AGENT   - Agent state (idle/working/trust/-)
#   PR      - PR number or "-"
#   CI      - CI status (pass/fail/pending/-)
#   REVIEW  - Review status (approved/changes/pending/-)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCH=false
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --watch|-w)
      WATCH=true
      shift
      ;;
    --json|-j)
      JSON_OUTPUT=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

get_agent_status() {
  local worktree_path="$1"
  local branch="$2"

  # Find the tmux pane for this worktree
  # workmux creates windows with prefix "sh-<branch-with-dashes>"
  local window_name="sh-$(echo "$branch" | tr '/' '-')"
  local pane_id=""

  # Find pane in this window
  pane_id=$(tmux list-panes -a -F "#{pane_id} #{window_name}" 2>/dev/null | \
    grep " $window_name$" | head -1 | cut -d' ' -f1 || true)

  if [ -z "$pane_id" ]; then
    echo "-"
    return
  fi

  # Check agent state
  "$SCRIPT_DIR/check-agent-state.sh" "$pane_id" 2>/dev/null || echo "-"
}

get_pr_info() {
  local branch="$1"
  gh pr list --head "$branch" --json number --jq '.[0].number // empty' 2>/dev/null || true
}

get_ci_status() {
  local pr_num="$1"
  if [ -z "$pr_num" ]; then
    echo "-"
    return
  fi

  local result
  result=$("$SCRIPT_DIR/check-task-completion.sh" "" pr-creation 2>/dev/null || echo "error")

  # Re-check using PR number directly since we already have it
  local failed pending
  failed=$(gh pr checks "$pr_num" --json conclusion \
    --jq '[.[] | select(.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "")] | length' \
    2>/dev/null || echo "0")
  pending=$(gh pr checks "$pr_num" --json state \
    --jq '[.[] | select(.state == "PENDING" or .state == "IN_PROGRESS")] | length' \
    2>/dev/null || echo "0")

  if [ "$pending" -gt 0 ]; then
    echo "pending"
  elif [ "$failed" -gt 0 ]; then
    echo "fail"
  else
    echo "pass"
  fi
}

get_review_status() {
  local pr_num="$1"
  if [ -z "$pr_num" ]; then
    echo "-"
    return
  fi

  "$SCRIPT_DIR/check-task-completion.sh" "" review "$pr_num" 2>/dev/null || echo "-"
}

print_status() {
  # Get worktree list from workmux
  local worktrees
  worktrees=$(workmux list --json 2>/dev/null || echo "[]")

  if [ "$worktrees" = "[]" ]; then
    echo "No active worktrees found."
    return
  fi

  if [ "$JSON_OUTPUT" = true ]; then
    # JSON output
    echo "$worktrees" | jq -c '.[]' | while read -r wt; do
      branch=$(echo "$wt" | jq -r '.branch')
      path=$(echo "$wt" | jq -r '.path')

      # Skip main branch
      if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
        continue
      fi

      agent=$(get_agent_status "$path" "$branch")
      pr=$(get_pr_info "$branch")
      ci=$(get_ci_status "$pr")
      review=$(get_review_status "$pr")

      jq -n \
        --arg branch "$branch" \
        --arg agent "$agent" \
        --arg pr "${pr:-"-"}" \
        --arg ci "$ci" \
        --arg review "$review" \
        '{branch: $branch, agent: $agent, pr: $pr, ci: $ci, review: $review}'
    done | jq -s '.'
  else
    # Table output
    printf "%-35s %-8s %-6s %-8s %-10s\n" "BRANCH" "AGENT" "PR" "CI" "REVIEW"
    printf "%-35s %-8s %-6s %-8s %-10s\n" "-----------------------------------" "--------" "------" "--------" "----------"

    echo "$worktrees" | jq -c '.[]' | while read -r wt; do
      branch=$(echo "$wt" | jq -r '.branch')
      path=$(echo "$wt" | jq -r '.path')

      # Skip main branch
      if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
        continue
      fi

      agent=$(get_agent_status "$path" "$branch")
      pr=$(get_pr_info "$branch")
      pr_display="${pr:-"-"}"
      [ -n "$pr" ] && pr_display="#$pr"
      ci=$(get_ci_status "$pr")
      review=$(get_review_status "$pr")

      printf "%-35s %-8s %-6s %-8s %-10s\n" "$branch" "$agent" "$pr_display" "$ci" "$review"
    done
  fi
}

if [ "$WATCH" = true ]; then
  while true; do
    clear
    echo "=== Agent Monitor ($(date '+%H:%M:%S')) ==="
    echo ""
    print_status
    echo ""
    echo "Press Ctrl+C to exit"
    sleep 10
  done
else
  print_status
fi
