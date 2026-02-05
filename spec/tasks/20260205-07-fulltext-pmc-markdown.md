# Task: PMC XML to Markdown Conversion

## Purpose

Implement conversion of PMC JATS XML to Markdown format:
- Parse JATS XML structure
- Convert sections, tables, figures to Markdown
- Generate readable fulltext.md for text analysis and reading

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - PMC XML to Markdown section

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` (new) - JATS XML parser
- `src/fulltext/convert/markdown-writer.ts` (new) - Markdown generator
- `src/fulltext/convert/index.ts` (new) - Conversion orchestrator
- `src/cli/commands/fulltext/convert.ts` (new)

## Dependencies

- Task 59 (Fulltext Foundation)

## Implementation Steps

### Step 1: JATS XML Parser - Metadata

- [x] Write test: `src/fulltext/convert/jats-parser.test.ts`
  - Test: Extracts title from `<article-title>`
  - Test: Extracts authors from `<contrib-group>`
  - Test: Extracts DOI from `<article-id pub-id-type="doi">`
  - Test: Extracts PMCID from `<article-id pub-id-type="pmc">`
  - Test: Extracts abstract from `<abstract>`
- [x] Create stub: `src/fulltext/convert/jats-parser.ts`
- [x] Verify test fails (Red)
- [x] Implement `parseJatsMetadata(xml)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Metadata extraction works

### Step 2: JATS XML Parser - Body Sections

- [x] Write test: `src/fulltext/convert/jats-parser.test.ts` (extend)
  - Test: Extracts sections from `<body><sec>`
  - Test: Handles nested sections (h2, h3, h4)
  - Test: Extracts paragraphs `<p>`
  - Test: Handles lists `<list>` → bullet/numbered lists
  - Test: Handles inline elements (bold, italic, superscript)
- [x] Implement `parseJatsBody(xml)`
- [x] Verify test passes
- [x] Acceptance: Body structure parsed correctly

### Step 3: JATS XML Parser - Tables

- [x] Write test for table parsing
  - Test: Converts `<table-wrap>` to table structure
  - Test: Handles `<thead>`, `<tbody>`, `<tr>`, `<td>`, `<th>`
  - Test: Extracts table caption
  - Test: Handles colspan/rowspan (simplified)
- [x] Implement `parseJatsTable(tableNode)`
- [x] Verify test passes
- [x] Acceptance: Tables parsed to intermediate format

### Step 4: JATS XML Parser - Figures and Citations

- [ ] Write test for figures and citations
  - Test: Extracts `<fig>` with caption
  - Test: Converts `<xref ref-type="bibr">` to citation markers [N]
  - Test: Extracts `<ref-list>` references
- [ ] Implement figure and citation parsing
- [ ] Verify test passes
- [ ] Acceptance: Figures and citations parsed

### Step 5: Markdown Writer

- [ ] Write test: `src/fulltext/convert/markdown-writer.test.ts`
  - Test: Generates Markdown header with metadata
  - Test: Converts sections to ## headings
  - Test: Converts nested sections to ### headings
  - Test: Converts paragraphs with proper spacing
  - Test: Converts tables to Markdown tables
  - Test: Converts figures to `![Figure N](caption)`
  - Test: Converts lists (ordered and unordered)
  - Test: Preserves inline formatting (bold, italic)
- [ ] Create stub: `src/fulltext/convert/markdown-writer.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `writeMarkdown(parsedDoc)`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Markdown output is readable and correct

### Step 6: Conversion Orchestrator

- [ ] Write test: `src/fulltext/convert/index.test.ts`
  - Test: `convertPmcXmlToMarkdown(xmlPath, mdPath)` end-to-end
  - Test: Handles malformed XML gracefully
  - Test: Updates meta.json with conversion info
- [ ] Create stub: `src/fulltext/convert/index.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `convertPmcXmlToMarkdown()`
- [ ] Verify test passes (Green)
- [ ] Acceptance: Full conversion pipeline works

### Step 7: Fulltext Convert Command

- [ ] Write test: `src/cli/commands/fulltext/convert.test.ts`
  - Test: Converts all XML files in session
  - Test: --article filters to specific article
  - Test: Skips already-converted files
  - Test: Shows progress and summary
- [ ] Create stub: `src/cli/commands/fulltext/convert.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `executeFulltextConvert()`
- [ ] Verify test passes (Green)
- [ ] Register command in CLI
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Convert command works

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/fulltext/convert/convert.e2e.test.ts`
  - Test: Convert real PMC XML file
  - Test: Verify Markdown output structure
  - Test: Verify metadata preserved
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - Download PMC XML manually
  - Run `fulltext convert`
  - Review generated Markdown
- [ ] Acceptance: Conversion produces readable Markdown

## JATS XML Structure Reference

```xml
<article>
  <front>
    <article-meta>
      <article-id pub-id-type="doi">10.1234/example</article-id>
      <article-id pub-id-type="pmc">1234567</article-id>
      <title-group>
        <article-title>Article Title</article-title>
      </title-group>
      <contrib-group>
        <contrib contrib-type="author">
          <name><surname>Smith</surname><given-names>John</given-names></name>
        </contrib>
      </contrib-group>
      <abstract><p>Abstract text...</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Introduction</title>
      <p>Paragraph with <xref ref-type="bibr" rid="ref1">[1]</xref>...</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="ref1">
        <mixed-citation>Reference text...</mixed-citation>
      </ref>
    </ref-list>
  </back>
</article>
```

## Markdown Output Format

```markdown
# Article Title

**Authors**: Smith J, Jones A
**DOI**: 10.1234/example
**PMC**: PMC1234567

## Abstract

Abstract text...

## Introduction

Paragraph with [1]...

## References

1. Reference text...
```

## Notes

- Use `fast-xml-parser` (already in project) for XML parsing
- Handle missing sections gracefully (some articles have non-standard structure)
- Preserve citation markers for future linking
- Tables with complex colspan/rowspan may be simplified
