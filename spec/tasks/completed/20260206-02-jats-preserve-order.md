# Task: Refactor JATS Parser to Use `preserveOrder: true`

GitHub Issue: #65 (Critical)

## Purpose

`fast-xml-parser` without `preserveOrder: true` groups same-named sibling elements into
arrays by element name, destroying the original document order of interleaved elements.
This causes **inline citations (`<xref>`) and formatting (`<italic>`, `<bold>`)** to lose
their positions within paragraph text — a critical defect for academic literature.

Enabling `preserveOrder: true` changes the parsed output from keyed objects to ordered
arrays, preserving document order. This requires a full refactor of the JATS parser.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - fulltext conversion spec

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — main parser (all functions affected)
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — IR types (may need minor additions)
- `src/fulltext/convert/markdown-writer.ts` — should NOT change (operates on IR)
- `src/fulltext/convert/convert.e2e.test.ts`

## Background: `preserveOrder` Output Format

Without `preserveOrder` (current):
```js
{ p: { "#text": "See ", xref: [{ "@_rid": "CR1", "#text": "1" }] } }
// "#text" and "xref" are separate keys — order lost
```

With `preserveOrder: true` (target):
```js
[{ p: [{ "#text": "See " }, { xref: [{ "#text": "1" }], ":@": { "@_rid": "CR1" } }] }]
// Ordered array — document order preserved
```

Key differences:
- Every element becomes `{ tagName: childrenArray, ":@": { attributes } }`
- Text nodes are `{ "#text": "value" }`
- Children are always arrays, preserving sibling order
- Attributes move to a `":@"` key on the same object

## Implementation Steps

### Step 1: Enable `preserveOrder` and Refactor `extractAllText`

- [x] Update `parser` config: add `preserveOrder: true`
- [x] Write test: mixed `<xref>` and `#text` interleaving produces correct concatenated text
- [x] Refactor `extractAllText()` to walk ordered arrays instead of object keys
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`

### Step 2: Refactor `parseInlineContent` for Ordered Traversal

This is the core fix. Currently iterates over object keys; must iterate over the
ordered child array to preserve interleaving of `#text`, `<xref>`, `<italic>`, `<bold>`, etc.

- [x] Write test: paragraph with interleaved text and `<xref>` citations
  ```xml
  <p>The adage [<xref ref-type="bibr" rid="CR1">1</xref>]. Several studies
  [<xref ref-type="bibr" rid="CR2">2</xref>,<xref ref-type="bibr" rid="CR3">3</xref>].</p>
  ```
  Expected IR: `[text("The adage ["), citation("CR1","1"), text("]. Several studies\n["), citation("CR2","2"), text(","), citation("CR3","3"), text("].")]`
- [x] Write test: mixed text and `<italic>` preserves order
  ```xml
  <p>this is the <italic>yanegawara</italic> system. Under the <italic>yanegawara</italic> system</p>
  ```
  Expected: `[text("this is the "), italic("yanegawara"), text(" system. Under the "), italic("yanegawara"), text(" system")]`
- [x] Refactor `parseInlineContent()` to iterate ordered child array
- [x] Verify tests pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: citation and italic positions match original XML order

### Step 3: Refactor `parseBlockContent`

Adapt block-level parsing to the new ordered array format.

- [x] Write test: section with `<p>`, `<list>`, `<table-wrap>` in specific order produces blocks in same order
- [x] Refactor `parseBlockContent()` to iterate ordered children
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`

### Step 4: Refactor `parseSection` and `parseJatsBody`

- [x] Write test: nested `<sec>` elements produce correct section hierarchy
- [x] Refactor `parseSection()` and `parseJatsBody()` for new format
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`

### Step 5: Refactor `parseJatsMetadata`

Adapt metadata extraction (title, authors, abstract, IDs) to ordered array format.

- [x] Write test: metadata extraction from sample JATS front matter
- [x] Refactor `parseJatsMetadata()` for new format
- [x] Add helper function(s) to navigate the `preserveOrder` structure (e.g., `findChild(node, tagName)`, `findChildren(node, tagName)`, `getAttr(node, attrName)`)
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`

### Step 6: Refactor `parseJatsReferences`

- [x] Write test: reference list with `<mixed-citation>` and `<element-citation>`
- [x] Refactor `parseJatsReferences()` for new format
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`

### Step 7: Refactor Remaining Functions

- [x] Refactor `parseList()` for new format
- [x] Refactor `parseJatsTable()` / `parseTableRow()` / `parseTableWrap()` for new format
- [x] Refactor `textContent()` helper for new format
- [x] Run full test suite
- [x] Run `npm run lint && npm run typecheck`

### Final Step: E2E Integration Tests

- [x] Update `convert.e2e.test.ts` — existing tests should pass with new parser
- [x] Add E2E test with real PMC XML containing interleaved citations (PMID:39090703 / PMC11293181)
- [x] Verify inline citations appear in correct positions in Markdown output
- [x] Verify italic text appears in correct positions
- [x] Run full test suite: `npm test`
- [x] Manual verification with reproduction script from Issue #65

## Design Notes

### Helper Utilities for `preserveOrder` Navigation

The `preserveOrder` format is verbose. Create small helpers to reduce boilerplate:

```typescript
/** Find the first child element with the given tag name. */
function findChild(children: unknown[], tagName: string): { node: unknown[]; attrs: Record<string, string> } | undefined

/** Find all child elements with the given tag name. */
function findChildren(children: unknown[], tagName: string): Array<{ node: unknown[]; attrs: Record<string, string> }>

/** Get text content from a #text node. */
function getTextContent(child: unknown): string | undefined
```

### IR Types Unchanged

The `types.ts` IR types (`InlineContent`, `BlockElement`, etc.) should remain unchanged.
The `markdown-writer.ts` operates on the IR and should require no changes.
All refactoring is confined to `jats-parser.ts`.

## Notes

- This is the root-cause fix for Issue #65. Other sub-issues (`<disp-quote>`, nested block
  elements, reference formatting, HTML entities, PMCID) are tracked in separate tasks.
- The `isArray` config option in the current parser may no longer be needed with
  `preserveOrder` since all children are already arrays.
