# Task: ERIC Provider

## Purpose

Implement the ERIC (Education Resources Information Center) provider to search the U.S. Department of Education's database of education research and information. ERIC is the primary database for education literature, essential for systematic reviews in education and related fields.

## Related Specs

- [spec/providers/eric.md](../providers/eric.md) - ERIC API specification
- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface contract
- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL structure
- [spec/decisions/005-provider-session-resume.md](../decisions/005-provider-session-resume.md) - Session resume architecture

## Related Source Files

- `src/providers/eric/types.ts` - ERIC-specific types
- `src/providers/eric/translator.ts` - Query DSL to ERIC syntax
- `src/providers/eric/client.ts` - HTTP client for ERIC API
- `src/providers/eric/parser.ts` - JSON response parsing
- `src/providers/eric/provider.ts` - ERICProvider implementation
- `src/providers/eric/index.ts` - Module exports
- `src/providers/eric/*.test.ts` (co-located unit tests)
- `src/providers/eric/eric.e2e.test.ts` (E2E tests)

## Implementation Steps

### Step 1: Define ERIC-specific Types

- [ ] Write test: `src/providers/eric/types.test.ts`
  - Test type compatibility with base Article type
  - Test ERIC-specific fields (ERIC ID, descriptors)
- [ ] Create types: `src/providers/eric/types.ts`
  - `ERICDocument` extending base `Article`
  - `ERICSearchResponse` for API response
  - `ERICConfig` for provider configuration
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Types match spec/providers/eric.md

### Step 2: Implement Query Translator

- [ ] Write test: `src/providers/eric/translator.test.ts`
  - Test field mapping (title -> title:, abstract -> abstract:, etc.)
  - Test title_abstract -> (title: OR abstract:) expansion
  - Test author field mapping
  - Test descriptor (keyword) mapping
  - Test boolean operators (AND, OR, NOT)
  - Test phrase handling with quotes
  - Test date filter translation (publicationdateyear:[YYYY TO YYYY])
- [ ] Create stub: `src/providers/eric/translator.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - Field prefix mappings
  - Filter translations
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Translator produces valid ERIC queries per spec

### Step 3: Implement JSON Response Parser

- [ ] Write test: `src/providers/eric/parser.test.ts`
  - Test parsing search response (numFound, docs array)
  - Test extracting document fields (id, title, author, description)
  - Test handling missing optional fields
  - Test handling author array (parse "Last, First" format)
  - Test publication year extraction
  - Test source/journal extraction
- [ ] Create stub: `src/providers/eric/parser.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `parseSearchResponse(json: unknown): ERICSearchResult`
  - `parseDocument(doc: unknown): ERICDocument`
  - Author name parsing
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Parser correctly extracts all Article fields

### Step 4: Implement HTTP Client

- [ ] Write test: `src/providers/eric/client.test.ts`
  - Test search API call construction
  - Test query parameter encoding
  - Test pagination parameters (start, rows)
  - Test fields parameter for response filtering
  - Test format=json parameter
  - Mock HTTP calls for unit tests
- [ ] Create stub: `src/providers/eric/client.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `ERICClient` class
  - `search(query: string, options): Promise<ERICSearchResult>`
  - Rate limiter integration
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Client correctly calls ERIC API endpoint

### Step 5: Implement ERIC Provider

- [ ] Write test: `src/providers/eric/provider.test.ts`
  - Test implements Provider interface
  - Test search returns async iterable of articles
  - Test pagination handling (streams all results)
  - Test translateQuery method
  - Test testConnection method
  - Test error handling for various HTTP statuses
  - Test rate limiting integration
  - Test retry logic for 5xx errors
- [ ] Create stub: `src/providers/eric/provider.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `class ERICProvider extends BaseProvider`
  - `async *search(query, options): AsyncIterable<Article>`
  - `translateQuery(ast: QueryAST): TranslatedQuery`
  - `testConnection(): Promise<boolean>`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Provider fully implements interface contract

### Step 5a: Implement Session Resume (Offset-based)

- [ ] Write test: `src/providers/eric/provider.test.ts` (additional tests)
  - Test getSearchState returns offset-based state
  - Test resumeSearch continues from saved offset
  - Test validateState always returns true (offset-based, no expiration)
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - Define `ERICProviderState` with offset
  - `getSearchState(): SearchState` - captures current pagination offset
  - `resumeSearch(state): AsyncIterable<Article>` - resumes from saved offset
  - `validateState(state): Promise<boolean>` - always valid for offset-based
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Can interrupt and resume ERIC searches

### Step 6: Implement E2E Tests

- [ ] Update test: `src/providers/eric/eric.e2e.test.ts`
  - Test searching ERIC with simple query
  - Test searching with field prefixes
  - Test searching with date filters
  - Test fetching document by ERIC ID
  - Test pagination with multiple pages
  - Test rate limiting is respected
  - Test connection test works
  - Test session resume from saved offset
- [ ] Verify tests pass with `npm run test:e2e`
- [ ] Acceptance: E2E tests pass against live ERIC API

### Step 7: Provider Registration & Module Export

- [ ] Write test: `src/providers/eric/index.test.ts`
  - Test exports are correct
  - Test provider can be created from registry
- [ ] Create `src/providers/eric/index.ts`
  - Export ERICProvider
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
# Run E2E tests (calls live ERIC API)
npm run test:e2e

# ERIC API requires no authentication
```

## Notes

- ERIC API requires no authentication
- Recommended rate limit: 5 requests/second (be respectful)
- Response is JSON (no XML parsing needed)
- ERIC ID format: EJ123456 (journal) or ED123456 (document)
- Author names are in "Last, First" format
- Uses ERIC Thesaurus descriptors (not MeSH)
- Maximum 2000 results per request (use pagination)
- Primary database for education research
