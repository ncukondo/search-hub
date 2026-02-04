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

- [ ] Step 1: Add `exclude` field to QueryBlock type
  - [ ] Write test: `src/query/types.test.ts` - type validation tests
  - [ ] Implement: Add `exclude?: string[]` to QueryBlock
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: TypeScript types include exclude field

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

- [ ] Step 2: Parse exclude field from YAML
  - [ ] Write test: `src/query/parser.test.ts` - parse YAML with exclude
  - [ ] Implement: Update parser to handle exclude field
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Parser correctly extracts exclude terms

### Step 3: Update query validator

- [ ] Step 3: Validate exclude field
  - [ ] Write test: `src/query/validator.test.ts` - validation tests
  - [ ] Implement: Add validation for exclude (array of strings)
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Invalid exclude values rejected with clear errors

### Step 4: Update PubMed translator

- [ ] Step 4: Translate exclude to PubMed NOT syntax
  - [ ] Write test: `src/providers/pubmed/translator.test.ts`
  - [ ] Implement: Add NOT clauses for exclude terms
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `exclude: ["term"]` → `NOT term[tiab]`

### Step 5: Update Scopus translator

- [ ] Step 5: Translate exclude to Scopus AND NOT syntax
  - [ ] Write test: `src/providers/scopus/translator.test.ts`
  - [ ] Implement: Add AND NOT clauses for exclude terms
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `exclude: ["term"]` → `AND NOT TITLE-ABS-KEY(term)`

### Step 6: Update ERIC translator

- [ ] Step 6: Translate exclude to ERIC NOT syntax
  - [ ] Write test: `src/providers/eric/translator.test.ts`
  - [ ] Implement: Add NOT clauses for exclude terms
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Correct ERIC NOT syntax

### Step 7: Update arXiv translator

- [ ] Step 7: Translate exclude to arXiv ANDNOT syntax
  - [ ] Write test: `src/providers/arxiv/translator.test.ts`
  - [ ] Implement: Add ANDNOT clauses for exclude terms
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Correct arXiv ANDNOT syntax

### Step 8: Update query init template

- [ ] Step 8: Add commented exclude example to template
  - [ ] Write test: `src/cli/commands/query.test.ts`
  - [ ] Implement: Update template in query init command
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: `query init` shows exclude field example

### Step 9: Update spec documentation

- [ ] Step 9: Document exclude field in query-dsl.md
  - [ ] Update spec/models/query-dsl.md
  - [ ] Add examples and use cases
  - [ ] Acceptance: Documentation is complete and accurate

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
