# Task: Refactor `config` Command — `--global`/`--local`/`--show-origin`/`--env-vars`

## Purpose

Add scope awareness to `search-hub config` so users can read/write global and local settings independently, inspect where a value originates, and discover available environment variable names (issue #138).

## Related Specs

- [spec/models/config.md](../models/config.md) - Configuration specification
- [spec/decisions/003-config-priority.md](../decisions/003-config-priority.md) - Config priority ADR

## Related Source Files

- `src/cli/commands/config.ts` - Config command implementation
- `src/cli/commands/config.test.ts`
- `src/config/env.ts` - Environment variable mapping
- `src/cli/index.ts` - CLI registration

## Implementation Steps

### Step 1: Add `--global` and `--local` flags for config writes

- [x] Write test: `src/cli/commands/config.test.ts`
  - `config --global key value` writes to global config path
  - `config --local key value` writes to `.search-hub/config.toml`
  - Default scope: `--local` when inside a project, `--global` when outside
  - Error when `--local` used outside a project (no `.search-hub/`)
  - `--global` and `--local` are mutually exclusive
- [x] Create stub: `src/cli/commands/config.ts`
- [x] Verify test fails (Red)
- [x] Implement feature
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Writes go to the correct config file based on scope flag

### Step 2: Secret key write protection

- [x] Write test: `src/cli/commands/config.test.ts`
  - Writing `api_key`, `inst_token`, or `email` to local config triggers warning
  - Warning message suggests using `--global` instead
  - Non-secret keys do not trigger warning
- [x] Verify test fails (Red)
- [x] Implement feature
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Secret keys to local config produce a warning

### Step 3: Add `--show-origin` flag for config reads

- [x] Write test: `src/cli/commands/config.test.ts`
  - `config --show-origin key` shows value with source (global/local/default/env)
  - Format: `<origin>  <path>  <key> = <value>`
  - Works for all config keys
- [x] Verify test fails (Red)
- [x] Implement feature
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: `--show-origin` correctly identifies the source of each config value

### Step 4: Add `--list --global` and `--list --local` filters

- [x] Write test: `src/cli/commands/config.test.ts`
  - `config --list --global` shows only global config values
  - `config --list --local` shows only local config values
  - `config --list` shows merged config (existing behavior)
- [x] Verify test fails (Red)
- [x] Implement feature
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Filtered listing works for each scope

### Step 5: Add `--env-vars` flag

- [x] Write test: `src/cli/commands/config.test.ts`
  - `config --env-vars` prints the full `ENV_VAR_MAP` table
  - Output format: `SEARCH_HUB_PUBMED_API_KEY  →  providers.pubmed.api_key`
- [x] Verify test fails (Red)
- [x] Implement feature
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: `--env-vars` prints all available environment variable mappings

### Step 6: Update CLI command registration

- [x] Write test: CLI integration tests
  - All new flags registered correctly
  - Flag combinations validated (mutual exclusivity)
  - Help text updated with new examples
- [x] Verify test fails (Red)
- [x] Implement feature
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: `search-hub config --help` shows all new options

### Final Step: E2E Integration Tests (MANDATORY)

- [x] Write E2E test: `src/cli/commands/config.e2e.test.ts`
  - Set a value with `--global`, read it back
  - Set a value with `--local`, read it back, verify it overrides global
  - `--show-origin` correctly reports source
  - `--env-vars` prints the mapping table
  - Secret key warning works in real CLI execution
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: Test all flag combinations in a real terminal
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- The `--show-origin` feature requires tracking which layer each config value came from during merge
- Consider adding an `origin` metadata map alongside the merged config in `loadConfig()`
