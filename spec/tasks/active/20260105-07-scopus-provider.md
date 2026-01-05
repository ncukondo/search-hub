# Task: Scopus Provider

## Purpose

Implement the Scopus provider to search Elsevier's Scopus database. Scopus is one of the largest abstract and citation databases of peer-reviewed literature, covering science, technology, medicine, social sciences, and arts and humanities. Essential for comprehensive systematic reviews across multiple disciplines.

## Related Specs

- [spec/providers/scopus.md](../providers/scopus.md) - Scopus API specification
- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface contract
- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL structure
- [spec/decisions/005-provider-session-resume.md](../decisions/005-provider-session-resume.md) - Session resume architecture

## Related Source Files

- `src/providers/scopus/types.ts` - Scopus-specific types
- `src/providers/scopus/translator.ts` - Query DSL to Scopus syntax
- `src/providers/scopus/client.ts` - HTTP client for Scopus API
- `src/providers/scopus/parser.ts` - JSON response parsing
- `src/providers/scopus/provider.ts` - ScopusProvider implementation
- `src/providers/scopus/index.ts` - Module exports
- `src/providers/scopus/*.test.ts` (co-located unit tests)
- `src/providers/scopus/scopus.e2e.test.ts` (E2E tests)

## Implementation Steps

### Step 1: Define Scopus-specific Types

- [x] Write test: `src/providers/scopus/types.test.ts`
  - Test type compatibility with base Article type
  - Test Scopus-specific fields (Scopus ID, citation count)
- [x] Create types: `src/providers/scopus/types.ts`
  - `ScopusDocument` extending base `Article`
  - `ScopusSearchResponse` for API response
  - `ScopusConfig` for provider configuration (including api_key)
  - `ScopusAuthor` for author details with authid
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Types match spec/providers/scopus.md

### Step 2: Implement Query Translator

- [x] Write test: `src/providers/scopus/translator.test.ts`
  - Test field mapping (title -> TITLE(), abstract -> ABS(), etc.)
  - Test title_abstract -> TITLE-ABS-KEY() conversion
  - Test author field mapping (AUTH())
  - Test keyword field mapping (KEY())
  - Test all field mapping (ALL())
  - Test boolean operators (AND, OR, AND NOT)
  - Test phrase handling with quotes or braces
  - Test year filter translation (PUBYEAR > YYYY, PUBYEAR < YYYY)
  - Test language filter translation (LANGUAGE(english))
  - Test source type filter from overrides (SRCTYPE(j OR p))
- [x] Create stub: `src/providers/scopus/translator.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - Field function mappings
  - Filter translations
  - Override handling for source_types
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Translator produces valid Scopus queries per spec

### Step 3: Implement JSON Response Parser

- [x] Write test: `src/providers/scopus/parser.test.ts`
  - Test parsing search-results structure
  - Test extracting opensearch:totalResults
  - Test extracting entry array
  - Test extracting document fields (dc:identifier, dc:title, etc.)
  - Test handling missing optional fields
  - Test author array parsing (authname, authid)
  - Test date parsing from prism:coverDate
  - Test citation count extraction
- [x] Create stub: `src/providers/scopus/parser.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `parseSearchResponse(json: unknown): ScopusSearchResult`
  - `parseDocument(entry: unknown): ScopusDocument`
  - Author parsing with IDs
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Parser correctly extracts all Article fields

### Step 4: Implement HTTP Client

- [x] Write test: `src/providers/scopus/client.test.ts`
  - Test search API call construction
  - Test X-ELS-APIKey header inclusion
  - Test X-ELS-Insttoken header when configured
  - Test Accept: application/json header
  - Test query parameter encoding
  - Test pagination parameters (start, count)
  - Test view parameter (STANDARD vs COMPLETE)
  - Test fields parameter for response filtering
  - Test rate limit header parsing (X-RateLimit-*)
  - Mock HTTP calls for unit tests
- [x] Create stub: `src/providers/scopus/client.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `ScopusClient` class
  - `search(query: string, options): Promise<ScopusSearchResult>`
  - API key header handling
  - Rate limit header parsing
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Client correctly calls Scopus API with authentication

### Step 5: Implement Scopus Provider

- [x] Write test: `src/providers/scopus/provider.test.ts`
  - Test implements Provider interface
  - Test search returns async iterable of articles
  - Test pagination handling (streams all results, max 25 per page)
  - Test translateQuery method
  - Test testConnection method
  - Test error handling for 401 (invalid API key)
  - Test error handling for 403 (quota/IP restriction)
  - Test error handling for 429 (rate limited)
  - Test retry logic for 5xx errors
  - Test rate limiting integration
- [x] Create stub: `src/providers/scopus/provider.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `class ScopusProvider extends BaseProvider`
  - `async *search(query, options): AsyncIterable<Article>`
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - `testConnection(): Promise<boolean>`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Provider fully implements interface contract

### Step 5a: Implement Session Resume (Offset-based)

- [x] Write test: `src/providers/scopus/provider.test.ts` (additional tests)
  - Test getSearchState returns offset-based state
  - Test resumeSearch continues from saved offset
  - Test validateState checks API key is still valid
  - Test handles quota exhaustion on resume
- [x] Verify tests fail (Red)
- [x] Implement:
  - Define `ScopusProviderState` with offset
  - `getSearchState(): SearchState` - captures current pagination offset
  - `resumeSearch(state): AsyncIterable<Article>` - resumes from saved offset
  - `validateState(state): Promise<boolean>` - validates API key still works
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Can interrupt and resume Scopus searches

### Step 6: Implement E2E Tests

- [x] Update test: `src/providers/scopus/scopus.e2e.test.ts`
  - Test searching Scopus with simple query
  - Test searching with field functions
  - Test searching with year filters
  - Test fetching document by Scopus ID
  - Test pagination with multiple pages
  - Test rate limiting is respected
  - Test connection test works
  - Test authentication error handling (invalid key)
  - Test session resume from saved offset
  - Skip tests if SCOPUS_API_KEY not set
- [x] Verify tests pass with `npm run test:e2e`
- [x] Acceptance: E2E tests pass against live Scopus API (with valid API key)

### Step 7: Provider Registration & Module Export

- [x] Write test: `src/providers/scopus/index.test.ts`
  - Test exports are correct
  - Test provider can be created from registry
- [x] Create `src/providers/scopus/index.ts`
  - Export ScopusProvider
  - Export types
  - Register provider in registry
- [x] Verify tests pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Provider is discoverable via registry

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
# Run E2E tests (calls live Scopus API)
npm run test:e2e

# Required: Set Scopus API key
export SCOPUS_API_KEY="your-api-key"

# Optional: Set institutional token for higher limits
export SCOPUS_INST_TOKEN="your-inst-token"
```

## Notes

- **API key required**: Scopus API requires institutional subscription and API key
- Response is JSON (no XML parsing needed)
- Scopus ID format: SCOPUS_ID:12345678
- COMPLETE view gives abstracts but limits page size to 25
- Rate limits vary by subscription tier (check X-RateLimit-* headers)
- 429 response includes Retry-After header
- Uses AND NOT instead of NOT for boolean negation
- Uses function syntax: TITLE(), ABS(), TITLE-ABS-KEY(), etc.
- Phrases can use quotes or braces: "..." or {...}
- E2E tests should be skipped if API key not configured
- Consider caching API key validation result
