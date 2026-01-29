# Task: Fix PubMed NOT Operator Syntax

## Purpose

PubMed E-utilities API does not recognize `AND NOT` as a valid boolean operator combination.
The current PubMed translator generates `... AND NOT comment[pt]` by joining all query parts with `AND`,
but PubMed treats `NOT` as a standalone binary operator (like `AND` and `OR`).
As a result, the `NOT` is silently dropped and exclusion filters are inverted — e.g., `AND NOT comment[pt]`
becomes `AND comment[pt]`, causing queries with publication type exclusions to return 0 results.

### Evidence

Tested directly against PubMed E-utilities API:

| Syntax | Behavior |
|--------|----------|
| `term1 NOT comment[pt]` | Correct (NOT recognized) |
| `term1 NOT a NOT b NOT c` | Correct |
| `term1 NOT (a OR b OR c)` | Correct |
| `term1 AND NOT comment[pt]` | **Broken** (NOT silently dropped, warning emitted) |

PubMed returns `<OutputMessage>NOT</OutputMessage>` in `<WarningList>` when `AND NOT` is used.

## Related Specs

- [spec/providers/pubmed.md](../providers/pubmed.md) - Filter Mappings section (line 62: `exclude: Review` → `NOT review[pt]`)
- [spec/models/query-dsl.md](../models/query-dsl.md) - Publication type filters

## Related Source Files

- `src/providers/pubmed/translator.ts` - Query translation logic
- `src/providers/pubmed/translator.test.ts` - Translator unit tests

## Implementation Steps

### Step 1: Add failing test for NOT exclusion syntax

- [ ] Write test: `src/providers/pubmed/translator.test.ts`
  - Test that publication type exclusions generate `NOT (comment[pt] OR letter[pt])` syntax
    (grouped with OR inside parentheses, prefixed by a single `NOT`)
  - Test single exclusion generates `NOT comment[pt]` (no parentheses needed)
- [ ] Verify test fails (Red)
- [ ] Acceptance: Test asserts correct NOT syntax

### Step 2: Fix translatePublicationTypeFilters and translateQuery

- [ ] Modify `src/providers/pubmed/translator.ts`
  - In `translatePublicationTypeFilters` (line 146-149): generate a single grouped NOT clause
    instead of individual `NOT x[pt]` entries
  - In `translateQuery` (line 216-221): separate NOT clauses from AND-joined parts,
    appending them after the AND join (e.g., `<AND parts> NOT (<exclude terms>)`)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: Generated query uses `NOT (a[pt] OR b[pt])` instead of `AND NOT a[pt] AND NOT b[pt]`

### Step 3: E2E verification with PubMed API

- [ ] Write E2E test: `src/providers/pubmed/pubmed.e2e.test.ts`
  - Test that a query with publication type exclusions returns results (count > 0)
  - Verify QueryTranslation in PubMed response does not contain bare `AND "comment"[Publication Type]`
- [ ] Verify E2E test passes
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Execute `search-hub search` with a YAML file containing `publication_types.exclude`
  and confirm non-zero results
- [ ] Acceptance: All tests pass, exclusion filters work correctly against live PubMed API

## Spec Update Required

After implementation, update `spec/providers/pubmed.md` line 62:

Current:
```
| `exclude: Review` | `NOT review[pt]` |
```

Update to clarify the correct syntax when multiple exclusions are present:
```
| `exclude: [Review, Comment]` | `NOT (review[pt] OR comment[pt])` |
```

## Notes

- PubMed boolean operators (AND, OR, NOT) are all binary operators at the same level
- `AND NOT` is not a recognized operator in PubMed E-utilities; `NOT` alone is the correct form
- Reference: [E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25500/)
