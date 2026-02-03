# Claude Code Context

## Project Overview

search-hub: CLI tool for systematic literature searching across multiple academic databases.

## Work Guidelines

1. **Starting Point**: Always begin work from `spec/README.md` to understand current tasks and priorities.

2. **Commit Frequently**: Make commits at small, logical units of work. Do not accumulate large changes.

3. **Context Management**: If compact (context summarization) appears likely before completing the current task, report this to the user and pause work to avoid losing important context.

## Agent Role

When working in a worktree, a role file is specified at the bottom of this file (e.g. `<!-- role: implement -->`).
Read the corresponding role file from `spec/roles/{role}.md` and follow its instructions.

Available roles:
- `implement` — TDD implementation worker (`spec/roles/implement.md`)
- `review` — PR reviewer (`spec/roles/review.md`)
