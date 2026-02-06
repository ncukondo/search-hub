---
name: merge-pr
description: Merges a PR with proper cleanup of worktree and branch. Use when merging approved PRs.
---

# Merge PR #$ARGUMENTS

PR #$ARGUMENTS のマージ処理を行います。

## PR Status
!`gh pr view $ARGUMENTS --json state,mergeable,mergeStateStatus,reviewDecision 2>/dev/null | jq -r '"State: \(.state)\nMergeable: \(.mergeable)\nMerge Status: \(.mergeStateStatus)\nReview: \(.reviewDecision)"' || echo "PR not found"`

## CI Status
!`gh pr checks $ARGUMENTS --json name,conclusion 2>/dev/null | jq -r '.[] | "\(.conclusion // "pending"): \(.name)"' | head -5 || echo "No checks"`

## Steps

### 1. Verify CI

Wait for CI if still running:
```bash
while true; do
  status=$(gh pr checks $ARGUMENTS --json conclusion --jq 'all(.conclusion == "SUCCESS" or .conclusion == "SKIPPED")' 2>/dev/null)
  if [ "$status" = "true" ]; then break; fi
  echo "Waiting for CI..."
  sleep 30
done
```

### 2. Merge

```bash
# Don't use --delete-branch (fails when worktree exists)
gh pr merge $ARGUMENTS --squash
```

### 3. Cleanup (order matters!)

**Must follow this order** (branch deletion fails while worktree exists):

```bash
# 1. Update main
git checkout main && git pull

# 2. Remove worktree
git worktree list  # Find the worktree path
git worktree remove /workspaces/search-hub--worktrees/<branch-dir>

# 3. Delete branch
git branch -d <branch-name>
```

### 4. Task Completion (on main branch)

- Move task file from `spec/tasks/active/` to `spec/tasks/completed/`
- Update spec/tasks/ROADMAP.md status to "Done"
- Commit & push

## Batch Merge

For multiple PRs:

```bash
# 1. Merge each PR
gh pr merge <PR1> --squash
gh pr merge <PR2> --squash

# 2. Update main
git checkout main && git pull

# 3. Remove worktrees
git worktree remove /workspaces/search-hub--worktrees/<branch1>
git worktree remove /workspaces/search-hub--worktrees/<branch2>

# 4. Delete branches
git branch -d <branch1> <branch2>
```

**Note**: If conflicts occur on 2nd+ PR, rebase that branch and retry.
