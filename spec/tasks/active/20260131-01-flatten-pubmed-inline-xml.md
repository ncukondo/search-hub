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

- [ ] Write test: `src/providers/pubmed/parser.test.ts`
  - Test: `<ArticleTitle>Effect of <i>Pseudomonas aeruginosa</i> on mortality</ArticleTitle>`
    should parse to `"Effect of Pseudomonas aeruginosa on mortality"`
  - Test: `<ArticleTitle><sub>β</sub>-lactam resistance</ArticleTitle>`
    should parse to `"β-lactam resistance"`
  - Test: titles without inline XML should remain unchanged
- [ ] Verify test fails (Red)
- [ ] Acceptance: Tests demonstrate the nested object bug

### Step 2: Implement title flattening

- [ ] Modify `src/providers/pubmed/parser.ts`
  - Add a utility function to recursively flatten parsed XML nodes into a plain string
  - Apply flattening when extracting `ArticleTitle` (line 292)
  - Handle common inline elements: `<i>`, `<b>`, `<sub>`, `<sup>`, `<u>`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: All title values are plain strings

### Step 3: Add failing tests for HTML entities in abstracts

- [ ] Write test: `src/providers/pubmed/parser.test.ts`
  - Test: abstract containing `&#x2264;` should decode to `≤`
  - Test: abstract containing `&#x200a;` should decode to the hair space character (or a regular space)
  - Test: abstract containing `&amp;` should decode to `&`
- [ ] Verify test fails (Red)
- [ ] Acceptance: Tests demonstrate unescaped entities

### Step 4: Implement HTML entity decoding in abstracts

- [ ] Modify `src/providers/pubmed/parser.ts`
  - Investigate XMLParser options (`processEntities`, `htmlEntities`) for native entity handling
  - If parser options are insufficient, add a post-processing step to decode HTML entities
  - Apply to both `ArticleTitle` and `AbstractText`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All HTML entities are decoded to Unicode characters

### Step 5: Apply flattening to abstract text as well

- [ ] Write test: abstract text containing `<i>` tags should be flattened to plain string
- [ ] Apply the same flattening utility from Step 2 to `parseAbstract()` output
- [ ] Verify test passes
- [ ] Acceptance: Abstract text is always a plain string with decoded entities

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/providers/pubmed/parser.e2e.test.ts`
  - Use a real PubMed XML response fixture containing inline elements and entities
  - Verify all titles are plain strings (no objects)
  - Verify all abstracts contain no raw HTML entities
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run a search and verify exported JSON has clean string titles
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- The flattening function should be robust against deeply nested elements (e.g., `<i><sub>x</sub></i>`)
- Consider whether to strip or preserve formatting intent (e.g., italics markers) — for now, strip all markup
- This fix also benefits ERIC and arXiv if their parsers use similar XML handling
