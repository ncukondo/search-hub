# Task: Search Count-Only Mode

## Purpose

During query refinement, users need to quickly check how many results a query would return before committing to a full search. Currently, `--dry-run` only shows the translated query syntax but does not hit the API to get hit counts. A full `search` downloads all results even when the user only wants to know the magnitude.

This task adds a `--count-only` flag to the `search` command that queries each provider for the total hit count without downloading any results.

**Pain point observed:** In iterative query refinement (6 iterations), each iteration required a full search to discover that a query returned 200+ results (too broad) or an appropriate number. A count-only mode would reduce each iteration from ~30s to ~2s.

## Related Specs

- [spec/cli](../cli/) - CLI command structure
- [spec/providers](../providers/) - Provider interfaces

## Related Source Files

- `src/cli/index.ts` - Command registration (search command)
- `src/cli/commands/search.ts` - Search option parsing
- `src/cli/commands/search-executor.ts` - Search execution logic
- `src/providers/base/types.ts` - Provider interface
- `src/providers/pubmed/provider.ts` - PubMed provider (uses ESearch with rettype=count)
- `src/providers/eric/provider.ts` - ERIC provider
- `src/providers/arxiv/provider.ts` - arXiv provider
- `src/providers/scopus/provider.ts` - Scopus provider

## Design

### Command Interface

```bash
# Count only - no session created, no results downloaded
search-hub search ./query.yaml --count-only

# Count for specific databases
search-hub search ./query.yaml --count-only --db pubmed,scopus

# Also works with direct query
search-hub search --db pubmed --query "diabetes[tiab]" --count-only
```

### Output Format

```
Query: wba-genai-v6.yaml (count only)

  pubmed:   28 hits
  scopus:  145 hits
  eric:      3 hits
  ─────────────────
  total:   176 hits (before deduplication)
```

### Architecture

- Add `count()` method to the provider interface (or use existing search with `maxResults=0`)
- For PubMed: use ESearch API with `rettype=count` (returns count only, no IDs)
- For other providers: provider-specific count mechanisms
- No session is created in count-only mode
- Output to stdout only (no file output)

## Implementation Steps

### Step 1: Add count method to provider interface

- [ ] Write test: provider count method returns hit count
- [ ] Add `count(query: string): Promise<number>` to provider base interface
- [ ] Verify test fails (Red)
- [ ] Implement count for PubMed provider (ESearch with rettype=count)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: PubMed `count()` returns correct hit count for a known query

### Step 2: Implement count for other providers

- [ ] Write tests for ERIC, arXiv, Scopus count methods
- [ ] Implement count for each provider using their respective count APIs
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All configured providers return count correctly

### Step 3: Wire up --count-only CLI option

- [ ] Write test: CLI option parsing and output formatting
- [ ] Add `--count-only` option to search command
- [ ] Implement count execution flow (translate query → count per provider → format output)
- [ ] Ensure no session is created in count-only mode
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub search ./query.yaml --count-only` shows hit counts without creating a session

### Final Step: E2E Integration Tests

- [ ] Write E2E test with PubMed (real API call with known query)
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test with real queries
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- PubMed's ESearch API supports `rettype=count` which returns only the count, making this very efficient
- For providers that don't have a dedicated count API, consider using `maxResults=1` and reading the total from response metadata
- This should be fast enough for rapid iteration (target: <3s per provider)
