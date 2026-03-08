# Task: Config Loader — `.search-hub/` Local Project Discovery

## Purpose

Update `loadConfig()` to discover and merge `.search-hub/config.toml` from the project directory. This replaces the previous `./search-hub.config.toml` convention with a `.search-hub/` directory structure, enabling project-local configuration alongside global settings.

This is the foundation for the two-tier config redesign (issue #138).

## Related Specs

- [spec/models/config.md](../models/config.md) - Configuration specification (will be updated in task #133)
- [spec/decisions/003-config-priority.md](../decisions/003-config-priority.md) - Config priority ADR

## Related Source Files

- `src/config/paths.ts` - Path resolution (add `.search-hub/` discovery)
- `src/config/paths.test.ts`
- `src/config/loader.ts` - Config loading (update local config path)
- `src/config/loader.test.ts`
- `src/config/index.ts` - Re-exports

## Implementation Steps

### Step 1: Add `.search-hub/` project directory discovery

- [ ] Write test: `src/config/paths.test.ts`
  - `getProjectDir()` returns `.search-hub/` path relative to cwd
  - `getLocalConfigPath()` returns `.search-hub/config.toml`
  - `getLocalSessionsDir()` returns `.search-hub/sessions/`
  - `getLocalQueriesDir()` returns `.search-hub/queries/`
  - `isInsideProject()` returns true when `.search-hub/` exists in cwd
- [ ] Create stub: `src/config/paths.ts`
- [ ] Verify test fails (Red)
- [ ] Implement feature
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `getProjectDir()` resolves `.search-hub/` from cwd; `isInsideProject()` detects existing project

### Step 2: Update `loadConfig()` to use `.search-hub/config.toml`

- [ ] Write test: `src/config/loader.test.ts`
  - Loads and merges `.search-hub/config.toml` when present
  - Falls back to global-only when `.search-hub/` does not exist
  - Merge order: default → global → local → env vars → CLI flags
  - Local config overrides global config at field level (deep merge)
- [ ] Create stub: `src/config/loader.ts`
- [ ] Verify test fails (Red)
- [ ] Implement feature
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `loadConfig()` respects the full merge chain; existing behavior preserved when no `.search-hub/` exists

### Step 3: Update session directory resolution for local projects

- [ ] Write test: `src/config/loader.test.ts`
  - When inside a project, default session directory is `.search-hub/sessions/`
  - When outside a project, default session directory is `<data-dir>/sessions/` (existing behavior)
  - Explicit `session.directory` in config overrides both defaults
- [ ] Verify test fails (Red)
- [ ] Implement feature
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: Session data goes to `.search-hub/sessions/` by default in project context

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/config/loader.e2e.test.ts`
  - Create temp directory with `.search-hub/config.toml`
  - Verify `loadConfig()` merges global + local correctly
  - Verify session directory resolution in project vs non-project context
  - Verify backward compatibility (no `.search-hub/` → existing behavior)
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test config loading in a real directory with `.search-hub/`
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- The old `./search-hub.config.toml` path from the spec was never implemented; no migration needed
- This task only changes config loading; `init` and `config` commands are updated in subsequent tasks
