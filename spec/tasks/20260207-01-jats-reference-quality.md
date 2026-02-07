# Task: Fix JATS Reference Parsing Quality

## Purpose

Real PMC XML testing revealed two critical reference parsing issues that make the References section unreadable:

1. **`<citation-alternatives>` not traversed** (Paper: PMC11293181): When `<ref>` contains
   `<citation-alternatives>` wrapping both `<element-citation>` and `<mixed-citation>`, the
   parser fails to find either because it only searches direct children of `<ref>`. Falls back
   to `extractAllText` on the entire `<ref>`, producing duplicated concatenated text like
   `BowyerERShawSC...Bowyer ER, Shaw SC...`.

2. **`<mixed-citation>` inline element spacing** (Paper: PMC11864032): When `<mixed-citation>`
   is found directly under `<ref>`, `extractAllText` concatenates text from `<string-name>`
   children without inserting spaces, producing `McGuireN, AcaiA` instead of `McGuire N, Acai A`.

These issues affect all 26 references in paper 1 and all 54 references in paper 2.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)
- Task 70 ([20260206-04](completed/20260206-04-jats-minor-fixes.md)) — prior reference formatting fix

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsReferences()`, `extractAllText()`
- `src/fulltext/convert/jats-parser.test.ts`

## Implementation Steps

### Step 1: Support `<citation-alternatives>` wrapper in reference parsing

- [ ] Write test: `<ref>` containing `<citation-alternatives>` with both `<element-citation>` and `<mixed-citation>` inside — should extract the `<mixed-citation>` text (preferred) or fall back to `<element-citation>`
  ```xml
  <ref id="CR1">
    <label>1.</label>
    <citation-alternatives>
      <element-citation publication-type="journal">
        <person-group person-group-type="author">
          <name><surname>Bowyer</surname><given-names>ER</given-names></name>
          <name><surname>Shaw</surname><given-names>SC</given-names></name>
        </person-group>
        <article-title>Informal near-peer teaching</article-title>
        <source>Educ Health</source>
        <year>2021</year><volume>34</volume><fpage>29</fpage>
      </element-citation>
      <mixed-citation publication-type="journal">
        Bowyer ER, Shaw SC. Informal near-peer teaching. Educ Health. 2021;34:29.
        <pub-id pub-id-type="doi">10.4103/efh.EfH_20_18</pub-id>
      </mixed-citation>
    </citation-alternatives>
  </ref>
  ```
  Expected: `Bowyer ER, Shaw SC. Informal near-peer teaching. Educ Health. 2021;34:29. 10.4103/efh.EfH_20_18` (clean mixed-citation text, no duplication)
- [ ] Write test: `src/fulltext/convert/jats-parser.test.ts`
- [ ] Verify test fails (Red)
- [ ] Update `parseJatsReferences()` to look for `<citation-alternatives>` child of `<ref>`, then search within it for `<mixed-citation>` or `<element-citation>`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: no duplicated reference text when `<citation-alternatives>` is present

### Step 2: Fix inline element spacing in `extractAllText` for `<mixed-citation>`

- [ ] Write test: `<mixed-citation>` containing `<string-name>` elements produces spaced author names
  ```xml
  <mixed-citation publication-type="journal">
    <string-name><surname>McGuire</surname><given-names>N</given-names></string-name>,
    <string-name><surname>Acai</surname><given-names>A</given-names></string-name>.
    The McMaster tool. Teach Learn Med. 2023;37(1):1-9.
  </mixed-citation>
  ```
  Expected: `McGuire N, Acai A. The McMaster tool. Teach Learn Med. 2023;37(1):1-9.`
  Not: `McGuireN, AcaiA. The McMaster tool...`
- [ ] Write test: `src/fulltext/convert/jats-parser.test.ts`
- [ ] Verify test fails (Red)
- [ ] Fix `extractAllText` to insert a space between adjacent inline element text nodes where no whitespace separator exists. Consider:
  - Adding space after text extracted from inline container elements (`<name>`, `<string-name>`, `<surname>`, `<given-names>`) if the next sibling doesn't start with whitespace or punctuation
  - Or: specifically handle `<string-name>` / `<name>` to join surname + given-names with a space
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: author names have proper spacing in references from `<mixed-citation>`

### Step 3: Handle `<pub-id>` duplication in `<mixed-citation>` extracted text

- [ ] Write test: `<mixed-citation>` containing both inline DOI text and a `<pub-id>` element should not duplicate the DOI
- [ ] Verify and fix if `extractAllText` on `<mixed-citation>` produces `...10.4103/efh.EfH_20_18. 10.4103/efh.EfH_20_18` (DOI from text node + DOI from `<pub-id>` element)
- [ ] If duplication detected, consider stripping `<pub-id>` elements from `<mixed-citation>` text extraction or deduplicating DOI/PMID values
- [ ] Acceptance: no duplicated identifiers in reference text

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/fulltext/convert/convert.e2e.test.ts`
  - Test with XML containing `<citation-alternatives>` pattern
  - Test with XML containing direct `<mixed-citation>` with `<string-name>` elements
- [ ] Verify references in Markdown output are clean, readable, and not duplicated
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Download PMC11293181 and PMC11864032 XML, convert, inspect references

## Notes

- `<citation-alternatives>` is used by BMC/Springer journals to provide both structured and pre-formatted citation variants
- `<mixed-citation>` is the preferred source as it contains human-readable pre-formatted text
- `<element-citation>` should be used as fallback when `<mixed-citation>` is absent
- The `extractAllText` spacing fix needs careful handling to avoid breaking other uses (inline content in paragraphs, titles, etc.)
