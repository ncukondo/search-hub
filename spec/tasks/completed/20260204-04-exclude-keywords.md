# Task: Add Exclude Keywords (NOT Operator) to Query DSL

## Purpose

Users need to exclude irrelevant results from their searches. For example, when searching for "EPA" (Entrustable Professional Activities), results about the US Environmental Protection Agency should be excluded. This task adds an `exclude` field to the query DSL that translates to NOT operators for each provider.

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL grammar (needs update)
- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface

## Related Source Files

- `src/query/types.ts` - Query AST types
- `src/query/parser.ts` - YAML parser
- `src/query/validator.ts` - Query validation
- `src/query/translator.ts` - Query translation to provider syntax
- `src/providers/*/translator.ts` - Provider-specific translators

## Implementation Steps

### Step 1: Update Query DSL types

- [x] Step 1: Add `exclude` field to QueryBlock type
  - [x] Write test: `src/query/types.test.ts` - type validation tests
  - [x] Implement: Add `exclude?: string[]` to TermBlock
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: TypeScript types include exclude field

New DSL structure:
```yaml
query:
  - field: title_abstract
    terms:
      keywords:
        - "EPA"
        - "entrustable professional activities"
      exclude:           # New field
        - "environmental protection"
        - "pollution"
    operator: OR
```

### Step 2: Update query parser

- [x] Step 2: Parse exclude field from YAML
  - [x] Write test: `src/query/parser.test.ts` - parse YAML with exclude
  - [x] Implement: Update parser to handle exclude field (via validator schema)
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Parser correctly extracts exclude terms

### Step 3: Update query validator

- [x] Step 3: Validate exclude field
  - [x] Write test: `src/query/validator.test.ts` - validation tests
  - [x] Implement: Add validation for exclude (array of strings)
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Invalid exclude values rejected with clear errors

### Step 4: Update PubMed translator

- [x] Step 4: Translate exclude to PubMed NOT syntax
  - [x] Write test: `src/providers/pubmed/translator.test.ts`
  - [x] Implement: Add NOT clauses for exclude terms
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `exclude: ["term"]` → `NOT term[tiab]`

### Step 5: Update Scopus translator

- [x] Step 5: Translate exclude to Scopus AND NOT syntax
  - [x] Write test: `src/providers/scopus/translator.test.ts`
  - [x] Implement: Add AND NOT clauses for exclude terms
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `exclude: ["term"]` → `AND NOT TITLE-ABS-KEY(term)`

### Step 6: Update ERIC translator

- [x] Step 6: Translate exclude to ERIC NOT syntax
  - [x] Write test: `src/providers/eric/translator.test.ts`
  - [x] Implement: Add NOT clauses for exclude terms
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Correct ERIC NOT syntax

### Step 7: Update arXiv translator

- [x] Step 7: Translate exclude to arXiv ANDNOT syntax
  - [x] Write test: `src/providers/arxiv/translator.test.ts`
  - [x] Implement: Add ANDNOT clauses for exclude terms
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Correct arXiv ANDNOT syntax

### Step 8: Update query init template

- [x] Step 8: Add commented exclude example to template
  - [x] Write test: `src/cli/commands/query/init.test.ts`
  - [x] Implement: Update template in query init command
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `query init` shows exclude field example

### Step 9: Update spec documentation

- [x] Step 9: Document exclude field in query-dsl.md
  - [x] Update spec/models/query-dsl.md
  - [x] Add examples and use cases
  - [x] Acceptance: Documentation is complete and accurate

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/query/exclude.e2e.test.ts`
  - Test full workflow: YAML with exclude → translated queries → search
  - Test with multiple providers
  - Verify NOT terms appear in translated queries
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Manual verification: Test exclude with real search
- [ ] Acceptance: Exclude terms correctly filter results across all providers

## Notes

- NOT operator syntax varies by provider - verify each implementation
- Consider interaction with existing operator field (OR/AND)
- Exclude should apply within a block, not across blocks
