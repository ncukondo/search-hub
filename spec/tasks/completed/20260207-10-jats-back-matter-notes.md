# Task: Extract JATS Back Matter Notes Sections

## Purpose

PMC JATS XML articles commonly contain important metadata in `<back>` → `<notes>` elements that are not currently extracted by `parseJatsBackMatter()`. These include:

- **Author contributions** — who did what in the study
- **Funding** — grant/funding information
- **Data availability** — data access statements
- **Declarations** — a wrapper `<notes>` containing sub-sections:
  - Ethics approval and consent to participate
  - Consent for publication
  - Competing interests
- **Abbreviations** — key term definitions

These sections are present in the XML (confirmed with PMC11293181) but completely missing from the Markdown output. For systematic literature review use cases, funding and conflict-of-interest information can be particularly relevant.

Additionally, the existing footnote parsing produces concatenated text (e.g., "Publisher's NoteSpringer Nature remains neutral..." — missing space between title and body).

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md)
- Task 81 ([20260207-06](completed/20260207-06-jats-back-matter-floats.md)) — Back matter and floats parsing

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsBackMatter()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `BackMatterResult`, `JatsDocument`
- `src/fulltext/convert/markdown-writer.ts` — `writeMarkdown()`
- `src/fulltext/convert/markdown-writer.test.ts`
- `src/fulltext/convert/index.ts` — orchestrator

## Implementation Steps

### Step 1: Parse `<notes>` sections from `<back>`

- [ ] Write test: XML with `<back><notes notes-type="author-contribution"><title>Author contributions</title><p>TK designed...</p></notes></back>` should extract author contributions
- [ ] Write test: XML with `<back><notes notes-type="data-availability"><title>Data availability</title><p>Available on request.</p></notes></back>` should extract data availability
- [ ] Verify tests fail (Red)
- [ ] Add `notes` parsing to `parseJatsBackMatter()`: iterate `<notes>` children of `<back>`, extract title and paragraph text
- [ ] Add `notes?: { title: string; text: string }[]` to `BackMatterResult`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Notes sections are extracted as structured data

### Step 2: Parse nested `<notes>` (Declarations wrapper)

- [ ] Write test: `<notes>` containing child `<sec>` elements (e.g., Ethics approval, Competing interests) should extract each as a sub-section
- [ ] Verify test fails (Red)
- [ ] Implement: detect `<sec>` children within `<notes>` and parse them as sub-sections
- [ ] Verify test passes (Green)
- [ ] Acceptance: Declarations and sub-sections are properly extracted

### Step 3: Parse `<fn-group>` within `<notes>` and fix footnote spacing

- [ ] Write test: `<fn>` with `<title>` and `<p>` should have space between title and body text
- [ ] Verify test fails (Red)
- [ ] Fix `fn-group` parsing to properly separate title from paragraph content
- [ ] Verify test passes (Green)
- [ ] Acceptance: "Publisher's Note Springer Nature..." (with space)

### Step 4: Render notes sections in Markdown output

- [ ] Write test: `writeMarkdown()` should include notes sections between Acknowledgments and References
- [ ] Verify test fails (Red)
- [ ] Add rendering logic in `writeMarkdown()`: each note becomes a `## Title` section with paragraph content
- [ ] Update `JatsDocument` type to include notes field
- [ ] Update `convertPmcXmlToMarkdown()` orchestrator to pass notes to document
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Notes sections appear in Markdown output in correct position

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test with real PMC XML (PMC11293181) verifying:
  - Author contributions section present
  - Funding section present
  - Data availability section present
  - Declarations sub-sections present
  - Abbreviations section present
  - Footnote text properly spaced
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Download PMC XML and confirm back matter sections appear in Markdown
- [ ] Acceptance: All tests pass, back matter sections render correctly

## TDD Cycle Reference

```
┌─────────────────────────────────────────────────────┐
│  1. Write Test (Red)                                │
│     - Write test that describes expected behavior   │
│     - Run test → should FAIL                        │
├─────────────────────────────────────────────────────┤
│  2. Implement (Green)                               │
│     - Write minimal code to pass test               │
│     - Run test → should PASS                        │
├─────────────────────────────────────────────────────┤
│  3. Refactor                                        │
│     - npm run lint                                  │
│     - npm run typecheck                             │
│     - Clean up code if needed                       │
│     - Run test → should still PASS                  │
└─────────────────────────────────────────────────────┘
```

## Notes

- The `<notes>` element can appear in different forms: direct `<p>` children, nested `<sec>`, or `<fn-group>` — implementation should handle all variants
- Common `notes-type` attribute values: `author-contribution`, `data-availability`, `COI-statement`, `supplementary-material`, `supported-by`
- Some articles use `<funding-group>` as a separate element rather than `<notes>` for funding info — this could be a follow-up enhancement
- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
