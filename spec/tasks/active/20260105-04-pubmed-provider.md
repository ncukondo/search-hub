# Task: PubMed Provider

## Purpose

Implement the PubMed provider to search NCBI's PubMed database using E-utilities API. PubMed is the primary database for biomedical literature, making this provider essential for medical and life science systematic reviews.

## Related Specs

- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed API specification
- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface contract
- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL structure
- [spec/decisions/004-xml-parser-library.md](../decisions/004-xml-parser-library.md) - XML parser decision
- [spec/decisions/005-provider-session-resume.md](../decisions/005-provider-session-resume.md) - Session resume architecture

## Related Source Files

- `src/providers/pubmed/types.ts` - PubMed-specific types
- `src/providers/pubmed/translator.ts` - Query DSL to PubMed syntax
- `src/providers/pubmed/client.ts` - HTTP client for E-utilities
- `src/providers/pubmed/parser.ts` - XML response parsing
- `src/providers/pubmed/provider.ts` - PubMedProvider implementation
- `src/providers/pubmed/index.ts` - Module exports
- `src/providers/pubmed/*.test.ts` (co-located unit tests)
- `src/providers/pubmed/pubmed.e2e.test.ts` (E2E tests)

## Implementation Steps

### Step 1: Define PubMed-specific Types

- [x] Write test: `src/providers/pubmed/types.test.ts`
  - Test type compatibility with base Article type
  - Test PubMed-specific fields (PMID, MeSH terms)
- [x] Create types: `src/providers/pubmed/types.ts`
  - `PubMedArticle` extending base `Article`
  - `ESearchResponse` for esearch API response
  - `EFetchResponse` for efetch API response
  - `PubMedConfig` for provider configuration
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Types match spec/providers/pubmed.md

### Step 2: Implement Query Translator

- [x] Write test: `src/providers/pubmed/translator.test.ts`
  - Test field mapping (title -> [ti], abstract -> [ab], etc.)
  - Test title_abstract -> [tiab] conversion
  - Test MeSH term handling with [mh] qualifier
  - Test boolean operators (AND, OR, NOT)
  - Test phrase handling with quotes
  - Test date filter translation (year_from, year_to -> [dp])
  - Test language filter translation
  - Test exclude filter translation (NOT review[pt])
- [x] Create stub: `src/providers/pubmed/translator.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - Field qualifier mappings
  - Filter translations
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Translator produces valid PubMed queries per spec

### Step 3: Implement XML Response Parser

- [x] Write test: `src/providers/pubmed/parser.test.ts`
  - Test parsing esearch XML response (PMID list, count)
  - Test parsing efetch XML response (full articles)
  - Test extracting article fields (title, abstract, authors, DOI)
  - Test handling missing optional fields
  - Test handling multiple authors
  - Test date parsing from PubDate element
- [x] Create stub: `src/providers/pubmed/parser.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `parseESearchResponse(xml: string): ESearchResult`
  - `parseEFetchResponse(xml: string): PubMedArticle[]`
  - Use `fast-xml-parser` for XML parsing (see ADR-004)
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Parser correctly extracts all Article fields

### Step 4: Implement HTTP Client

- [x] Write test: `src/providers/pubmed/client.test.ts`
  - Test esearch API call construction
  - Test efetch API call construction
  - Test API key inclusion when configured
  - Test email parameter inclusion (NCBI requirement)
  - Test pagination parameters (retstart, retmax)
  - Test usehistory parameter for large results
  - Mock HTTP calls for unit tests
- [x] Create stub: `src/providers/pubmed/client.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `PubMedClient` class
  - `search(query: string, options): Promise<ESearchResult>`
  - `fetch(pmids: string[]): Promise<PubMedArticle[]>`
  - Rate limiter integration
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Client correctly calls E-utilities endpoints

### Step 5: Implement PubMed Provider

- [x] Write test: `src/providers/pubmed/provider.test.ts`
  - Test implements Provider interface
  - Test search returns async iterable of articles
  - Test pagination handling (streams all results)
  - Test translateQuery method
  - Test testConnection method
  - Test error handling for various HTTP statuses
  - Test rate limiting integration
  - Test retry logic for 5xx errors
- [x] Create stub: `src/providers/pubmed/provider.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `class PubMedProvider extends BaseProvider`
  - `async *search(query, options): AsyncIterable<Article>`
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - `testConnection(): Promise<boolean>`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Provider fully implements interface contract

### Step 5a: Implement Session Resume (PubMed-specific)

- [x] Write test: `src/providers/pubmed/provider.test.ts` (additional tests)
  - Test getSearchState returns PubMed-specific state (webenv, querykey)
  - Test resumeSearch uses saved webenv/querykey
  - Test validateState checks if webenv is still valid
  - Test handles expired webenv (server-side history expires)
- [x] Verify tests fail (Red)
- [x] Implement:
  - Define `PubMedProviderState` with webenv, querykey, retstart
  - `getSearchState(): SearchState` - captures current pagination state
  - `resumeSearch(state): AsyncIterable<Article>` - resumes from saved state
  - `validateState(state): Promise<boolean>` - tests if webenv still works
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Can interrupt and resume PubMed searches

### Step 6: Implement E2E Tests

- [ ] Update test: `src/providers/pubmed/pubmed.e2e.test.ts`
  - Test searching PubMed with simple query
  - Test searching with field qualifiers
  - Test searching with date filters
  - Test fetching article details by PMID
  - Test pagination with multiple pages
  - Test rate limiting is respected
  - Test connection test works
  - Test session resume with usehistory (webenv/querykey)
  - Test state validation detects expired webenv
- [ ] Verify tests pass with `npm run test:e2e`
- [ ] Acceptance: E2E tests pass against live PubMed API

### Step 7: Provider Registration & Module Export

- [ ] Write test: `src/providers/pubmed/index.test.ts`
  - Test exports are correct
  - Test provider can be created from registry
- [ ] Create `src/providers/pubmed/index.ts`
  - Export PubMedProvider
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
# Run E2E tests (calls live PubMed API)
npm run test:e2e

# Optional: Set API key for higher rate limits (10 req/s vs 3 req/s)
export NCBI_API_KEY="your-api-key"
```

## Notes

- E-utilities requires email parameter for API calls (NCBI policy)
- Without API key: 3 requests/second limit
- With API key: 10 requests/second limit
- Use `usehistory=y` for result sets > 10,000
- efetch returns XML; use `fast-xml-parser` (ADR-004)
- MeSH terms use [mh] qualifier, not [keyword]
- PubMed is the primary provider for biomedical systematic reviews
