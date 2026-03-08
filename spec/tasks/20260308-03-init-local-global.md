# Task: Refactor `init` Command — Local Default + `--global` Flag

## Purpose

Change `search-hub init` to create a `.search-hub/` project directory in pwd by default. Add `--global` flag to initialize the global config at the XDG path with credential hints. This aligns with the git-like mental model where `init` is project-scoped (issue #138).

## Related Specs

- [spec/models/config.md](../models/config.md) - Configuration specification
- [spec/decisions/003-config-priority.md](../decisions/003-config-priority.md) - Config priority ADR

## Related Source Files

- `src/cli/commands/init.ts` - Init command implementation
- `src/cli/commands/init.test.ts`
- `src/cli/index.ts` - CLI registration

## Implementation Steps

### Step 1: Refactor `init()` to create `.search-hub/` locally by default

- [ ] Write test: `src/cli/commands/init.test.ts`
  - `init()` creates `.search-hub/config.toml` in specified directory
  - `init()` creates `.search-hub/sessions/` and `.search-hub/queries/`
  - Generated `config.toml` contains provider enabled/disabled flags, max_results, etc. (no secrets)
  - `--force` overwrites existing `.search-hub/`
  - Conflict detection when `.search-hub/` already exists
- [ ] Create stub: `src/cli/commands/init.ts`
- [ ] Verify test fails (Red)
- [ ] Implement feature
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `init()` creates `.search-hub/` structure in target directory with project-scoped config

### Step 2: Add `--global` flag to create global config

- [ ] Write test: `src/cli/commands/init.test.ts`
  - `init({ global: true })` creates config at XDG global path
  - Global config contains credential placeholders as comments (api_key, email, inst_token)
  - Global config contains log/output preferences
  - `--force` works with `--global`
- [ ] Verify test fails (Red)
- [ ] Implement feature
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `init --global` creates global config template with credential hints

### Step 3: Update CLI output messages and hints

- [ ] Write test: `src/cli/commands/init.test.ts`
  - Local init output includes hint about `search-hub init --global`
  - Local init output includes hint about `.env` and `search-hub config --env-vars`
  - Global init output includes recommended `search-hub config --global` commands
- [ ] Verify test fails (Red)
- [ ] Implement feature
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: CLI output provides actionable next-step hints

### Step 4: Update CLI command registration

- [ ] Write test: `src/cli/index.ts` related tests
  - `search-hub init` calls local init
  - `search-hub init --global` calls global init
  - `search-hub init --force` works for both modes
  - Exit codes are correct for all scenarios
- [ ] Verify test fails (Red)
- [ ] Implement feature
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: CLI correctly dispatches to local/global init based on flags

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/cli/commands/init.e2e.test.ts`
  - Run `search-hub init` in temp directory → verify `.search-hub/` structure
  - Run `search-hub init --global` → verify global config path and content
  - Run `search-hub init` twice → verify conflict message
  - Run `search-hub init --force` → verify overwrite
  - Verify generated config.toml is valid TOML and parseable
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run `search-hub init` in a real directory
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- This is a breaking change: existing users who relied on `search-hub init` creating global config will need `search-hub init --global`
- The local config template should NOT include secrets (api_key, email, inst_token)
