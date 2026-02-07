# Task: Fix JATS Nested `<notes>` in Declarations

## Purpose

`parseJatsBackMatter()` correctly handles `<notes>` containing `<sec>` children (e.g. Declarations wrapper with `<sec>` sub-sections). However, some PMC articles (confirmed with PMC11293181 / PMID 39090703) use **nested `<notes>` elements** instead of `<sec>` inside the Declarations wrapper:

```xml
<notes>
  <title>Declarations</title>
  <notes id="FPar1"><title>Ethics approval and consent to participate</title>
    <p>This study was conducted in accordance with...</p>
  </notes>
  <notes id="FPar2"><title>Consent for publication</title>
    <p>All participants agreed to...</p>
  </notes>
  <notes id="FPar3" notes-type="COI-statement"><title>Competing interests</title>
    <p>The authors declare no competing interests.</p>
  </notes>
</notes>
```

The current code only checks for `<sec>` children, missing the nested `<notes>` pattern entirely. This results in the "Declarations" heading appearing in the Markdown with no content underneath.

For systematic reviews, ethics approval and competing interests information can be relevant.

## Related Specs

- Task 85 ([20260207-10](completed/20260207-10-jats-back-matter-notes.md)) — Back matter notes parsing

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsBackMatter()` lines 1131–1243
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `BackMatterNote`
- `src/fulltext/convert/markdown-writer.ts` — `writeMarkdown()` renders notes
- `src/fulltext/convert/markdown-writer.test.ts`

## Implementation Steps

### Step 1: Add nested `<notes>` handling in `parseJatsBackMatter()`

- [ ] Write test: XML with `<back><notes><title>Declarations</title><notes><title>Ethics approval</title><p>Approved by committee.</p></notes><notes><title>Competing interests</title><p>None.</p></notes></notes></back>` should extract two `BackMatterNote` items with correct titles and text
- [ ] Verify test fails (Red)
- [ ] Extend the `<notes>` processing loop to also check for nested `<notes>` children (in addition to existing `<sec>` check)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: Nested `<notes>` elements within wrapper notes are extracted as individual `BackMatterNote` items

### Step 2: Verify with real PMC XML

- [ ] Write E2E test or manual verification using PMC11293181 XML
- [ ] Confirm "Ethics approval and consent to participate", "Consent for publication", and "Competing interests" appear under "Declarations" in Markdown output
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, Declarations sub-sections render correctly

## Notes

- The fix should be additive — existing `<sec>` handling must continue to work
- The change is small: add a `findChildren(note.children, 'notes')` check alongside the existing `findChildren(note.children, 'sec')` check
