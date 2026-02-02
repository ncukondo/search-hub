# Task: Flatten Inline XML Elements in PubMed Article Titles

## Purpose

PubMed XML responses contain inline markup elements (e.g., `<i>`, `<b>`, `<sub>`, `<sup>`) within
`<ArticleTitle>` and `<AbstractText>` fields. The current XMLParser configuration preserves these
as nested objects, resulting in titles stored as dictionaries instead of plain strings:

```json
{"i": "Pseudomonas aeruginosa", "#text": "Predictors of Mortality inBloodstream Infections..."}
```

instead of the expected:

```
"Pseudomonas aeruginosa Predictors of Mortality in Bloodstream Infections..."
```

### Evidence

In a search of 100 PubMed results, 9 articles (9%) had malformed titles. The `<i>` tag (used for
species names) was the most common cause. Additionally, 48 of 100 abstracts contained unescaped
HTML entities (e.g., `&#x200a;`, `&#x2264;`, `&#x202f;`).

### Impact

- Exported JSON contains non-string title values, breaking downstream consumers
- Abstracts contain raw HTML entities instead of decoded Unicode characters
- Reference manager integration may fail or produce garbled output

## Related Specs

- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed provider specification

## Related Source Files

- `src/providers/pubmed/parser.ts` - XMLParser configuration (lines 21-41), title extraction (line 292)
- `src/providers/pubmed/parser.test.ts` - Parser unit tests

## Implementation Steps

### Step 1: Add failing tests for inline XML in titles

- [x] Write test: `src/providers/pubmed/parser.test.ts`
  - Test: `<ArticleTitle>Effect of <i>Pseudomonas aeruginosa</i> on mortality</ArticleTitle>`
    should parse to `"Effect of Pseudomonas aeruginosa on mortality"`
  - Test: `<ArticleTitle><sub>β</sub>-lactam resistance</ArticleTitle>`
    should parse to `"β-lactam resistance"`
  - Test: titles without inline XML should remain unchanged
- [x] Verify test fails (Red)
- [x] Acceptance: Tests demonstrate the nested object bug

### Step 2: Implement title flattening

- [x] Modify `src/providers/pubmed/parser.ts`
  - Added `stopNodes: ['*.ArticleTitle', '*.AbstractText']` to parser config to preserve raw XML
  - Added `stripXmlTags()` utility to strip inline markup from preserved raw strings
  - Applied `stripXmlTags()` when extracting `ArticleTitle`
  - Handles all inline elements generically via regex tag stripping
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Acceptance: All title values are plain strings

### Step 3: Add failing tests for HTML entities in abstracts

- [x] Write test: `src/providers/pubmed/parser.test.ts`
  - Test: abstract containing `&#x2264;` should decode to `≤`
  - Test: abstract containing `&#x200a;` should decode to the hair space character
  - Test: abstract containing `&amp;` should decode to `&`
  - Test: title containing `&#x2082;` and `&amp;` should decode correctly
- [x] Verify test fails (Red)
- [x] Acceptance: Tests demonstrate unescaped entities

### Step 4: Implement HTML entity decoding in abstracts

- [x] Modify `src/providers/pubmed/parser.ts`
  - XMLParser `processEntities`/`htmlEntities` options don't work with `stopNodes` — confirmed
  - Added `cleanXmlText()` function that combines tag stripping and entity decoding (hex, decimal, named XML entities)
  - Applied to both `ArticleTitle` and `AbstractText` (in `parseAbstract()`)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All HTML entities are decoded to Unicode characters

### Step 5: Apply flattening to abstract text as well

- [x] Write test: abstract text containing `<i>` tags should be flattened to plain string
- [x] Write test: structured abstract with inline XML and entities should be cleaned
- [x] Apply the same flattening utility from Step 2 to `parseAbstract()` output (done in Step 4)
- [x] Verify test passes
- [x] Acceptance: Abstract text is always a plain string with decoded entities

### Final Step: E2E Integration Tests

- [x] Write comprehensive fixture test in `src/providers/pubmed/parser.test.ts`
  - Tests realistic PubMed XML with 3 articles: italic species names, sub/sup in titles, structured abstracts with entities
  - Verifies all titles are plain strings (no objects)
  - Verifies all abstracts contain no raw HTML entities
  - Verifies plain articles remain unchanged
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test` — 1092 tests pass (11 new)
- [x] Acceptance: All tests pass

## Notes

- The flattening function should be robust against deeply nested elements (e.g., `<i><sub>x</sub></i>`)
- Consider whether to strip or preserve formatting intent (e.g., italics markers) — for now, strip all markup
- This fix also benefits ERIC and arXiv if their parsers use similar XML handling
