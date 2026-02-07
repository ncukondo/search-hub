# Task: Improve JATS Table and Figure Rendering

## Purpose

Real PMC XML testing revealed several rendering issues in tables and figures:

1. **Table cell multi-paragraph loss** (Medium): When `<td>` contains multiple `<p>` elements,
   `extractAllText` concatenates them without any separator, producing unreadable text like
   `IntroductionExplain that this interview...`. Each `<p>` should be separated by a line break
   or space.

2. **Figure caption in wrong position** (Low): `renderBlock` for figures outputs
   `![label](caption)` putting the caption text in the URL position. Should use
   `![label — caption]()` or render caption as a separate paragraph.

3. **Empty section title** (Low): When a `<sec>` has no `<title>` child, the output contains
   `## ` (heading with empty text). Should either skip the heading or use a fallback.

4. **Hex entity references not decoded** (Low): `&#x0003c;` and `&#x0003e;` (hex variants of
   `<` and `>`) appear in reference text. Task 70 fixed decimal `&#NNNN;` entities but hex
   `&#xHHHH;` may still pass through.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseTableRow()`, `parseSection()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/markdown-writer.ts` — `renderBlock()` (table, figure cases)
- `src/fulltext/convert/markdown-writer.test.ts`

## Implementation Steps

### Step 1: Fix table cell multi-paragraph rendering

- [ ] Write test: `<td>` containing multiple `<p>` elements produces text with `<br>` or space separators
  ```xml
  <td><p>Introduction</p><p>Explain that this interview has nothing to do with evaluation.</p></td>
  ```
  Expected cell text: `Introduction<br>Explain that this interview has nothing to do with evaluation.`
  or `Introduction — Explain that this interview has nothing to do with evaluation.`
  Not: `IntroductionExplain that this interview has nothing to do with evaluation.`
- [ ] Write test: `src/fulltext/convert/jats-parser.test.ts`
- [ ] Verify test fails (Red)
- [ ] Update `parseTableRow()` or the cell text extraction to join multiple `<p>` elements with `<br>` (for Markdown table compatibility) or ` / ` separator
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: table cells with multiple paragraphs are readable

### Step 2: Fix figure caption rendering

- [ ] Write test: figure block renders caption as alt text, not as URL
  ```
  Current:  ![Fig. 1](Caption text here)
  Expected: ![Fig. 1. Caption text here]()
  ```
- [ ] Write test: `src/fulltext/convert/markdown-writer.test.ts`
- [ ] Verify test fails (Red)
- [ ] Update `renderBlock()` figure case to put caption in alt text position: `![{label}. {caption}]()`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: figure caption is in the alt text, not the URL

### Step 3: Handle empty section titles

- [ ] Write test: section with empty title either omits heading or uses a sensible fallback
- [ ] Write test: `src/fulltext/convert/markdown-writer.test.ts`
- [ ] Verify test fails (Red)
- [ ] Update `renderSection()` to skip the heading line when the title is empty, or omit the section entirely if it only contains subsections
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: no `## ` (empty heading) in Markdown output

### Step 4: Fix hex entity reference decoding

- [ ] Write test: input containing `&#x0003c;` and `&#x0003e;` produces `<` and `>` in output
- [ ] Write test: `src/fulltext/convert/jats-parser.test.ts`
- [ ] Verify test fails (Red)
- [ ] Update entity decoding to handle hex references (`&#xHHHH;`) in addition to decimal (`&#NNNN;`)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: no `&#xHHHH;` sequences in Markdown output

### Final Step: E2E Integration Tests

- [ ] Write E2E test with XML containing multi-paragraph table cells
- [ ] Verify figure, table, and entity rendering in converted Markdown
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Convert PMC11293181 and PMC11864032, inspect tables and figures

## Notes

- Table cell `<br>` approach is preferred for Markdown table compatibility (Markdown tables don't support newlines, but `<br>` works in most renderers)
- The figure rendering change is a minor breaking change in output format but produces more correct Markdown
- Empty section titles typically occur for supplementary material sections
