#!/usr/bin/env bash
set -euo pipefail

# Monitor all Claude agents by scanning state files.
#
# Usage: monitor-agents.sh [--watch] [--json]
#
# Options:
#   --watch   Continuously monitor (refresh every 5s)
#   --json    Output as JSON instead of table
#
# Output columns:
#   PANE   - tmux pane ID (e.g., %42)
#   STATE  - Agent state (idle/working/trust)
#   AGE    - Time since last state change

STATE_DIR="/tmp/claude-agent-states"
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

# Get list of existing tmux panes
get_existing_panes() {
  tmux list-panes -a -F "#{pane_id}" 2>/dev/null || true
}

# Format age from seconds to human readable
format_age() {
  local seconds="$1"
  if [ "$seconds" -lt 60 ]; then
    echo "${seconds}s"
  elif [ "$seconds" -lt 3600 ]; then
    echo "$((seconds / 60))m"
  else
    echo "$((seconds / 3600))h"
  fi
}

print_status() {
  # Check if state directory exists
  if [ ! -d "$STATE_DIR" ]; then
    echo "No agent states found (directory $STATE_DIR does not exist)."
    return
  fi

  # Get existing panes
  local existing_panes
  existing_panes=$(get_existing_panes)

  # Collect agent data
  local agents=()
  local now
  now=$(date +%s)

  for state_file in "$STATE_DIR"/*; do
    [ -f "$state_file" ] || continue

    local pane_id
    pane_id=$(basename "$state_file")

    # Check if pane still exists
    if ! echo "$existing_panes" | grep -qx "$pane_id"; then
      # Clean up stale state file
      rm -f "$state_file"
      continue
    fi

    local state
    state=$(cat "$state_file" 2>/dev/null || echo "unknown")

    local mtime age_seconds
    mtime=$(stat -c %Y "$state_file" 2>/dev/null || echo "$now")
    age_seconds=$((now - mtime))

    agents+=("$pane_id|$state|$age_seconds")
  done

  if [ ${#agents[@]} -eq 0 ]; then
    echo "No active agents found."
    return
  fi

  if [ "$JSON_OUTPUT" = true ]; then
    # JSON output
    local json_array="["
    local first=true
    for agent in "${agents[@]}"; do
      IFS='|' read -r pane_id state age_seconds <<< "$agent"
      if [ "$first" = true ]; then
        first=false
      else
        json_array+=","
      fi
      json_array+="{\"pane\":\"$pane_id\",\"state\":\"$state\",\"age_seconds\":$age_seconds}"
    done
    json_array+="]"
    echo "$json_array" | jq '.'
  else
    # Table output
    printf "%-8s %-10s %-8s\n" "PANE" "STATE" "AGE"
    printf "%-8s %-10s %-8s\n" "--------" "----------" "--------"

    for agent in "${agents[@]}"; do
      IFS='|' read -r pane_id state age_seconds <<< "$agent"
      local age_display
      age_display=$(format_age "$age_seconds")
      printf "%-8s %-10s %-8s\n" "$pane_id" "$state" "$age_display"
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
    sleep 5
  done
else
  print_status
fi
