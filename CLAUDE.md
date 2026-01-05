# Claude Code Context

## Project Overview

search-hub: CLI tool for systematic literature searching across multiple academic databases.

## Current Progress (2026-01-05)

### Completed

1. **Project Setup** (Task 1) - ✅ Completed
   - package.json with ESM, TypeScript, Vitest, oxlint configured
   - Directory structure created (src/cli, config, providers, query, session, utils, export)

2. **Spec/Tasks Structure**
   - `spec/tasks/ROADMAP.md` - High-level progress tracking
   - `spec/tasks/_template.md` - TDD task template with Red→Green→Refactor cycle
   - `spec/tasks/active/` and `completed/` directories created

3. **Config System Task File Created**
   - `spec/tasks/active/20260104-01-config-system.md`
   - 9 implementation steps defined with TDD checkboxes
   - Linked in ROADMAP

4. **Devcontainer Updated**
   - Added `postCreateCommand` to fix /workspaces permissions for git worktree

### Next Steps

1. **Rebuild devcontainer** to apply permission fix
2. **Create git worktree** for config-system branch:
   ```bash
   git worktree add /workspaces/search-hub--config-system -b config-system
   ```
3. **Start Config System implementation** (Task 2)
   - Follow `spec/tasks/active/20260104-01-config-system.md`
   - Begin with Step 1: Define Zod schemas (TDD)

## Development Workflow

- TDD cycle: Red → Green → Refactor (see `spec/tasks/_template.md`)
- Test files co-located with source (`*.test.ts` next to `*.ts`)
- Git worktree for feature branches: `/workspaces/search-hub--<branch-name>`

## Key Files

- `spec/tasks/ROADMAP.md` - Overall progress
- `spec/tasks/active/20260104-01-config-system.md` - Current task
- `spec/models/config.md` - Config specification
