# Task: Add Sort Option to Search

## Purpose

Enable sorting search results by relevance or date. Currently, each provider uses its default sort order (typically by date). For focused/narrative literature reviews, sorting by relevance is essential to surface the most pertinent articles first.

## Related Specs

- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface (SearchOptions)
- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed esearch sort parameter
- [spec/cli/commands.md](../cli/commands.md) - search command options

## Related Source Files

- `src/providers/base/types.ts` - `SearchOptions` interface
- `src/providers/pubmed/client.ts` - `PubMedClient.search()`
- `src/providers/pubmed/provider.ts` - `PubMedProvider.search()`
- `src/providers/scopus/client.ts` - `ScopusClient.buildSearchUrl()`
- `src/providers/scopus/provider.ts` - `ScopusProvider.search()`
- `src/providers/arxiv/client.ts` - `ArxivClient.search()` (already has sortBy)
- `src/providers/arxiv/provider.ts` - `ArxivProvider.search()`
- `src/providers/eric/provider.ts` - `EricProvider.search()`
- `src/cli/commands/search.ts` - CLI option parsing
- `src/cli/commands/search-executor.ts` - Search execution

## Design

### Base Interface

```typescript
// src/providers/base/types.ts
type SortField = 'relevance' | 'date';

interface SearchOptions {
  // ... existing fields ...
  sort?: SortField;  // default: undefined (provider default)
}
```

### Provider Mapping

| SortField   | PubMed           | Scopus           | arXiv                   | ERIC        |
|-------------|------------------|------------------|-------------------------|-------------|
| `relevance` | `sort=relevance` | `sort=-relevancy` | `sortBy=relevance`     | warn + skip |
| `date`      | `sort=pub_date`  | (default)        | `sortBy=submittedDate` | warn + skip |

- ERIC does not support sort → emit a warning via provider warnings, use default order
- arXiv already has `sortBy` in its client — wire it to the new base option

### CLI

```
search-hub search <query.yaml> --sort <relevance|date>
```

## Implementation Steps

### Step 1: Add `SortField` type and update `SearchOptions`

- [ ] Write test: `src/providers/base/types.test.ts` — validate SortField type
- [ ] Add `SortField` type and `sort` field to `SearchOptions` in `src/providers/base/types.ts`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `SearchOptions` has optional `sort` field typed as `SortField`

### Step 2: PubMed sort support

- [ ] Write test: `src/providers/pubmed/client.test.ts` — verify `sort` param in esearch URL
- [ ] Write test: `src/providers/pubmed/provider.test.ts` — verify sort option forwarded
- [ ] Update `PubMedClient.search()` to accept and pass `sort` parameter
- [ ] Update `PubMedProvider.search()` to forward `sort` from `SearchOptions`
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: PubMed esearch URL includes `&sort=relevance` or `&sort=pub_date`

### Step 3: Scopus sort support

- [ ] Write test: `src/providers/scopus/client.test.ts` — verify `sort` param in search URL
- [ ] Write test: `src/providers/scopus/provider.test.ts` — verify sort option forwarded
- [ ] Update `ScopusClient.buildSearchUrl()` to accept and pass `sort` parameter
- [ ] Update `ScopusProvider.search()` to forward `sort` from `SearchOptions`
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Scopus URL includes `&sort=-relevancy` when sort=relevance

### Step 4: arXiv sort wiring

- [ ] Write test: `src/providers/arxiv/provider.test.ts` — verify sort option mapped to `sortBy`
- [ ] Update `ArxivProvider.search()` to map `SearchOptions.sort` to `ArxivSearchOptions.sortBy`
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: arXiv uses `sortBy=relevance` when base sort=relevance

### Step 5: ERIC unsupported sort warning

- [ ] Write test: `src/providers/eric/provider.test.ts` — verify warning emitted
- [ ] Update `EricProvider.search()` to emit warning when `sort` is specified
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Warning logged when ERIC receives sort option

### Step 6: CLI `--sort` option

- [ ] Write test: `src/cli/commands/search.test.ts` — verify `--sort` option parsed
- [ ] Add `--sort <relevance|date>` option to search command
- [ ] Forward sort option through search executor to providers
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub search query.yaml --sort relevance` passes sort to providers

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/search.e2e.test.ts` — sort option forwarding
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test with `--sort relevance` against PubMed
- [ ] Acceptance: All tests pass, sort works in real usage

## Notes

- arXiv client already supports `sortBy` and `sortOrder` — we just need to wire it
- ERIC API does not support sorting — graceful degradation with warning
- Sort order is always descending (no ascending option exposed)
