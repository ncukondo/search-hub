# Task: Fix JATS PMCID Extraction for `pub-id-type="pmcid"`

## Purpose

`parseJatsMetadata()` fails to extract the PMC ID from real PMC efetch XML. The parser
checks for `pub-id-type="pmc"` but the actual efetch XML uses `pub-id-type="pmcid"` with
the value `PMC11293181`. This was confirmed on two separate papers (PMC11293181, PMC11864032).

Task 70 (JATS Minor Fixes) addressed the `<pmc-articleset>` wrapper navigation but did not
fix the attribute value mismatch.

As a result, the Markdown output is missing the `**PMC**: PMCxxxxxxxx` metadata line.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)
- Task 70 ([20260206-04](completed/20260206-04-jats-minor-fixes.md)) — prior PMCID fix

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsMetadata()`, line ~202
- `src/fulltext/convert/jats-parser.test.ts`

## Implementation Steps

### Step 1: Support `pub-id-type="pmcid"` in metadata extraction

- [x] Write test: XML with `<article-id pub-id-type="pmcid">PMC11293181</article-id>` should extract pmcid `"PMC11293181"` (note: already has `PMC` prefix, so `writeMarkdown` should not double-prefix)
- [x] Write test: XML with `<article-id pub-id-type="pmc">11293181</article-id>` should still work (existing behavior)
- [x] Verify test fails (Red) for the `pmcid` variant
- [x] Update `parseJatsMetadata()`:
  - Add `idType === 'pmcid'` to the condition alongside `idType === 'pmc'`
  - Handle the `PMC` prefix: if the value already starts with `PMC`, strip it before storing (since `writeMarkdown` prepends `PMC`)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: PMCID appears correctly in Markdown metadata for both `pub-id-type` variants

### Final Step: E2E Integration Tests

- [x] Verify with real efetch XML from PMC11293181 and PMC11864032
- [x] Run full test suite: `npm test`

## Notes

- Small, focused fix. The change is approximately 2-3 lines in `parseJatsMetadata()`.
- Must handle the `PMC` prefix consistently: `pub-id-type="pmc"` stores bare number, `pub-id-type="pmcid"` stores `PMCxxxxxxxx`.
- `writeMarkdown()` currently outputs `PMC${doc.metadata.pmcid}`, so bare numbers are correct for the existing `pmc` type. Need to strip `PMC` prefix from `pmcid` values to avoid `PMCPMC11293181`.
