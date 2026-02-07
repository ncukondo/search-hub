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

- [x] Add `pmid?: string` to `JatsMetadata` interface
- [x] Write test: XML with `<article-id pub-id-type="pmid">12345678</article-id>` extracts pmid
- [x] Verify test fails (Red)
- [x] Add `idType === 'pmid'` case in `parseJatsMetadata()` article-id loop
- [x] Add `writeMarkdown()` rendering: `**PMID**: 12345678` line after PMC line
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: PMID appears in Markdown metadata block

### Step 2: Add journal name extraction

- [x] Add `journal?: string` to `JatsMetadata` interface
- [x] Write test: XML with `<journal-meta><journal-title-group><journal-title>BMJ Open</journal-title></journal-title-group></journal-meta>` extracts journal name
- [x] Write test: fallback to `<journal-title>` directly under `<journal-meta>` (older format)
- [x] Verify test fails (Red)
- [x] Update `parseJatsMetadata()` to navigate `<front>/<journal-meta>/<journal-title-group>/<journal-title>` or `<front>/<journal-meta>/<journal-title>`
- [x] Add `writeMarkdown()` rendering: `**Journal**: BMJ Open`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: journal name appears in metadata

### Step 3: Add publication date extraction

- [x] Add `publicationDate?: { year: string; month?: string; day?: string }` to `JatsMetadata`
- [x] Write test: XML with `<pub-date pub-type="epub"><year>2024</year><month>03</month><day>15</day></pub-date>`
- [x] Write test: XML with multiple `<pub-date>` elements — prefer `epub` over `ppub` over `collection`
- [x] Write test: JATS 1.2+ `date-type` attribute variant
- [x] Verify test fails (Red)
- [x] Add pub-date extraction with priority logic for date type selection
- [x] Add `writeMarkdown()` rendering: `**Published**: 2024-03-15` or `**Published**: 2024-03`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: publication date appears in metadata

### Step 4: Add volume/issue/pages extraction

- [x] Add `volume?: string`, `issue?: string`, `pages?: string` to `JatsMetadata`
- [x] Write test: XML with `<volume>10</volume><issue>2</issue><fpage>100</fpage><lpage>110</lpage>`
- [x] Write test: `<elocation-id>` as alternative to fpage/lpage
- [x] Verify test fails (Red)
- [x] Extract from `<article-meta>` children
- [x] Add `writeMarkdown()` rendering: `**Citation**: Vol. 10(2), pp. 100-110` or similar compact format
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: volume/issue/pages appear in metadata

### Step 5: Add keywords extraction

- [x] Add `keywords?: string[]` to `JatsMetadata`
- [x] Write test: XML with `<kwd-group><kwd>systematic review</kwd><kwd>meta-analysis</kwd></kwd-group>`
- [x] Write test: multiple `<kwd-group>` elements (different types) — merge all keywords
- [x] Verify test fails (Red)
- [x] Extract keywords from all `<kwd-group>` elements in `<article-meta>`
- [x] Add `writeMarkdown()` rendering: `**Keywords**: systematic review, meta-analysis`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: keywords appear in metadata

### Step 6: Add article type and license extraction

- [x] Add `articleType?: string` and `license?: string` to `JatsMetadata`
- [x] Write test: `<article article-type="research-article">` extracts article type
- [x] Write test: `<permissions><license><license-p>This is an open access article...</license-p></license></permissions>` extracts license text
- [x] Verify test fails (Red)
- [x] Extract `article-type` from root `<article>` attributes
- [x] Extract license from `<permissions>/<license>` — use `<license-p>` text or `@xlink:href` attribute
- [x] Add `writeMarkdown()` rendering for both fields
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: article type and license info appear in metadata

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
