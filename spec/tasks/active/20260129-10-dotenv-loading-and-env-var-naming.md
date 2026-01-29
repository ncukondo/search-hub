# Task: Load .env with dotenv and Unify Environment Variable Naming to SEARCH_HUB_ Prefix

## Purpose

Two problems prevent environment variables from working correctly:

1. **CLI does not load `.env`**: `dotenv` is listed as a dependency but is only imported in
   E2E test files. The CLI entrypoint (`src/cli/index.ts`) never calls `dotenv.config()`,
   so `.env` files are ignored at runtime.

2. **Inconsistent environment variable naming**: The config system (`src/config/env.ts`)
   expects `SEARCH_HUB_` prefixed variables, but E2E tests and the `.env` file use
   unprefixed names. This means even if `.env` were loaded, the variables would not match.

### Current State

| Location | Variable Names Used |
|----------|-------------------|
| `src/config/env.ts` (config system) | `SEARCH_HUB_PUBMED_API_KEY`, `SEARCH_HUB_SCOPUS_API_KEY` |
| `src/providers/pubmed/pubmed.e2e.test.ts` | `NCBI_EMAIL`, `NCBI_API_KEY` |
| `src/providers/scopus/scopus.e2e.test.ts` | `SCOPUS_API_KEY`, `SCOPUS_INST_TOKEN` |
| `src/cli/cli-execution.e2e.test.ts` | `PUBMED_API_KEY`, `PUBMED_EMAIL` |
| `.env` file | `SCOPUS_API_KEY`, `PUBMED_API_KEY`, `PUBMED_EMAIL` |

### Target State

All locations use `SEARCH_HUB_` prefixed names, and the CLI loads `.env` at startup.

| Variable | Maps To |
|----------|---------|
| `SEARCH_HUB_PUBMED_API_KEY` | `providers.pubmed.api_key` |
| `SEARCH_HUB_PUBMED_EMAIL` | `providers.pubmed.email` |
| `SEARCH_HUB_SCOPUS_API_KEY` | `providers.scopus.api_key` |
| `SEARCH_HUB_SCOPUS_INST_TOKEN` | `providers.scopus.inst_token` |
| `SEARCH_HUB_WOS_API_KEY` | `providers.wos.api_key` |
| `SEARCH_HUB_SESSION_DIR` | `session.directory` |
| `SEARCH_HUB_LOG_LEVEL` | `log.level` |

## Related Specs

- [spec/models/config.md](../models/config.md) - Environment Variables section

## Related Source Files

### Config system (already uses SEARCH_HUB_ prefix)
- `src/config/env.ts` - ENV_VAR_MAP (needs new entries: email, inst_token)
- `src/config/env.test.ts` - Tests for env var mapping

### CLI entrypoint (needs dotenv loading)
- `src/cli/index.ts` - CLI entrypoint, must call `dotenv.config()`

### E2E tests (need variable name updates)
- `src/providers/pubmed/pubmed.e2e.test.ts` - Uses `NCBI_EMAIL`, `NCBI_API_KEY`
- `src/providers/scopus/scopus.e2e.test.ts` - Uses `SCOPUS_API_KEY`, `SCOPUS_INST_TOKEN`
- `src/cli/cli-execution.e2e.test.ts` - Uses `PUBMED_API_KEY`, `PUBMED_EMAIL`

### .env file
- `.env` - Variable names need SEARCH_HUB_ prefix

## Implementation Steps

### Step 1: Add dotenv loading to CLI entrypoint

- [ ] Write test: `src/cli/index.test.ts`
  - Test: dotenv is loaded before config is initialized
- [ ] Modify `src/cli/index.ts`
  - Import and call `dotenv.config()` at the top of the CLI entrypoint, before any
    config loading occurs
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `.env` file is loaded when CLI starts

### Step 2: Add missing env var mappings to config system

- [ ] Write test: `src/config/env.test.ts`
  - Test: `SEARCH_HUB_PUBMED_EMAIL` maps to `providers.pubmed.email`
  - Test: `SEARCH_HUB_SCOPUS_INST_TOKEN` maps to `providers.scopus.inst_token`
- [ ] Modify `src/config/env.ts`
  - Add to `ENV_VAR_MAP`:
    ```typescript
    SEARCH_HUB_PUBMED_EMAIL: 'providers.pubmed.email',
    SEARCH_HUB_SCOPUS_INST_TOKEN: 'providers.scopus.inst_token',
    ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All provider credentials can be set via env vars

### Step 3: Update E2E tests to use SEARCH_HUB_ prefix

- [ ] Modify `src/providers/pubmed/pubmed.e2e.test.ts`
  - `NCBI_EMAIL` → `SEARCH_HUB_PUBMED_EMAIL`
  - `NCBI_API_KEY` → `SEARCH_HUB_PUBMED_API_KEY`
  - Update comments
- [ ] Modify `src/providers/scopus/scopus.e2e.test.ts`
  - `SCOPUS_API_KEY` → `SEARCH_HUB_SCOPUS_API_KEY`
  - `SCOPUS_INST_TOKEN` → `SEARCH_HUB_SCOPUS_INST_TOKEN`
  - Update comments
- [ ] Modify `src/cli/cli-execution.e2e.test.ts`
  - `PUBMED_API_KEY` → `SEARCH_HUB_PUBMED_API_KEY`
  - `PUBMED_EMAIL` → `SEARCH_HUB_PUBMED_EMAIL`
  - Update comments
- [ ] Verify all tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All E2E tests use unified SEARCH_HUB_ prefix

### Step 4: Update .env file

- [ ] Modify `.env`
  - `SCOPUS_API_KEY=...` → `SEARCH_HUB_SCOPUS_API_KEY=...`
  - `PUBMED_API_KEY=...` → `SEARCH_HUB_PUBMED_API_KEY=...`
  - `PUBMED_EMAIL=...` → `SEARCH_HUB_PUBMED_EMAIL=...`
- [ ] Acceptance: `.env` uses consistent naming

### Step 5: Update spec

- [ ] Modify `spec/models/config.md` - Environment Variables section
  - Add `SEARCH_HUB_PUBMED_EMAIL` and `SEARCH_HUB_SCOPUS_INST_TOKEN` to the table
- [ ] Acceptance: Spec matches implementation

### Step 6: E2E verification

- [ ] Run full test suite: `npm run test:all`
- [ ] **Manual verification**:
  - Create `.env` with `SEARCH_HUB_SCOPUS_API_KEY=...`
  - Run `search-hub search --db scopus --query "test" --max-results 1`
  - Confirm Scopus reads the API key from `.env` and authenticates successfully
- [ ] Acceptance: All env vars are loaded from `.env` with SEARCH_HUB_ prefix

## Notes

- `.env` must be in `.gitignore` (it contains API keys) — verify this is already the case
- `dotenv.config()` should be called as early as possible in the CLI entrypoint so that
  env vars are available when config loading begins
- E2E tests that use `dotenv` should also import from the same entrypoint logic, not their
  own separate `dotenv.config()` call, to ensure consistency
