# Task: Extract Extended JATS Metadata

## Purpose

`parseJatsMetadata()` currently extracts only `title`, `authors`, `doi`, `pmcid`, and `abstract`. Several commonly available metadata fields are not extracted, limiting the usefulness of the converted Markdown for bibliographic purposes and reducing interoperability with other tools (e.g., reference managers, citation analysis).

The most impactful omissions:

1. **PMID** (`pub-id-type="pmid"`): Present in virtually all PMC articles. Essential for cross-referencing with PubMed search results.

2. **Journal name**: From `<journal-meta>/<journal-title>` or `<journal-meta>/<journal-title-group>/<journal-title>`. Important for citation context.

3. **Publication date**: From `<pub-date>`. Multiple date types exist (`epub`, `ppub`, `collection`).

4. **Volume / Issue / Pages**: From `<volume>`, `<issue>`, `<fpage>`, `<lpage>`, `<elocation-id>`.

5. **Keywords**: From `<kwd-group>/<kwd>`. Useful for understanding article scope.

6. **License/Copyright**: From `<permissions>`. Important for understanding reuse rights.

7. **Article type**: From `<article>` root element `article-type` attribute. Useful for categorization.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)
- Task 77 ([20260207-02](completed/20260207-02-jats-pmcid-extraction.md)) — PMCID extraction fix

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsMetadata()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `JatsMetadata`
- `src/fulltext/convert/markdown-writer.ts` — `writeMarkdown()`
- `src/fulltext/convert/markdown-writer.test.ts`

## Implementation Steps

### Step 1: Add PMID extraction

- [ ] Add `pmid?: string` to `JatsMetadata` interface
- [ ] Write test: XML with `<article-id pub-id-type="pmid">12345678</article-id>` extracts pmid
- [ ] Verify test fails (Red)
- [ ] Add `idType === 'pmid'` case in `parseJatsMetadata()` article-id loop
- [ ] Add `writeMarkdown()` rendering: `**PMID**: 12345678` line after PMC line
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: PMID appears in Markdown metadata block

### Step 2: Add journal name extraction

- [ ] Add `journal?: string` to `JatsMetadata` interface
- [ ] Write test: XML with `<journal-meta><journal-title-group><journal-title>BMJ Open</journal-title></journal-title-group></journal-meta>` extracts journal name
- [ ] Write test: fallback to `<journal-title>` directly under `<journal-meta>` (older format)
- [ ] Verify test fails (Red)
- [ ] Update `parseJatsMetadata()` to navigate `<front>/<journal-meta>/<journal-title-group>/<journal-title>` or `<front>/<journal-meta>/<journal-title>`
- [ ] Add `writeMarkdown()` rendering: `**Journal**: BMJ Open`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: journal name appears in metadata

### Step 3: Add publication date extraction

- [ ] Add `publicationDate?: { year: string; month?: string; day?: string }` to `JatsMetadata`
- [ ] Write test: XML with `<pub-date pub-type="epub"><year>2024</year><month>03</month><day>15</day></pub-date>`
- [ ] Write test: XML with multiple `<pub-date>` elements — prefer `epub` over `ppub` over `collection`
- [ ] Write test: JATS 1.2+ `date-type` attribute variant
- [ ] Verify test fails (Red)
- [ ] Add pub-date extraction with priority logic for date type selection
- [ ] Add `writeMarkdown()` rendering: `**Published**: 2024-03-15` or `**Published**: 2024-03`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: publication date appears in metadata

### Step 4: Add volume/issue/pages extraction

- [ ] Add `volume?: string`, `issue?: string`, `pages?: string` to `JatsMetadata`
- [ ] Write test: XML with `<volume>10</volume><issue>2</issue><fpage>100</fpage><lpage>110</lpage>`
- [ ] Write test: `<elocation-id>` as alternative to fpage/lpage
- [ ] Verify test fails (Red)
- [ ] Extract from `<article-meta>` children
- [ ] Add `writeMarkdown()` rendering: `**Citation**: Vol. 10(2), pp. 100-110` or similar compact format
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: volume/issue/pages appear in metadata

### Step 5: Add keywords extraction

- [ ] Add `keywords?: string[]` to `JatsMetadata`
- [ ] Write test: XML with `<kwd-group><kwd>systematic review</kwd><kwd>meta-analysis</kwd></kwd-group>`
- [ ] Write test: multiple `<kwd-group>` elements (different types) — merge all keywords
- [ ] Verify test fails (Red)
- [ ] Extract keywords from all `<kwd-group>` elements in `<article-meta>`
- [ ] Add `writeMarkdown()` rendering: `**Keywords**: systematic review, meta-analysis`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: keywords appear in metadata

### Step 6: Add article type and license extraction

- [ ] Add `articleType?: string` and `license?: string` to `JatsMetadata`
- [ ] Write test: `<article article-type="research-article">` extracts article type
- [ ] Write test: `<permissions><license><license-p>This is an open access article...</license-p></license></permissions>` extracts license text
- [ ] Verify test fails (Red)
- [ ] Extract `article-type` from root `<article>` attributes
- [ ] Extract license from `<permissions>/<license>` — use `<license-p>` text or `@xlink:href` attribute
- [ ] Add `writeMarkdown()` rendering for both fields
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: article type and license info appear in metadata

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/fulltext/convert/convert.e2e.test.ts`
  - Test full conversion with comprehensive metadata
  - Verify all new metadata fields appear in Markdown output
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Convert PMC11293181 and PMC11864032, verify metadata completeness

## Notes

- All new fields are optional to maintain backward compatibility with sparse XML inputs
- Publication date priority: `epub` (electronic) > `ppub` (print) > `collection` > any other
- The `<pub-date>` attribute changed from `pub-type` (NLM/early JATS) to `date-type` (JATS 1.2+); both must be supported
- Keywords may include MeSH terms (`kwd-group-type="MeSH"`) vs. author keywords (`kwd-group-type="author"`) — consider preserving the group type
- License extraction should prefer `@xlink:href` (standardized URL like CC-BY link) over `<license-p>` (free-text)
- These metadata fields are also useful for enriching `meta.json` in the fulltext management system
