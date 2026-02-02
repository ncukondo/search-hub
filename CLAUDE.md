# Claude Code Context

## Project Overview

search-hub: CLI tool for systematic literature searching across multiple academic databases.

## Work Guidelines

1. **Starting Point**: Always begin work from `spec/README.md` to understand current tasks and priorities.

2. **Commit Frequently**: Make commits at small, logical units of work. Do not accumulate large changes.

3. **Context Management**: If compact (context summarization) appears likely before completing the current task, report this to the user and pause work to avoid losing important context.

## Worker Agent Instructions

You are a worker agent implementing a task in a worktree.

### Responsibilities
- Follow TDD (Red -> Green -> Refactor)
- Update task file checkboxes after each step and commit
- Write .worker-status.json at worktree root with current progress
- Create PR when all steps complete
- Work scope: implementation + tests + PR only (ROADMAP changes are done on main after merge)
- **All commit messages, PR titles/bodies, and PR comments MUST be in English**

### Compact Recovery
If context was compacted, re-read these before continuing:
1. Task file in spec/tasks/ (check completed steps)
2. git log --oneline -10 (recent commits)
3. git status and git diff (uncommitted work)
