# Task: Query Inspect Command

## Purpose

Add a `query inspect` subcommand that visualizes how a query DSL file resolves for each provider. This helps users and AI agents understand which blocks use default vs. custom strategies, and which filters are added per provider — without executing any API calls.

This is a companion to the provider-aware DSL redesign (Task #115). While `query translate` shows the final native query strings, `query inspect` shows the **structural resolution** — which blocks are replaced and which filters are added.

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) — DSL specification with `providers` section
- [spec/cli/commands.md](../cli/commands.md) — CLI command definitions

## Related Source Files

- `src/query/resolver.ts` — `resolveForProvider` (from Task #115)
- `src/query/parser.ts` — YAML parsing
- `src/cli/commands/query/inspect.ts` — new file
- `src/cli/index.ts` — CLI command registration

## Design

### CLI Interface

```bash
search-hub query inspect <file>
search-hub query inspect query.yaml
```

### Output Format

```
Query: diabetes_ai_scoping

  Block         │ PubMed    │ ERIC      │ arXiv     │ Scopus
  ──────────────┼───────────┼───────────┼───────────┼──────────
  population    │ default   │ default   │ replaced  │ default
  intervention  │ default   │ default   │ replaced  │ default
  outcome       │ default   │ default   │ default   │ default

  Added Filters │ PubMed    │ ERIC      │ arXiv     │ Scopus
  ──────────────┼───────────┼───────────┼───────────┼──────────
  pub_types     │ -Review   │ —         │ —         │ —
  categories    │ —         │ —         │ cs.AI,..  │ —
  source_types  │ —         │ —         │ —         │ journal,..
```

- The block table shows `default` or `replaced` per provider
- The filter table shows only provider-added filters (not default filters)
- Providers with no `providers` section show all defaults

### Exit Codes

- 0: Success
- 1: Parse/validation error

## Implementation Steps

### Step 1: Inspect logic

- [x] Write test: `src/cli/commands/query/inspect.test.ts`
  - Query with no `providers` → all cells show "default"
  - Query with `providers.arxiv.replaces.population` → arXiv/population shows "replaced"
  - Query with `providers.pubmed.adds.filters` → filter table shows added filters
  - Query with multiple providers customized → correct matrix
  - Format output as aligned table
- [x] Create `src/cli/commands/query/inspect.ts`
  - `inspectQuery(ast: QueryAST, enabledProviders: ProviderName[]): InspectResult`
  - `formatInspectOutput(result: InspectResult): string`
- [x] Verify test fails (Red) → Implement → Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: inspect logic tests pass

### Step 2: Wire to CLI

- [x] Register `query inspect <file>` subcommand in `src/cli/index.ts`
  - Parse YAML, run inspect, print output
  - Use config to determine enabled providers
- [x] Write test: `src/cli/commands/query/inspect.test.ts` (CLI integration)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `search-hub query inspect` runs correctly

### Final Step: E2E Integration Tests (MANDATORY)

- [x] Write E2E test: `src/cli/commands/query/inspect.e2e.test.ts`
  - Create YAML with providers section, run inspect, verify table output
  - Create YAML without providers, run inspect, verify all "default"
  - Verify output includes all configured providers
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: Run `query inspect` on real query files
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- This task depends on Task #115 (Query DSL Provider-Aware Redesign) — specifically the `resolveForProvider` function and the `providers` section in `QueryAST`.
- Test files are co-located with source files (`*.test.ts`).
