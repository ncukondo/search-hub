# Task: Show Detailed Error Information on Search Failure

## Purpose

When a search fails, the CLI displays only `"Error: All providers failed"` with no details about
the underlying cause. The per-provider error information is recorded in `session.json` but is never
surfaced to the user. The `--verbose` flag also provides no additional output. This makes
diagnosing search failures extremely difficult.

Additionally, PubMed API responses include a `<WarningList>` element containing important
diagnostic messages (e.g., `<OutputMessage>NOT</OutputMessage>` when a boolean operator is
unrecognized). These warnings are currently not parsed or propagated.

## Related Specs

- [spec/cli/output-formats.md](../cli/output-formats.md) - Status output format, failed state icon
- [spec/providers/pubmed.md](../providers/pubmed.md) - Error handling table
- [spec/providers/_interface.md](../providers/_interface.md) - Error handling contract

## Related Source Files

- `src/cli/commands/search-executor.ts` - Error message display
- `src/cli/commands/resume-executor.ts` - Same pattern
- `src/providers/pubmed/client.ts` - API response handling
- `src/providers/pubmed/parser.ts` - XML parsing (currently ignores WarningList)

## Implementation Steps

### Step 1: Display per-provider error details on failure

- [ ] Write test: `src/cli/commands/search-executor.test.ts`
  - Test: when a provider fails, the error message includes the provider name and error reason
  - Test: when multiple providers fail, each provider's error is listed
- [ ] Modify `src/cli/commands/search-executor.ts`
  - When returning `"All providers failed"`, include per-provider error details in the error
    message (e.g., `"All providers failed:\n  pubmed: Network request failed\n  eric: Timeout"`)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Error output includes specific provider error messages

### Step 2: Parse and propagate PubMed WarningList

- [ ] Write test: `src/providers/pubmed/parser.test.ts`
  - Test: parse `<WarningList>` element from esearch response
  - Test: extract `<OutputMessage>` and `<QuotedPhraseNotFound>` entries
- [ ] Modify `src/providers/pubmed/parser.ts`
  - Parse `WarningList` from esearch XML response
  - Include warnings in `ESearchResponse` type
- [ ] Modify `src/providers/pubmed/provider.ts`
  - Log or propagate warnings when present
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: PubMed warnings are parsed and available to callers

### Step 3: Support --verbose flag for extended output

- [ ] Write test: `src/cli/commands/search.e2e.test.ts`
  - Test: with `--verbose`, additional diagnostic information is displayed
- [ ] Ensure the verbose flag enables display of provider warnings and debug info
- [ ] Verify tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run a failing search with `-v` and confirm useful output
- [ ] Acceptance: `--verbose` shows provider-level details, PubMed warnings, and request URLs

## Notes

- Care should be taken not to break quiet mode (`--quiet`) behavior
- PubMed `<WarningList>` is only present in esearch responses, not efetch
- This task depends on Task 20260129-02 (zero-results handling) to ensure error messages
  are only shown for actual failures
