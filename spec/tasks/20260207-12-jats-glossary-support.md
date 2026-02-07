# Task: Support JATS `<glossary>` (Abbreviations) in Back Matter

## Purpose

PMC JATS XML articles can contain a `<glossary>` element within `<back>` that holds abbreviation definitions in a `<def-list>`. This is not currently parsed by `parseJatsBackMatter()`.

Example from PMC11293181:

```xml
<glossary>
  <title>Abbreviations</title>
  <def-list>
    <def-item>
      <term>PGY1</term>
      <def><p>a post-graduate year 1 resident</p></def>
    </def-item>
    <def-item>
      <term>PGY2</term>
      <def><p>a post-graduate year 2 resident</p></def>
    </def-item>
  </def-list>
</glossary>
```

The abbreviations section is completely missing from the Markdown output. While this is low-severity, completeness of the conversion is important for systematic review workflows.

## Related Specs

- Task 85 ([20260207-10](completed/20260207-10-jats-back-matter-notes.md)) — Back matter notes parsing
- Task 79 ([20260207-04](completed/20260207-04-jats-additional-block-elements.md)) — `parseDefList()` already exists

## Related Source Files

- `src/fulltext/convert/jats-parser.ts` — `parseJatsBackMatter()`, `parseDefList()`
- `src/fulltext/convert/jats-parser.test.ts`
- `src/fulltext/convert/types.ts` — `BackMatterResult`, `JatsDocument`
- `src/fulltext/convert/markdown-writer.ts` — `writeMarkdown()`, `renderBlock()`
- `src/fulltext/convert/markdown-writer.test.ts`
- `src/fulltext/convert/index.ts` — orchestrator

## Implementation Steps

### Step 1: Parse `<glossary>` in `parseJatsBackMatter()`

- [x] Write test: XML with `<back><glossary><title>Abbreviations</title><def-list><def-item><term>PGY1</term><def><p>a post-graduate year 1 resident</p></def></def-item></def-list></glossary></back>` should extract glossary content
- [x] Verify test fails (Red)
- [x] Add `<glossary>` handling in `parseJatsBackMatter()` — extract title and `<def-list>` as a section or note
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Glossary with def-list is extracted from back matter

### Step 2: Render glossary in Markdown output

- [ ] Write test: `writeMarkdown()` with glossary data should produce an "Abbreviations" section with definition list
- [ ] Verify test fails (Red)
- [ ] Implement rendering (reuse existing `parseDefList()` / `renderBlock()` for def-list type, or render as notes)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Abbreviations section appears in Markdown with term-definition pairs

### Step 3: E2E verification

- [ ] Verify with PMC11293181 XML that "Abbreviations" section appears with PGY1/PGY2 definitions
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, glossary renders correctly

## Notes

- `parseDefList()` already exists in jats-parser.ts and returns `{ type: 'def-list', items: [{term, definition}] }`
- Consider whether to store glossary as a new field on `JatsDocument` or reuse `notes` with a special title
- The existing `renderBlock()` in markdown-writer.ts already handles `def-list` block type
