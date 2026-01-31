# Task: Enhance `--dry-run` with Provider Readiness and Query Diagnostics

## Purpose

The `--dry-run` flag currently only displays translated query strings. In the real-world usage
session that motivated this task, `--dry-run` output looked correct but the actual search
returned 0 results due to the PubMed `AND NOT` syntax issue (Task 14). The user had no way to
detect the problem from the dry-run output alone.

Enhancing `--dry-run` to include provider readiness checks and known query pattern warnings would
allow users and AI agents to diagnose issues before executing a search.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - `search --dry-run` behavior
- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed-specific constraints
- [spec/models/config.md](../models/config.md) - Provider configuration

## Related Source Files

- `src/cli/commands/search.ts` - `formatDryRunOutput` function
- `src/cli/commands/search-executor.ts` - Provider configuration checks
- `src/providers/pubmed/translator.ts` - Query translation

## Implementation Steps

### Step 1: Add provider readiness summary to dry-run output

- [ ] Write test: `src/cli/commands/search.test.ts`
  - Test: dry-run output includes provider configuration status for each target provider
  - Test: missing email for PubMed is flagged in dry-run output
  - Test: missing API key for Scopus is flagged in dry-run output
  - Test: properly configured providers show "ready" status
- [ ] Modify `src/cli/commands/search.ts` (`formatDryRunOutput` or equivalent)
  - Add a "Provider readiness" section to dry-run output:
    ```
    Provider readiness:
      ✓ pubmed    ready (email: configured, api_key: not set — rate limited to 3 req/s)
      ✗ scopus    missing api_key (required)
      ✓ eric      ready
      ✓ arxiv     ready
    ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Dry-run shows which providers are ready and which have issues

### Step 2: Add query diagnostics warnings

- [ ] Write test: `src/cli/commands/search.test.ts`
  - Test: dry-run warns when a translated query uses patterns known to cause issues
    (informational, not blocking)
- [ ] Implement query diagnostics check
  - Check for known PubMed issues (this can be expanded over time):
    - Warn if publication type exclusions are present (informational note about NOT syntax)
    - Warn if wildcards are used in MeSH terms (PubMed does not support `*` in `[mh]`)
  - Output warnings section:
    ```
    Diagnostics:
      ⚠ pubmed: query uses publication type exclusions (NOT operator)
      ⚠ pubmed: wildcard in MeSH term "Randomized*[mh]" — PubMed does not support wildcards in MeSH fields
    ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Known problematic patterns are flagged in dry-run output

### Step 3: E2E verification

- [ ] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - Test: `search-hub search query.yaml --dry-run` shows provider readiness and diagnostics
- [ ] Verify E2E test passes
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run dry-run with various query files and verify diagnostics output
- [ ] Acceptance: Dry-run output provides actionable pre-flight information

## Spec Update Required

After implementation, update `spec/cli/commands.md` — `search --dry-run` description:

Current:
```
| `--dry-run` | Show translated queries without executing |
```

Update:
```
| `--dry-run` | Show translated queries, provider readiness, and diagnostics without executing |
```

## Notes

- Diagnostics should be informational (warnings), not blocking — even if a warning is shown,
  the user can still proceed with the actual search
- The diagnostics framework should be extensible so that new checks can be added as edge cases
  are discovered (e.g., per-provider syntax pitfalls)
- This is particularly valuable for AI agents: they can run `--dry-run` as a pre-flight check
  and react to warnings before committing to a search
