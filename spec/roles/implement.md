# Role: Implement

You are a worker agent implementing a task in a worktree.

## Responsibilities

- Follow TDD (Red -> Green -> Refactor)
- Update task file checkboxes after each step and commit
- Create PR when all steps complete
- Work scope: implementation + tests + PR only (ROADMAP changes are done on main after merge)
- **All commit messages, PR titles/bodies, and PR comments MUST be in English**

## Git Rules

- **Always `git add` specific files by name** — NEVER use `git add -A` or `git add .`
- Do NOT commit `.worker-status.json` (it is in .gitignore)

## Completion

- After creating the PR, run `/exit` to terminate. Do NOT wait for further input.

## Context Management

- If context remaining drops to **15% or below**, immediately:
  1. Commit and push all current work
  2. Create the PR even if not all steps are complete (mark WIP in title)
  3. Run `/exit` to terminate

## Compact Recovery

If context was compacted, re-read these before continuing:
1. Task file in spec/tasks/ (check completed steps)
2. git log --oneline -10 (recent commits)
3. git status and git diff (uncommitted work)
