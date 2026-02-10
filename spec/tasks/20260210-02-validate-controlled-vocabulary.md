# Task: Validate Controlled Vocabulary Terms

## Purpose

When users specify MeSH terms in their query YAML, typos or non-existent terms silently produce wrong search results.
This task adds controlled vocabulary validation to `query validate`, checking MeSH terms against the NLM MeSH Lookup API
and reporting invalid terms with suggestions.

**Key scenario**:
- User writes `mesh: ["Diabtes Mellitus"]` (typo) in query YAML
- `query validate --vocab query.yaml` detects invalid term and suggests "Diabetes Mellitus"
- User fixes the typo before running an expensive search

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - TermBlock with mesh/eric vocabularies
- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed MeSH handling

## Related Source Files

- `src/query/types.ts` - QueryAST, TermBlock with mesh/eric fields
- `src/query/vocab-validator.ts` (new) - Vocabulary validation logic
- `src/query/mesh-lookup.ts` (new) - NLM MeSH Lookup API client
- `src/cli/commands/query/validate.ts` - CLI validate command (add --vocab flag)

## Implementation Steps

### Step 1: Create MeSH Lookup API client

- [x] Write test: `src/query/mesh-lookup.test.ts`
  - Test `lookupMeSHTerm(term)` returns valid/invalid result
  - Test exact match returns `{ found: true, label }`
  - Test invalid term returns `{ found: false, suggestions }`
  - Test network error handling
- [x] Create `src/query/mesh-lookup.ts`
  - `MeSHLookupClient` class with `lookupTerm(term: string)` method
  - Uses NLM MeSH Lookup API: `https://id.nlm.nih.gov/mesh/lookup/term`
  - Exact match: `?label=term&match=exact&limit=1`
  - Suggestions: `?label=term&match=startswith&limit=5`
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: MeSHLookupClient can validate terms and return suggestions

### Step 2: Create vocabulary validator

- [x] Write test: `src/query/vocab-validator.test.ts`
  - Test extracts mesh terms from QueryAST blocks
  - Test validates each term against MeSH lookup
  - Test returns structured results (valid/invalid with suggestions)
  - Test handles AST with no controlled vocabulary terms (no-op)
  - Test deduplicates terms across blocks
- [x] Create `src/query/vocab-validator.ts`
  - `extractControlledVocabTerms(ast: QueryAST): VocabTerm[]`
  - `validateControlledVocab(ast: QueryAST, client: MeSHLookupClient): Promise<VocabValidationResult>`
  - Types: `VocabTerm`, `VocabTermResult`, `VocabValidationResult`
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Vocab validator correctly validates MeSH terms from QueryAST

### Step 3: Integrate with query validate command

- [x] Write test: `src/cli/commands/query/validate.test.ts`
  - Test `--vocab` flag triggers vocabulary validation
  - Test output shows valid/invalid terms with suggestions
  - Test without `--vocab` flag behaves as before
- [x] Update `src/cli/commands/query/validate.ts`
  - Add `--vocab` option to ValidateResult
  - Call vocab validator when `--vocab` is specified
  - Format results: ✓/✗ for each term, suggestions for invalid
- [x] Update `src/cli/index.ts` to wire `--vocab` option
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `query validate --vocab file.yaml` validates MeSH terms

### Step 4: Export from query module

- [x] Update `src/query/index.ts` to export vocab validator types and functions
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: VocabValidator exports available from query module

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - Test vocab validation with mocked MeSH client in E2E context
  - Test CLI integration: `query validate --vocab` with mock API
- [x] Write API test: `src/query/mesh-lookup.api.test.ts`
  - Test real MeSH API call with known valid term ("Diabetes Mellitus, Type 2")
  - Test real MeSH API call with known invalid term
  - Test suggestions for misspelled term
- [x] Verify all E2E tests pass (405 tests)
- [x] Run full unit test suite: 1939 passed
- [x] Run real API tests: passed
- [x] Acceptance: All tests pass, MeSH validation works against real API

## Notes

- NLM MeSH Lookup API: `https://id.nlm.nih.gov/mesh/lookup/term?label=X&match=exact&limit=1`
- No API key required for MeSH Lookup
- Rate limiting: Be respectful, add small delays between lookups
- ERIC descriptor validation: Not included in this task (no public thesaurus API)
- Future: Could add Emtree validation when Embase provider is implemented
