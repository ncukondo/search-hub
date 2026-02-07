# Task: JATS Minor Fixes (HTML Entities, Reference Formatting, PMCID)

GitHub Issue: #65 (Medium/Low severity items)

## Purpose

After the core `preserveOrder` refactor, several secondary issues remain:

1. **HTML numeric character references not decoded** (Low): Entities like `&#8217;` remain
   as literal text in the output instead of being decoded to `'`.

2. **References lack spacing between structured elements** (Medium): `<element-citation>`
   child elements (author, title, journal, etc.) are concatenated without spaces, and
   `<label>` numbers are duplicated with list numbering.

3. **PMCID not extracted from efetch XML** (Low): When XML is fetched via efetch, the
   `<article>` is wrapped in `<pmc-articleset>`. The parser navigates `parsed.article`
   but efetch wraps it as `parsed['pmc-articleset'].article`.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsReferences()`, `parseJatsMetadata()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/markdown-writer.ts` — entity decoding in output

## Implementation Steps

### Step 1: Decode HTML Numeric Character References

- [x] Write test: input containing `&#8217;` `&#8216;` `&#8212;` `&#8211;` produces decoded characters `'` `'` `—` `–`
- [x] Determine where to apply decoding:
  - Option A: Configure `fast-xml-parser` to decode entities (check `htmlEntities`/`processEntities` options)
  - Option B: Post-process text nodes in `extractAllText` or at Markdown writer output
- [x] Implement entity decoding
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: no `&#NNNN;` sequences in Markdown output

### Step 2: Improve Reference Formatting

- [x] Write test: `<element-citation>` with structured children produces spaced output
  ```xml
  <ref id="CR1">
    <label>1</label>
    <element-citation publication-type="journal-article">
      <person-group><name><surname>Bowyer</surname><given-names>ER</given-names></name></person-group>
      <article-title>Informal near-peer teaching</article-title>
      <source>Educ Health</source>
      <year>2021</year>
      <volume>34</volume>
      <fpage>29</fpage>
    </element-citation>
  </ref>
  ```
  Expected: `Bowyer ER. Informal near-peer teaching. Educ Health. 2021;34:29.` (or similar structured format)
- [x] Improve `parseJatsReferences()` to handle `<element-citation>` with structured formatting
  - Add spaces between author names, title, source, year, volume, pages
  - Avoid duplicating label numbers (skip `<label>` text if using list numbering)
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: references are human-readable with proper spacing

### Step 3: Handle efetch `<pmc-articleset>` Wrapper for PMCID

- [x] Write test: XML wrapped in `<pmc-articleset><article>...</article></pmc-articleset>` extracts PMCID correctly
- [x] Update parser entry points (`parseJatsMetadata`, `parseJatsBody`, `parseJatsReferences`) to check for `pmc-articleset` wrapper
  - Try `parsed.article` first (direct article XML)
  - Fall back to `parsed['pmc-articleset'].article` (efetch wrapper)
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: PMCID extracted correctly from both direct and efetch-wrapped XML

### Final Step: E2E Integration Tests

- [ ] Write E2E test with real efetch XML (includes `<pmc-articleset>` wrapper)
- [ ] Verify Markdown output has decoded entities
- [ ] Verify reference list is properly formatted
- [ ] Verify PMCID appears in metadata
- [ ] Run full test suite: `npm test`

## Notes

- Depends on Task 68 (20260206-02: `preserveOrder` refactor) being completed first.
- Reference formatting (Step 2) could be enhanced further in the future with full
  CSL-style formatting, but a basic readable output with spaces is sufficient for now.
