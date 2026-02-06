# Task: Add `<disp-quote>` Support and Detect Nested Block Elements in `<p>`

GitHub Issue: #65 (High severity items)

## Purpose

Two related issues in the JATS parser prevent correct rendering of block-level elements:

1. **`<disp-quote>` not supported**: PMC articles use `<disp-quote>` for interview quotations
   and block citations. These are currently treated as unknown inline elements and merged
   flat into surrounding paragraphs, losing all visual distinction.

2. **`<table-wrap>` and `<fig>` nested inside `<p>` not detected**: In real PMC XML,
   `<table-wrap>` and `<fig>` are commonly children of `<p>` rather than direct children
   of `<sec>`. The current `parseBlockContent()` only looks at section-level children,
   missing these nested elements.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseBlockContent()`, `parseInlineContent()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `BlockElement` union (needs `blockquote` variant)
- `src/fulltext/convert/markdown-writer.ts` — render `blockquote` blocks
- `src/fulltext/convert/markdown-writer.test.ts`

## Implementation Steps

### Step 1: Add `blockquote` to `BlockElement` Type

- [ ] Write test: `parseBlockContent` returns a `blockquote` block for `<disp-quote>`
- [ ] Add `{ type: 'blockquote'; content: InlineContent[] }` to `BlockElement` union in `types.ts`
- [ ] Implement `<disp-quote>` parsing in `parseBlockContent()` (or inline content handler)
  - Extract `<p>` children of `<disp-quote>` as blockquote content
  - Handle nested `<disp-quote>` inside `<p>` (common pattern in PMC)
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `<disp-quote>` produces `blockquote` block elements

### Step 2: Render Blockquotes in Markdown Writer

- [ ] Write test: `blockquote` block renders as `> ` prefixed lines
- [ ] Implement blockquote rendering in `markdown-writer.ts`
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: blockquote content rendered with `> ` prefix

### Step 3: Detect `<table-wrap>` and `<fig>` Nested Inside `<p>`

- [ ] Write test: `<p>` containing `<table-wrap>` produces both paragraph and table blocks
  ```xml
  <sec>
    <p>See Table <xref rid="Tab1">1</xref>.</p>
    <p><table-wrap id="Tab1">...</table-wrap></p>
  </sec>
  ```
- [ ] Update block content parsing to scan `<p>` children for nested block elements
  - When a `<p>` contains `<table-wrap>`, `<fig>`, or `<disp-quote>`, split into:
    1. Inline content before the block element → paragraph block
    2. The block element itself → table/figure/blockquote block
    3. Inline content after → another paragraph block
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: nested block elements are correctly extracted from `<p>`

### Final Step: E2E Integration Tests

- [ ] Write E2E test with PMC XML containing `<disp-quote>` inside `<p>`
- [ ] Write E2E test with PMC XML containing `<table-wrap>` inside `<p>`
- [ ] Verify Markdown output shows blockquotes with `> ` prefix
- [ ] Verify tables nested in paragraphs are rendered as proper tables
- [ ] Run full test suite: `npm test`
- [ ] Manual verification with PMID:39090703 (contains 26 `<disp-quote>` instances)

## Notes

- Depends on Task 68 (20260206-02: `preserveOrder` refactor) being completed first.
  The parsing logic must work with the new ordered array format.
- The `<disp-quote>` inside `<p>` pattern is the same structural issue as nested
  `<table-wrap>`/`<fig>` — both are block elements embedded in paragraph context.
