# Task: Support JATS Back Matter and Floats Group

## Purpose

The current parser only extracts `<ref-list>` from `<back>` matter. Other back matter sections are silently discarded, causing significant content loss for articles with appendices or substantial supplementary content. Additionally, `<floats-group>` (a top-level container for figures and tables) is completely ignored, causing total figure/table loss for journals that place all floats outside `<body>`.

1. **`<app-group>` / `<app>` (Appendices)** (High): Appendices can contain full sections with text, tables, and figures — sometimes as substantial as the main body. Common in systematic reviews and clinical trials. Completely lost.

2. **`<ack>` (Acknowledgments)** (Medium): Standard section in most research articles. Often includes funding details not captured in `<funding-group>`. Lost.

3. **`<fn-group>` (Footnotes)** (Medium): Footnotes referenced from body text via `<xref ref-type="fn">`. The footnote text is lost while the reference markers remain.

4. **`<glossary>` (Glossary)** (Low): Term definitions. Rare but present in some guidelines and technical articles.

5. **`<floats-group>`** (High): Top-level container for figures and tables that are referenced from `<body>` via `<xref>` but physically stored outside it. Some journals/publishers use this pattern exclusively. All figures and tables are lost for these articles.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)
- Task 63 ([20260205-07](completed/20260205-07-fulltext-pmc-markdown.md)) — initial PMC conversion

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsBody()`, `parseJatsReferences()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `JatsDocument`
- `src/fulltext/convert/markdown-writer.ts` — `writeMarkdown()`
- `src/fulltext/convert/markdown-writer.test.ts`
- `src/fulltext/convert/index.ts` — `convertPmcXmlToMarkdown()`

## Implementation Steps

### Step 1: Add back matter sections to `JatsDocument`

- [ ] Extend `JatsDocument` interface with optional back matter fields:
  ```typescript
  export interface JatsDocument {
    metadata: JatsMetadata;
    sections: JatsSection[];
    references: JatsReference[];
    acknowledgments?: string;
    appendices?: JatsSection[];
    footnotes?: { id: string; text: string }[];
  }
  ```
- [ ] Run `npm run typecheck` to identify affected call sites

### Step 2: Parse `<ack>` (Acknowledgments)

- [ ] Write test: XML with `<back><ack><title>Acknowledgments</title><p>We thank...</p></ack></back>` extracts acknowledgment text
- [ ] Verify test fails (Red)
- [ ] Add `parseJatsAcknowledgments(xml)` or extend existing parsing to extract `<ack>` from `<back>`
- [ ] Verify test passes (Green)
- [ ] Add `writeMarkdown()` rendering: output as `## Acknowledgments` section before References
- [ ] Write markdown-writer test
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: acknowledgments section appears in Markdown

### Step 3: Parse `<app-group>` / `<app>` (Appendices)

- [ ] Write test: XML with appendix containing sections, paragraphs, and tables
  ```xml
  <back>
    <app-group>
      <app id="app1">
        <title>Appendix A: Search Strategy</title>
        <sec>
          <title>PubMed Search</title>
          <p>((systematic review) AND ...)</p>
        </sec>
      </app>
    </app-group>
  </back>
  ```
- [ ] Verify test fails (Red)
- [ ] Add appendix parsing — reuse `parseSection()` for each `<app>` (appendices have the same internal structure as body sections)
- [ ] Verify test passes (Green)
- [ ] Add `writeMarkdown()` rendering: output each appendix as a section after References
- [ ] Write markdown-writer test
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: appendix content appears in Markdown with proper headings

### Step 4: Parse `<fn-group>` (Footnotes)

- [ ] Write test: XML with `<fn-group>` containing `<fn id="fn1"><p>Footnote text</p></fn>`
- [ ] Verify test fails (Red)
- [ ] Add footnote extraction from `<back>/<fn-group>`
- [ ] Add `writeMarkdown()` rendering: output as numbered footnote list at end of document
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: footnotes appear at end of Markdown document

### Step 5: Parse `<floats-group>` figures and tables

- [ ] Write test: XML where figures are in `<floats-group>` instead of inline in `<body>`
  ```xml
  <article>
    <body>
      <sec><p>See <xref ref-type="fig" rid="fig1">Figure 1</xref>.</p></sec>
    </body>
    <floats-group>
      <fig id="fig1">
        <label>Figure 1</label>
        <caption><title>Study flow diagram</title></caption>
        <graphic xlink:href="fig1.jpg"/>
      </fig>
      <table-wrap id="tbl1">
        <label>Table 1</label>
        <caption><title>Baseline characteristics</title></caption>
        <table>...</table>
      </table-wrap>
    </floats-group>
  </article>
  ```
- [ ] Verify test fails (Red)
- [ ] Add `<floats-group>` parsing — extract `<fig>` and `<table-wrap>` elements using existing parsers
- [ ] Extend `JatsDocument` with `floats?: BlockElement[]` or append to a dedicated section
- [ ] Add `writeMarkdown()` rendering: output floats as an appendix-like section or inline where referenced
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: figures and tables from `<floats-group>` appear in Markdown output

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/fulltext/convert/convert.e2e.test.ts`
  - Test full conversion with back matter sections
  - Test with `<floats-group>` containing figures
- [ ] Verify Markdown output contains acknowledgments, appendices, and floats
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Convert PMC articles with substantial appendices

## Notes

- Appendix parsing should reuse `parseSection()` since `<app>` contains the same element types as `<sec>`
- `<floats-group>` strategy decision: render all floats at the end (simpler) vs. attempt to inline them at `<xref>` reference points (complex). Recommend rendering at end as a "Figures and Tables" section.
- Footnotes could optionally be rendered inline at their reference points, but end-of-document rendering is simpler and sufficient for readability
- Multiple `<ref-list>` elements should also be handled (currently `findChild` returns only the first)
