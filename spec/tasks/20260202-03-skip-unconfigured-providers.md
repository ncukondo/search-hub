# Task: Skip Unconfigured Providers

## Purpose

When running a search without `--db`, all enabled providers are used. If a provider (e.g., Scopus) requires an API key that isn't configured, the search fails for that provider and it appears as "failed" in session status. This is confusing because the user may not intend to use Scopus at all.

This task adds automatic skipping of unconfigured providers with a warning message, while preserving the current error behavior when a provider is explicitly requested via `--db`.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - Search command options
- [spec/providers/scopus.md](../providers/scopus.md) - Scopus API key requirement

## Related Source Files

- `src/cli/commands/search-executor.ts` - Search execution logic, `getEnabledProviders()`
- `src/cli/commands/search-executor.test.ts` - Search executor tests

## Design Details

### Provider Configuration Check

```typescript
function isProviderConfigured(name: ProviderName, config: Config): boolean {
  switch (name) {
    case 'scopus':
      return !!config.providers.scopus.api_key;
    default:
      return true; // pubmed, eric, arxiv require no API key
  }
}
```

### Behavior

- **Default (no `--db`)**: Unconfigured providers are silently skipped with a warning:
  `"Skipping scopus: API key not configured (use --db scopus to force)"`
- **Explicit `--db scopus`**: Current error behavior is preserved (fail with actionable message)

## Implementation Steps

### Step 1: Add provider configuration check

- [x] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: `isProviderConfigured('scopus', configWithoutKey)` returns `false`
  - Test: `isProviderConfigured('scopus', configWithKey)` returns `true`
  - Test: `isProviderConfigured('pubmed', anyConfig)` returns `true`
- [x] Verify test fails (Red)
- [x] Implement `isProviderConfigured()` in `src/cli/commands/search-executor.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Configuration check works for all providers

### Step 2: Skip unconfigured providers in default mode

- [x] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: default search skips unconfigured Scopus and emits warning
  - Test: explicit `--db scopus` still fails with error when unconfigured
  - Test: all configured providers still execute normally
- [x] Verify test fails (Red)
- [x] Modify `executeSearch()` to filter unconfigured providers when no `--db` is specified
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Unconfigured providers are skipped with warning in default mode

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - Test: search without Scopus API key completes successfully (Scopus skipped)
  - Test: search with `--db scopus` without API key fails with clear error
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] Acceptance: All tests pass, unconfigured providers are gracefully skipped

## Notes

- This only affects Scopus currently, but the pattern supports future providers that require API keys
- The existing Scopus preflight check (Task #22) handles the `--db scopus` explicit case
