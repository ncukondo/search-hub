# Task: Support Additional JATS Block Elements

## Purpose

JATS XML specification includes several block-level elements that the current parser (`parseBlockContent`) ignores entirely, causing content loss in converted Markdown. The affected elements are common in real PMC articles:

1. **`<boxed-text>`**: Text boxes used in clinical guidelines, review articles, and educational papers. Currently listed in `BLOCK_TAGS` (for paragraph-level detection) but not handled in `parseBlockContent` — content is silently dropped.

2. **`<def-list>`**: Definition lists used for abbreviation tables, glossaries, and terminology sections. Contains `<def-item>` with `<term>` and `<def>` pairs. Completely ignored.

3. **`<disp-formula>`**: Display-mode mathematical equations. May contain `<tex-math>`, `<mml:math>` (MathML), or `<alternatives>` with multiple representations. Completely ignored. At minimum, TeX source or alt-text should be extracted.

4. **`<preformat>`**: Preformatted text blocks (code, structured data). Should render as fenced code blocks in Markdown. Completely ignored.

5. **`<supplementary-material>`**: References to supplementary files within body sections. Completely ignored.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)
- Task 69 ([20260206-03](completed/20260206-03-jats-block-elements.md)) — added `<disp-quote>` support

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseBlockContent()`, `BLOCK_TAGS`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `BlockElement` type
- `src/fulltext/convert/markdown-writer.ts` — `renderBlock()`
- `src/fulltext/convert/markdown-writer.test.ts`

## Implementation Steps

### Step 1: Add `<boxed-text>` support

- [x] Add `'boxed-text'` type to `BlockElement` union in `types.ts`: `{ type: 'boxed-text'; title?: string; content: BlockElement[] }`
- [x] Write test: `<boxed-text>` with `<title>` and `<p>` children parses correctly
  ```xml
  <boxed-text>
    <title>Key Points</title>
    <p>Point 1: Important finding.</p>
    <p>Point 2: Another finding.</p>
  </boxed-text>
  ```
- [x] Verify test fails (Red)
- [x] Add `parseBoxedText()` function in `jats-parser.ts` — extract title and recursively parse inner block content
- [x] Add `'boxed-text'` case to `parseBlockContent()`
- [x] Add `renderBlock()` case in `markdown-writer.ts` — render as blockquote with bold title: `> **Key Points**\n> \n> Point 1...`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: boxed-text content appears in Markdown as styled blockquote

### Step 2: Add `<def-list>` support

- [x] Add `'def-list'` type to `BlockElement` union: `{ type: 'def-list'; title?: string; items: { term: string; definition: string }[] }`
- [x] Write test: `<def-list>` with `<def-item>` containing `<term>` and `<def>` pairs
  ```xml
  <def-list>
    <title>Abbreviations</title>
    <def-item>
      <term>RCT</term>
      <def><p>Randomized controlled trial</p></def>
    </def-item>
    <def-item>
      <term>CI</term>
      <def><p>Confidence interval</p></def>
    </def-item>
  </def-list>
  ```
- [x] Verify test fails (Red)
- [x] Add `parseDefList()` in `jats-parser.ts`
- [x] Add `'def-list'` case to `parseBlockContent()`
- [x] Add `renderBlock()` case — render as Markdown definition-style list: `**RCT**: Randomized controlled trial`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: definition lists render readably in Markdown

### Step 3: Add `<disp-formula>` support

- [x] Add `'formula'` type to `BlockElement` union: `{ type: 'formula'; id?: string; label?: string; tex?: string; text?: string }`
- [x] Write test: `<disp-formula>` with `<tex-math>` child
  ```xml
  <disp-formula id="eq1">
    <label>(1)</label>
    <alternatives>
      <tex-math>E = mc^2</tex-math>
      <mml:math>...</mml:math>
    </alternatives>
  </disp-formula>
  ```
- [x] Write test: `<disp-formula>` with direct `<tex-math>` (no `<alternatives>` wrapper)
- [x] Verify test fails (Red)
- [x] Add `parseDispFormula()` — extract `<tex-math>` content preferentially, fall back to `extractAllText`
- [x] Add `'disp-formula'` case to `parseBlockContent()`
- [x] Add `renderBlock()` case — render as `$$E = mc^2$$` (LaTeX block) or fenced code block with label
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: formulas appear as LaTeX or readable text in Markdown

### Step 4: Add `<preformat>` support

- [ ] Add `'preformat'` type to `BlockElement` union: `{ type: 'preformat'; text: string }`
- [ ] Write test: `<preformat>` element preserves whitespace
- [ ] Verify test fails (Red)
- [ ] Add handling in `parseBlockContent()` — extract text content preserving whitespace
- [ ] Add `renderBlock()` case — render as fenced code block (triple backticks)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: preformatted text renders as code block

### Step 5: Add `<supplementary-material>` support

- [ ] Write test: `<supplementary-material>` with `<label>` and `<caption>` renders as a note
- [ ] Verify test fails (Red)
- [ ] Add handling in `parseBlockContent()` — extract label and caption as a paragraph
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: supplementary material references are visible in output

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/fulltext/convert/convert.e2e.test.ts`
  - Test with XML containing `<boxed-text>`, `<def-list>`, `<disp-formula>`, `<preformat>`
- [ ] Verify converted Markdown contains all block elements
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Convert a PMC article known to contain these elements

## Notes

- `<boxed-text>` is already in `BLOCK_TAGS` set (for paragraph-level block detection in `parseParagraph`) but lacks actual parsing logic
- `<disp-formula>` TeX extraction is best-effort — MathML-only formulas may produce poor text output
- `<code>` element (JATS 1.1+) could be handled like `<preformat>` but is very rare in PMC
- Priority order: `<boxed-text>` > `<def-list>` > `<disp-formula>` > `<preformat>` > `<supplementary-material>`
