# Task: Support Additional JATS Inline Elements

## Purpose

The JATS parser's `parseInlineContent()` currently handles `<bold>`, `<italic>`, `<sup>`, `<sub>`, and `<xref>`. Other common inline elements fall through to the generic `extractAllText` fallback, which preserves text content but loses semantic information (URLs, formatting).

The most impactful gap is `<ext-link>`, which causes external URLs to be lost. Other elements lose formatting that could easily be represented in Markdown.

1. **`<ext-link>`** (High): External hyperlinks. Extremely common in Methods sections (software URLs, database links, registration URLs). The `xlink:href` attribute containing the actual URL is lost — only the display text is kept.

2. **`<monospace>`** (Medium): Inline code (gene names, software commands, identifiers). Should render as backtick-quoted text in Markdown.

3. **`<underline>`** (Low): Underlined text. No direct Markdown equivalent, but could use `<u>` HTML tag or just pass through as plain text.

4. **`<sc>`** (Low): Small caps. Common for author names in running text. No Markdown equivalent.

5. **`<inline-formula>`** (Medium): Inline math expressions. Contains `<tex-math>` or MathML. Should extract TeX source as `$...$`.

6. **`<ext-link>` and `<uri>` in non-body contexts**: These also appear in `<mixed-citation>` references (linking to DOIs, PMIDs). Currently the URL is lost there too.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseInlineContent()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `InlineContent` type
- `src/fulltext/convert/markdown-writer.ts` — `renderInline()`
- `src/fulltext/convert/markdown-writer.test.ts`

## Implementation Steps

### Step 1: Support `<ext-link>` with URL preservation

- [ ] Add `'link'` type to `InlineContent` union: `{ type: 'link'; url: string; children: InlineContent[] }`
- [ ] Write test: `<ext-link ext-link-type="uri" xlink:href="https://example.com">Example</ext-link>` produces link with URL
  ```xml
  <p>Software available at <ext-link ext-link-type="uri"
    xlink:href="https://www.r-project.org/">https://www.r-project.org/</ext-link>.</p>
  ```
- [ ] Write test: `<uri>` element also produces link
- [ ] Verify test fails (Red)
- [ ] Update `parseInlineContent()`:
  - Add `ext-link` case: extract `xlink:href` attribute and parse inner content
  - Add `uri` case: extract `xlink:href` or use text content as URL
- [ ] Add `renderInline()` case: render as Markdown link `[text](url)`
  - If display text equals URL, render as bare URL
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: external links in body text are clickable in Markdown

### Step 2: Support `<monospace>` as inline code

- [ ] Add `'code'` type to `InlineContent` union: `{ type: 'code'; text: string }`
- [ ] Write test: `<monospace>` renders as backtick-quoted text
  ```xml
  <p>Run the <monospace>install.sh</monospace> script.</p>
  ```
- [ ] Verify test fails (Red)
- [ ] Add `monospace` case to `parseInlineContent()`
- [ ] Add `renderInline()` case: render as `` `text` ``
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: monospace text renders as inline code in Markdown

### Step 3: Support `<inline-formula>` with TeX extraction

- [ ] Add `'inline-formula'` type to `InlineContent` union: `{ type: 'inline-formula'; tex?: string; text: string }`
- [ ] Write test: `<inline-formula>` with `<tex-math>` child
  ```xml
  <p>where <inline-formula><tex-math>p &lt; 0.05</tex-math></inline-formula> was significant</p>
  ```
- [ ] Write test: `<inline-formula>` with `<alternatives>` containing `<tex-math>`
- [ ] Verify test fails (Red)
- [ ] Add `inline-formula` case to `parseInlineContent()` — extract `<tex-math>` content
- [ ] Add `renderInline()` case: render as `$p < 0.05$` (inline LaTeX) or plain text fallback
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: inline formulas render as LaTeX notation

### Step 4: Support `<underline>` and `<sc>` (pass-through)

- [ ] Write test: `<underline>` text is preserved (rendered as plain text or `<u>` HTML)
- [ ] Write test: `<sc>` (small caps) text is preserved
- [ ] Add explicit cases in `parseInlineContent()` to handle these as plain text (avoiding the generic unknown-element fallback)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: no content loss from underlined or small-caps text

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/fulltext/convert/convert.e2e.test.ts`
  - Test with XML containing `<ext-link>`, `<monospace>`, `<inline-formula>`
- [ ] Verify links are preserved as Markdown links in output
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Convert a PMC article with external links, verify clickable URLs

## Notes

- `<ext-link>` is the highest priority — URL loss significantly degrades output quality
- The `xlink:href` attribute uses the XLink namespace; `fast-xml-parser` with `ignoreAttributes: false` should capture it as `@_xlink:href` (verify attribute name prefix)
- `<monospace>` is commonly used for gene names (e.g., `<monospace>BRCA1</monospace>`) and software
- `<sc>` has no Markdown equivalent; CSS `font-variant: small-caps` would require HTML output
- `<inline-formula>` TeX extraction parallels Step 3 of task 79 (`<disp-formula>`)
