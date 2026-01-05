# Task: Config System

## Purpose

Implement the configuration system that loads, validates, and merges settings from multiple sources (files, environment variables, CLI arguments). This is foundational for all other features.

## Related Specs

- [spec/models/config.md](../../models/config.md) - Full schema and loading logic
- [spec/cli/commands.md](../../cli/commands.md) - `init` command

## Related Source Files

- `src/config/schema.ts` - Zod schemas
- `src/config/defaults.ts` - Default values
- `src/config/loader.ts` - TOML loading and config merging
- `src/config/env.ts` - Environment variable mapping
- `src/config/index.ts` - Public API
- `src/utils/deep-merge.ts` - Deep merge utility
- `src/utils/path.ts` - Path expansion utility
- `src/cli/commands/init.ts` - Init command

## Implementation Steps

- [x] Step 1: Define Zod schemas
  - [x] Write test: `src/config/schema.test.ts`
    - Valid config parsing
    - Default values applied
    - Validation errors for invalid input
  - [x] Create stub: `src/config/schema.ts`
  - [x] Verify test fails (Red)
  - [x] Implement `ProviderConfigSchema`, `ConfigSchema`, export `Config` type
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed, verify test still passes
  - [x] Acceptance: `ConfigSchema.parse({})` returns full default config

- [x] Step 2: Implement default config
  - [x] Write test: `src/config/defaults.test.ts`
    - `getDefaultConfig()` returns valid Config
    - All required fields present
  - [x] Create stub: `src/config/defaults.ts`
  - [x] Verify test fails (Red)
  - [x] Implement `DEFAULT_CONFIG`, `getDefaultConfig()`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed, verify test still passes
  - [x] Acceptance: `getDefaultConfig()` passes `ConfigSchema.parse()`

- [x] Step 3: Implement deep merge utility
  - [x] Write test: `src/utils/deep-merge.test.ts`
    - Shallow properties merge
    - Nested objects merge recursively
    - Arrays are replaced (not merged)
    - Undefined values don't override
  - [x] Create stub: `src/utils/deep-merge.ts`
  - [x] Verify test fails (Red)
  - [x] Implement `deepMerge<T>(base: T, override: DeepPartial<T>): T`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed, verify test still passes
  - [x] Acceptance: `deepMerge({a: {b: 1}}, {a: {c: 2}})` returns `{a: {b: 1, c: 2}}`

- [x] Step 4: Implement path expansion utility
  - [x] Write test: `src/utils/path.test.ts`
    - `~` expands to home directory
    - Absolute paths unchanged
    - Relative paths unchanged
  - [x] Create stub: `src/utils/path.ts`
  - [x] Verify test fails (Red)
  - [x] Implement `expandPath(path: string): string`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed, verify test still passes
  - [x] Acceptance: `expandPath('~/foo')` returns `/home/<user>/foo`

- [ ] Step 5: Implement TOML loader
  - [ ] Write test: `src/config/loader.test.ts`
    - Load valid TOML file
    - Missing file returns empty object
    - Invalid TOML throws with clear message
  - [ ] Create stub: `src/config/loader.ts`
  - [ ] Verify test fails (Red)
  - [ ] Implement `loadTomlFile(path: string): Promise<Partial<RawConfig>>`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Refactor if needed, verify test still passes
  - [ ] Acceptance: loads TOML and returns partial config object

- [ ] Step 6: Implement environment variable mapping
  - [ ] Write test: `src/config/env.test.ts`
    - `SEARCH_HUB_PUBMED_API_KEY` sets `providers.pubmed.api_key`
    - `SEARCH_HUB_LOG_LEVEL` sets `log.level`
    - Missing env vars don't affect config
  - [ ] Create stub: `src/config/env.ts`
  - [ ] Verify test fails (Red)
  - [ ] Implement `ENV_VAR_MAP`, `applyEnvVars(config: Config): Config`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Refactor if needed, verify test still passes
  - [ ] Acceptance: env vars override config values at correct paths

- [ ] Step 7: Implement full config loader
  - [ ] Write test: `src/config/loader.test.ts` (add to existing)
    - Priority: global < local < env < cli
    - Deep merge works across sources
    - Final config passes validation
  - [ ] Implement `loadConfig(cliOptions?): Promise<Config>` in `loader.ts`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Refactor if needed, verify test still passes
  - [ ] Acceptance: CLI options override all other sources

- [ ] Step 8: Create public API
  - [ ] Write test: `src/config/index.test.ts`
    - All exports accessible
  - [ ] Create `src/config/index.ts`
  - [ ] Export `loadConfig`, `Config`, `ConfigSchema`, `getDefaultConfig`
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `import { loadConfig } from './config'` works

- [ ] Step 9: Implement `init` command skeleton
  - [ ] Write test: `src/cli/commands/init.test.ts`
    - Creates `~/.search-hub/` directory
    - Creates `config.toml` with defaults
    - Creates `sessions/` directory
    - `--force` overwrites existing
    - Without `--force`, warns if exists
  - [ ] Create stub: `src/cli/commands/init.ts`
  - [ ] Verify test fails (Red)
  - [ ] Implement init command
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Refactor if needed, verify test still passes
  - [ ] Acceptance: `init` creates valid config file

## Notes

- Use `@iarna/toml` for TOML parsing (already in dependencies)
- Use Zod v4 (already in dependencies)
- Interactive prompts for API keys will be added in CLI Commands task (Step 10)
- For now, `init` just writes defaults without prompts
