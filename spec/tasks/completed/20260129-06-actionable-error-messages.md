# Task: Show Actionable Error Messages with Suggested Next Steps

## Purpose

When search-hub encounters an error, the current output provides no guidance on what to do next.
In the real-world usage session that motivated this task, the following sequence occurred:

1. `Warning: No email configured for PubMed. Set providers.pubmed.email in config.`
   → But `search-hub config providers.pubmed.email "..."` fails (Task 17 addresses this separately)
   → No suggestion to edit the TOML file directly as a workaround

2. `Error: All providers failed`
   → No per-provider error details (Task 16 addresses underlying detail collection)
   → No suggested diagnostic commands (`--dry-run`, `query validate`, etc.)

AI agents in particular can self-recover when error messages include concrete next-step commands.
This task focuses on enriching the user-facing error messages with actionable suggestions.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - Command examples, exit codes
- [spec/cli/output-formats.md](../cli/output-formats.md) - Error display format

## Related Source Files

- `src/cli/commands/search-executor.ts` - Email warning (line 69-71), "All providers failed" (line 389)
- `src/cli/commands/search.ts` - CLI output handling
- `src/cli/index.ts` - Global error handler

## Implementation Steps

### Step 1: Improve PubMed email warning with config file path

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: when PubMed email is not configured, warning includes the config file path
  - Test: warning suggests the correct command or file to edit
- [ ] Modify `src/cli/commands/search-executor.ts` (line 69-71)
  - Change from:
    ```
    Warning: No email configured for PubMed. Set providers.pubmed.email in config.
    ```
  - To:
    ```
    Warning: No email configured for PubMed.
      → Edit [config-path]/config.toml and set providers.pubmed.email
      → Or run: search-hub config providers.pubmed.email "your@email.com"
    ```
  - Use `getConfigDir()` from `src/config/paths.ts` to resolve the actual config path
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Warning shows concrete file path and command

### Step 2: Add diagnostic suggestions to search failure output

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: when all providers fail, output includes suggested next steps
- [ ] Modify `src/cli/commands/search-executor.ts`
  - When returning "All providers failed", append suggestions:
    ```
    Error: All providers failed

    Suggested actions:
      → Run with --dry-run to inspect translated queries
      → Check provider configuration: search-hub config
      → Use --db <provider> to test a single provider
    ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Failure output includes actionable suggestions

### Step 3: Add preflight check for provider readiness

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: before executing search, check that requested providers are properly configured
  - Test: if a provider is missing required config (e.g., Scopus without API key), warn
    upfront instead of failing silently
- [ ] Modify `src/cli/commands/search-executor.ts`
  - Before the search loop, validate each provider's configuration
  - Emit warnings for misconfigured providers (missing email, missing API key where required)
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Misconfigurations are reported before search execution begins

### Step 4: E2E verification

- [ ] Write E2E test: `src/cli/commands/search.e2e.test.ts`
  - Test: search with unconfigured email shows warning with config path
  - Test: failed search shows suggested diagnostic commands
- [ ] Verify E2E test passes
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Trigger a failure scenario and confirm actionable output
- [ ] Acceptance: All error scenarios show helpful next steps

## Notes

- Suggestions should respect `--quiet` mode (suppress suggestions) and work in `--json` mode
  (include suggestions as a structured field)
- This task complements Task 16 (error detail reporting) — Task 16 shows *what* failed,
  this task shows *what to do about it*
- AI agents benefit most from suggestions formatted as exact CLI commands they can execute
