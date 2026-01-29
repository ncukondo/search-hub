# Task: Add Preflight Check for Scopus API Key Requirement

## Purpose

Scopus requires an API key for all requests. When a user runs a search targeting Scopus without
an API key configured, the search proceeds, makes an HTTP request, receives a 401 response,
and reports `"All providers failed"` with no useful guidance.

PubMed has a warning for missing email (`search-executor.ts:69-71`), but Scopus has no equivalent
check for its required API key. The user discovers the problem only after the search fails.

### Evidence

```bash
$ search-hub search --db scopus --query "pneumonia" --max-results 5
Error: All providers failed
```

Session JSON shows:
```json
"error": { "code": "SEARCH_ERROR", "message": "[object Object]" }
```

(The `[object Object]` issue is addressed separately in Task 21.)

## Related Specs

- [spec/providers/scopus.md](../providers/scopus.md) - Prerequisites: API key required
- [spec/models/config.md](../models/config.md) - Scopus API key configuration

## Related Source Files

- `src/cli/commands/search-executor.ts` - `createProviderInstance` (line 60), PubMed email
  warning pattern (line 68-72)
- `src/providers/scopus/provider.ts` - Scopus provider construction

## Implementation Steps

### Step 1: Add API key check before Scopus search

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: when Scopus API key is empty, a warning is emitted before search
  - Test: when Scopus API key is empty and Scopus is the only provider, search fails
    immediately with a clear error message
- [ ] Modify `src/cli/commands/search-executor.ts`
  - In `createProviderInstance` for `case 'scopus'`: check if `api_key` is empty
  - If empty, emit a clear warning:
    ```
    Error: Scopus requires an API key. Set providers.scopus.api_key in config.
      → Get an API key at https://dev.elsevier.com/
      → Run: search-hub config providers.scopus.api_key "your-key"
    ```
  - Skip the provider (don't attempt the HTTP request)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Missing API key is caught before making any HTTP request

### Step 2: Generalize required credential check

- [ ] Review other providers for similar required credentials:
  - PubMed: email recommended but not strictly required (fallback exists)
  - ERIC: no authentication needed
  - arXiv: no authentication needed
  - Scopus: API key required
  - WoS (future): API key will be required
- [ ] Consider a generic `validateConfig` method on the provider interface
  that checks required credentials before search
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Provider-specific required credentials are validated upfront

### Step 3: E2E verification

- [ ] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - Test: `search-hub search --db scopus --query "test"` without API key shows clear error
    with setup instructions, not a generic failure message
- [ ] Verify E2E test passes
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run Scopus search without API key and confirm helpful output
- [ ] Acceptance: Users get clear guidance when Scopus API key is missing

## Notes

- The skip behavior should be reflected in session status: if Scopus is skipped due to
  missing config, it should be recorded as `"skipped"` rather than `"failed"`
- When Scopus is the only requested provider and is skipped, the exit code should indicate
  a configuration error (exit code 2), not a network error (exit code 4)
- This task complements Task 19 (actionable error messages) and Task 20 (dry-run diagnostics)
