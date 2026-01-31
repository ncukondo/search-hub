# Task: Separate Real-API Tests into Dedicated Vitest Project

## Purpose

Real API tests (`cli-execution.e2e.test.ts`, `pubmed.e2e.test.ts`, etc.) currently share the
`e2e` vitest project with mocked E2E tests. This causes:

1. Running `npm run test:e2e` executes both stable and flaky tests indiscriminately
2. CI cannot reliably run mocked E2E tests because they are bundled with network-dependent tests
3. No separate timeout/retry configuration for network-dependent tests
4. Developers cannot quickly distinguish between real failures and network flakes

Real API tests are necessary for confidence, but they need different execution parameters
(longer timeouts, more retries, conditional skip when credentials are missing).

## Related Specs

- [spec/overview.md](../overview.md) - Supported databases and API requirements

## Related Source Files

### Real API test files (to rename to `*.api.test.ts`)
- `src/cli/cli-execution.e2e.test.ts` - CLI execution with real PubMed API
- `src/providers/pubmed/pubmed.e2e.test.ts` - PubMed provider real API
- `src/providers/eric/eric.e2e.test.ts` - ERIC provider real API
- `src/providers/arxiv/arxiv.e2e.test.ts` - arXiv provider real API
- `src/providers/scopus/scopus.e2e.test.ts` - Scopus provider real API
- `src/cli/workflow.e2e.test.ts` - Cross-provider workflow with real APIs

### Mocked E2E test files (no changes, remain as `*.e2e.test.ts`)
- `src/cli/commands/search.e2e.test.ts`
- `src/cli/commands/resume.e2e.test.ts`
- `src/cli/commands/export.e2e.test.ts`
- `src/cli/commands/status.e2e.test.ts`
- `src/cli/commands/config.e2e.test.ts`
- `src/cli/commands/init.e2e.test.ts`
- `src/cli/commands/translate.e2e.test.ts`
- `src/cli/commands/validate.e2e.test.ts`
- `src/cli/commands/register.e2e.test.ts`
- `src/cli/commands/query/init.e2e.test.ts`
- `src/cli/commands/error-messages.e2e.test.ts`

### Configuration
- `vitest.config.ts` - Test project definitions
- `package.json` - npm scripts
- `.github/workflows/ci.yml` - CI pipeline

## Implementation Steps

### Step 1: Rename real-API test files to `*.api.test.ts`

- [ ] Rename files:
  - `src/cli/cli-execution.e2e.test.ts` → `src/cli/cli-execution.api.test.ts`
  - `src/providers/pubmed/pubmed.e2e.test.ts` → `src/providers/pubmed/pubmed.api.test.ts`
  - `src/providers/eric/eric.e2e.test.ts` → `src/providers/eric/eric.api.test.ts`
  - `src/providers/arxiv/arxiv.e2e.test.ts` → `src/providers/arxiv/arxiv.api.test.ts`
  - `src/providers/scopus/scopus.e2e.test.ts` → `src/providers/scopus/scopus.api.test.ts`
  - `src/cli/workflow.e2e.test.ts` → `src/cli/workflow.api.test.ts`
- [ ] Verify no import references to old filenames exist
- [ ] Run `npm run test:unit -- --run` to ensure unit tests unaffected
- [ ] Acceptance: Files renamed, no broken imports

### Step 2: Add `api` vitest project to `vitest.config.ts`

- [ ] Modify `vitest.config.ts`
  - Add `api` project:
    ```typescript
    {
      test: {
        name: "api",
        include: ["src/**/*.api.test.ts"],
        testTimeout: 60000,
        hookTimeout: 30000,
        sequence: { concurrent: false },
        retry: 2,
      },
    }
    ```
  - Update `e2e` project to exclude `*.api.test.ts`:
    ```typescript
    exclude: ["**/*.api.test.ts", "**/node_modules/**"]
    ```
  - Update `unit` project to exclude `*.api.test.ts`:
    ```typescript
    exclude: ["**/*.e2e.test.ts", "**/*.api.test.ts", "**/node_modules/**"]
    ```
- [ ] Verify `npm run test:unit -- --run` passes (unit tests unaffected)
- [ ] Verify `npm run test:e2e -- --run` runs only mocked E2E tests
- [ ] Acceptance: Three distinct test projects: `unit`, `e2e`, `api`

### Step 3: Add npm scripts

- [ ] Modify `package.json`
  - Add: `"test:api": "vitest --project api"`
  - Add: `"test:ci": "vitest --project unit --project e2e"`
- [ ] Verify `npm run test:api -- --run` runs only real-API tests
- [ ] Verify `npm run test:ci -- --run` runs unit + mocked E2E
- [ ] Acceptance: All npm scripts work correctly

### Step 4: Add conditional skip for missing credentials

- [ ] Modify `src/providers/pubmed/pubmed.api.test.ts`
  - Add skip guard when no PubMed API key is configured:
    ```typescript
    const API_KEY = process.env['SEARCH_HUB_PUBMED_API_KEY'];
    const skip = !API_KEY;
    describe.skipIf(skip)('PubMed Provider API Tests', () => { ... });
    ```
- [ ] Modify `src/cli/cli-execution.api.test.ts`
  - Same skip guard pattern
- [ ] Verify tests skip cleanly when credentials are missing
- [ ] Acceptance: No failures from missing credentials, tests skip with clear message

### Step 5: Decouple cascading test dependencies in `cli-execution.api.test.ts`

- [ ] Refactor test structure:
  - Extract initial search into `beforeAll` hook
  - Store `searchSessionId` in module-level variable
  - Use `it.skipIf(!searchSessionId)` for export/resume tests
  - This prevents cascading failures: if search fails, dependent tests skip instead of failing
- [ ] Verify refactored tests pass when API is available
- [ ] Verify dependent tests skip gracefully when search fails
- [ ] Acceptance: Export/resume tests do not cascade-fail when search has network issues

### Step 6: Update CI pipeline

- [ ] Modify `.github/workflows/ci.yml`
  - Change `npm test` to `npm run test:ci` (adds mocked E2E tests to CI)
  - Optionally add a separate job for API tests (manual trigger or nightly):
    ```yaml
    api-tests:
      if: github.event_name == 'workflow_dispatch'
      runs-on: ubuntu-latest
      steps:
        - run: npm run test:api
          env:
            SEARCH_HUB_PUBMED_API_KEY: ${{ secrets.PUBMED_API_KEY }}
    ```
- [ ] Verify CI pipeline passes
- [ ] Acceptance: CI runs unit + mocked E2E reliably; API tests available on-demand

### Step 7: E2E verification

- [ ] Run `npm run test:all -- --run` to verify all three projects work together
- [ ] Verify `npm run test:ci -- --run` is clean (no flaky tests)
- [ ] Run `npm run test:api -- --run` and confirm appropriate skip/pass behavior
- [ ] Acceptance: Clean separation, no test regressions

## Notes

- The `*.api.test.ts` naming convention clearly communicates "this test hits real APIs"
- Scopus E2E already has a `skipIf(!SCOPUS_API_KEY)` pattern — PubMed and others should follow
- `test:all` still runs everything (unit + e2e + api) for developers who want full coverage
- After this task, `npm run test:e2e` becomes reliable and CI-safe
