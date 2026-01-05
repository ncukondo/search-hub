# Task: arXiv Provider

## Purpose

Implement the arXiv provider to search the arXiv preprint server. arXiv hosts preprints in physics, mathematics, computer science, quantitative biology, and related fields. Essential for systematic reviews in these domains where rapid dissemination of research is critical.

## Related Specs

- [spec/providers/arxiv.md](../providers/arxiv.md) - arXiv API specification
- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface contract
- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL structure
- [spec/decisions/004-xml-parser-library.md](../decisions/004-xml-parser-library.md) - XML parser decision
- [spec/decisions/005-provider-session-resume.md](../decisions/005-provider-session-resume.md) - Session resume architecture

## Related Source Files

- `src/providers/arxiv/types.ts` - arXiv-specific types
- `src/providers/arxiv/translator.ts` - Query DSL to arXiv syntax
- `src/providers/arxiv/client.ts` - HTTP client for arXiv API
- `src/providers/arxiv/parser.ts` - Atom XML response parsing
- `src/providers/arxiv/provider.ts` - ArxivProvider implementation
- `src/providers/arxiv/index.ts` - Module exports
- `src/providers/arxiv/*.test.ts` (co-located unit tests)
- `src/providers/arxiv/arxiv.e2e.test.ts` (E2E tests)

## Implementation Steps

### Step 1: Define arXiv-specific Types

- [ ] Write test: `src/providers/arxiv/types.test.ts`
  - Test type compatibility with base Article type
  - Test arXiv-specific fields (arXiv ID, categories, versions)
- [ ] Create types: `src/providers/arxiv/types.ts`
  - `ArxivPaper` extending base `Article`
  - `ArxivSearchResponse` for Atom feed response
  - `ArxivConfig` for provider configuration
  - `ArxivCategory` for category taxonomy
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Types match spec/providers/arxiv.md

### Step 2: Implement Query Translator

- [ ] Write test: `src/providers/arxiv/translator.test.ts`
  - Test field mapping (title -> ti:, abstract -> abs:, etc.)
  - Test title_abstract -> (ti: OR abs:) expansion
  - Test author field mapping (au:)
  - Test all field mapping (all:)
  - Test boolean operators (AND, OR, ANDNOT)
  - Test phrase handling with quotes
  - Test category filter translation (cat:cs.AI)
  - Test date filter translation (submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM])
- [ ] Create stub: `src/providers/arxiv/translator.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - Field prefix mappings
  - Category filter from overrides
  - Date range formatting
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Translator produces valid arXiv queries per spec

### Step 3: Implement Atom XML Response Parser

- [ ] Write test: `src/providers/arxiv/parser.test.ts`
  - Test parsing Atom feed response
  - Test extracting opensearch:totalResults
  - Test extracting entry elements
  - Test extracting paper fields (id, title, summary, authors)
  - Test extracting DOI from arxiv:doi element
  - Test extracting primary category
  - Test arXiv ID extraction from URL (remove version)
  - Test handling multiple authors
  - Test date parsing from published element
- [ ] Create stub: `src/providers/arxiv/parser.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `parseAtomFeed(xml: string): ArxivSearchResult`
  - `parseEntry(entry: unknown): ArxivPaper`
  - Use `fast-xml-parser` for XML parsing (see ADR-004)
  - Configure parser for Atom namespace handling
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Parser correctly extracts all Article fields

### Step 4: Implement HTTP Client

- [ ] Write test: `src/providers/arxiv/client.test.ts`
  - Test search API call construction
  - Test search_query parameter encoding
  - Test pagination parameters (start, max_results)
  - Test sortBy and sortOrder parameters
  - Test rate limiting enforcement (1 req/3s)
  - Mock HTTP calls for unit tests
- [ ] Create stub: `src/providers/arxiv/client.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `ArxivClient` class
  - `search(query: string, options): Promise<ArxivSearchResult>`
  - Strict rate limiter (1 request per 3 seconds)
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Client correctly calls arXiv API with rate limiting

### Step 5: Implement arXiv Provider

- [ ] Write test: `src/providers/arxiv/provider.test.ts`
  - Test implements Provider interface
  - Test search returns async iterable of articles
  - Test pagination handling (streams all results)
  - Test translateQuery method
  - Test testConnection method
  - Test error handling for various HTTP statuses
  - Test strict rate limiting (3s between requests)
  - Test retry logic for 503 errors (wait 30s)
- [ ] Create stub: `src/providers/arxiv/provider.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `class ArxivProvider extends BaseProvider`
  - `async *search(query, options): AsyncIterable<Article>`
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - `testConnection(): Promise<boolean>`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Provider fully implements interface contract

### Step 5a: Implement Session Resume (Offset-based)

- [ ] Write test: `src/providers/arxiv/provider.test.ts` (additional tests)
  - Test getSearchState returns offset-based state
  - Test resumeSearch continues from saved offset
  - Test validateState always returns true (offset-based, no expiration)
  - Test resume respects rate limiting (3s between requests)
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - Define `ArxivProviderState` with offset
  - `getSearchState(): SearchState` - captures current pagination offset
  - `resumeSearch(state): AsyncIterable<Article>` - resumes from saved offset
  - `validateState(state): Promise<boolean>` - always valid for offset-based
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Can interrupt and resume arXiv searches

### Step 6: Implement E2E Tests

- [ ] Update test: `src/providers/arxiv/arxiv.e2e.test.ts`
  - Test searching arXiv with simple query
  - Test searching with field prefixes
  - Test searching with category filter
  - Test fetching paper by arXiv ID
  - Test pagination (note: slow due to rate limit)
  - Test rate limiting is strictly enforced
  - Test connection test works
  - Test session resume from saved offset
- [ ] Verify tests pass with `npm run test:e2e`
- [ ] Acceptance: E2E tests pass against live arXiv API

### Step 7: Provider Registration & Module Export

- [ ] Write test: `src/providers/arxiv/index.test.ts`
  - Test exports are correct
  - Test provider can be created from registry
- [ ] Create `src/providers/arxiv/index.ts`
  - Export ArxivProvider
  - Export types
  - Register provider in registry
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Provider is discoverable via registry

## TDD Cycle Reference

```
+-----------------------------------------------------+
|  1. Write Test (Red)                                |
|     - Write test that describes expected behavior   |
|     - Run test -> should FAIL                       |
+-----------------------------------------------------+
|  2. Implement (Green)                               |
|     - Write minimal code to pass test               |
|     - Run test -> should PASS                       |
+-----------------------------------------------------+
|  3. Refactor                                        |
|     - npm run lint                                  |
|     - npm run typecheck                             |
|     - Clean up code if needed                       |
|     - Run test -> should still PASS                 |
+-----------------------------------------------------+
```

## E2E Test Configuration

```bash
# Run E2E tests (calls live arXiv API)
npm run test:e2e

# arXiv API requires no authentication
# Note: E2E tests are slow due to strict rate limiting (3s between requests)
```

## Notes

- **Critical**: arXiv enforces 1 request per 3 seconds - IP blocking on violation
- Response is Atom XML; use `fast-xml-parser` (ADR-004)
- arXiv ID format: 2401.12345 (extract from URL, remove version suffix)
- Uses ANDNOT instead of NOT for boolean negation
- Category taxonomy is arXiv-specific (cs.AI, physics.gen-ph, etc.)
- Date filter uses submittedDate with format YYYYMMDDHHmm
- arXiv hosts preprints (not peer-reviewed)
- Results may include multiple versions; use v1 by default
- E2E tests will be slow - consider smaller test datasets
