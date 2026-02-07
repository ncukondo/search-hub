# Task: Fix JATS Headerless Table Markdown Rendering

## Purpose

When a JATS `<table-wrap>` has no `<thead>` element, the Markdown renderer produces invalid
Markdown tables — rows without the required header separator line. Standard Markdown tables
must have a header row followed by a separator (`| --- | --- |`). Without this, most parsers
treat the output as plain text rather than rendering it as a table.

Current behavior for a headerless table:
```markdown
| cell1 | cell2 |
| cell3 | cell4 |
```

Expected behavior — generate empty header cells + separator:
```markdown
|  |  |
| --- | --- |
| cell1 | cell2 |
| cell3 | cell4 |
```

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)

## Related Source Files

- `src/fulltext/convert/markdown-writer.ts` — `renderBlock()` table case
- `src/fulltext/convert/markdown-writer.test.ts`
- `src/fulltext/convert/jats-parser.ts` — `parseTableWrap()` (no changes needed)
- `src/fulltext/convert/jats-parser.test.ts`

## Implementation Steps

### Step 1: Fix headerless table rendering in markdown-writer

- [x] Write test: headerless table (empty headers, rows present) produces valid Markdown with
  empty header row and separator line
- [x] Verify test fails (Red)
- [x] Update `renderBlock()` table case to generate empty header cells + separator when
  `headers.length === 0` and `rows.length > 0`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: headerless tables produce valid Markdown

### Step 2: E2E integration test

- [x] Write E2E test: JATS XML with headerless `<table-wrap>` converts to valid Markdown table
- [x] Run full test suite: `npm test`
- [x] Acceptance: all tests pass

## Notes

- The parser already correctly returns empty `headers: []` for headerless tables — no parser changes needed
- The fix is entirely in the markdown-writer's `renderBlock()` table case
- Column count for the synthetic header is inferred from `rows[0].length`
