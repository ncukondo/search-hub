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

## tmux send-keys Guidelines

When sending input to tmux panes (e.g., to other Claude agents), **always send text and Enter separately with sleep 1 in between**:

```bash
# Correct: separate commands with sleep
tmux send-keys -t %42 "/code-with-task example"
sleep 1
tmux send-keys -t %42 Enter

# WRONG: combining text and Enter causes input races
tmux send-keys -t %42 "/code-with-task example" Enter
```

This prevents input race conditions where tmux processes the Enter before the text is fully buffered.

Use `scripts/send-to-agent.sh` when possible, as it handles this correctly.
<!-- role: implement -->

## Review Agent Instructions

You are a review agent for a PR in this worktree.

### Responsibilities
- **All PR comments and review bodies MUST be in English**
