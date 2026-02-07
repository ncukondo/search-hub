# Task: Fix JATS Headerless Table Rendering

## Purpose

When a JATS `<table-wrap>` contains a table with no `<thead>` (header-less, body-only table), the Markdown writer outputs rows without the mandatory header/separator row, and cell-internal `<p>` elements are joined with raw `<br>` tags. This produces invalid Markdown tables that most renderers cannot display correctly.

**Current output** (Table 1 from PMC11293181):
```markdown
*Table 1. Interview guide*

| Introduction<br>Explain that this interview has... |
| Questions to ask<br>Places of interaction<br>Where do... |
```

**Problems**:
1. No header row or `| --- |` separator — most Markdown renderers require these
2. Raw `<br>` HTML tags for multi-paragraph cells

**Expected output** (option: convert to list-based format for headerless single-column tables):
```markdown
*Table 1. Interview guide*

**Introduction**
Explain that this interview has nothing to do with evaluation...

**Questions to ask**
Places of interaction
Where do first- and second-year residents interact?
```

Or, if keeping table format, add a minimal header row.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)
- Task 78 ([20260207-03](completed/20260207-03-jats-table-figure-rendering.md)) — Table/figure rendering

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseTable()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/markdown-writer.ts` — `renderBlock()` (table case)
- `src/fulltext/convert/markdown-writer.test.ts`

## Implementation Steps

### Step 1: Replace `<br>` with newlines in table cell content

- [ ] Write test: table cell with multiple `<p>` elements should not contain raw `<br>` tags in Markdown output
- [ ] Verify test fails (Red)
- [ ] Update table cell content joining logic to use newlines or paragraph breaks instead of `<br>`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: No raw `<br>` tags in Markdown table cells

### Step 2: Handle headerless tables gracefully

- [ ] Write test: `<table>` with only `<tbody>` (no `<thead>`) should produce valid Markdown
- [ ] Write test: single-column headerless table should render in a readable format
- [ ] Verify tests fail (Red)
- [ ] Implement fallback: for headerless tables, either (a) add a blank header + separator row, or (b) convert single-column headerless tables to a list/paragraph-based format
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: Headerless tables render correctly in standard Markdown renderers

### Step 3: Multi-paragraph cell formatting

- [ ] Write test: table cell containing 3+ `<p>` elements should produce readable output
- [ ] Verify test fails (Red)
- [ ] Implement: for cells with multiple paragraphs, use the first paragraph as the primary content and subsequent paragraphs as continuation (e.g., separated by newlines in non-table format, or ` / ` in table format)
- [ ] Verify test passes (Green)
- [ ] Acceptance: Multi-paragraph cells are readable

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test with real PMC XML containing headerless table
- [ ] Verify all tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Confirm table renders correctly in a Markdown viewer
- [ ] Acceptance: All tests pass, tables render properly

## TDD Cycle Reference

```
┌─────────────────────────────────────────────────────┐
│  1. Write Test (Red)                                │
│     - Write test that describes expected behavior   │
│     - Run test → should FAIL                        │
├─────────────────────────────────────────────────────┤
│  2. Implement (Green)                               │
│     - Write minimal code to pass test               │
│     - Run test → should PASS                        │
├─────────────────────────────────────────────────────┤
│  3. Refactor                                        │
│     - npm run lint                                  │
│     - npm run typecheck                             │
│     - Clean up code if needed                       │
│     - Run test → should still PASS                  │
└─────────────────────────────────────────────────────┘
```

## Notes

- The Interview guide table (PMC11293181) is a common pattern: a single-column, no-header, multi-paragraph-per-cell table used as a structured text block
- Converting such tables to a non-table Markdown format (paragraphs/bold headers) is likely more readable than forcing a pipe-table format
- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
