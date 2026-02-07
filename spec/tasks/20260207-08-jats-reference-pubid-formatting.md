# Task: JATS Reference Pub-ID Formatting

## Purpose

Currently, `JatsReference` only contains plain `text` with identifiers (DOI, PMID, PMCID) embedded as unstructured text. This means:
- DOIs in references are not rendered as clickable links in Markdown output
- PMIDs and PMCIDs in references have no structured representation
- No way to programmatically access reference identifiers

This task extracts structured pub-id information from `<pub-id>` elements inside references and formats them as clickable links in the Markdown output (e.g., `[doi:10.1234/x](https://doi.org/10.1234/x)`).

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - PMC fulltext conversion

## Related Source Files

- `src/fulltext/convert/types.ts` - JatsReference type
- `src/fulltext/convert/jats-parser.ts` - Reference parsing (parseJatsReferences, extractMixedCitationText, formatElementCitation)
- `src/fulltext/convert/jats-parser.test.ts` - Test suite
- `src/fulltext/convert/markdown-writer.ts` - renderReferences function

## Implementation Steps

### Step 1: Add pub-id fields to JatsReference type

- [ ] Write test: `src/fulltext/convert/jats-parser.test.ts`
  - Test that `parseJatsReferences` returns `doi`, `pmid`, `pmcid` fields from `<pub-id>` elements inside `<mixed-citation>`
- [ ] Update `JatsReference` in `src/fulltext/convert/types.ts` to add optional `doi`, `pmid`, `pmcid` fields
- [ ] Verify test fails (Red)
- [ ] Implement pub-id extraction in `parseJatsReferences` for mixed-citation path
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: `JatsReference` includes structured pub-id fields extracted from `<mixed-citation>` references

### Step 2: Extract pub-ids from element-citation

- [ ] Write test: `src/fulltext/convert/jats-parser.test.ts`
  - Test that `parseJatsReferences` returns `doi`, `pmid` fields from `<pub-id>` elements inside `<element-citation>`
- [ ] Verify test fails (Red)
- [ ] Implement pub-id extraction in `formatElementCitation` path (or alongside it)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: Pub-ids extracted from both mixed-citation and element-citation references

### Step 3: Format pub-ids as clickable links in Markdown references

- [ ] Write test: `src/fulltext/convert/markdown-writer.ts` test
  - Test that references with DOI render as `[doi:10.1234/x](https://doi.org/10.1234/x)`
  - Test that references with PMID render as `[pmid:12345](https://pubmed.ncbi.nlm.nih.gov/12345/)`
  - Test that references with PMCID render as `[pmcid:PMC12345](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12345/)`
  - Test that references without pub-ids render as before (plain text)
- [ ] Verify test fails (Red)
- [ ] Implement link formatting in `renderReferences`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: References with pub-ids show clickable links in Markdown

### Step 4: Remove pub-id text from reference text to avoid duplication

- [ ] Write test: `src/fulltext/convert/jats-parser.test.ts`
  - Test that when pub-ids are extracted structurally, the raw DOI string is stripped from `text` to avoid showing "10.1234/x" both inline and as a link
- [ ] Verify test fails (Red)
- [ ] Implement: strip pub-id values from `text` field when they are extracted structurally
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: No duplicated identifiers in rendered output

### Final Step: Integration Test

- [ ] Run full test suite: `npm run test:all`
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All tests pass, pub-ids render as clickable links in reference sections

## Notes

- Pub-id types: `doi`, `pmid`, `pmc`/`pmcid`
- DOI link format: `https://doi.org/{doi}`
- PMID link format: `https://pubmed.ncbi.nlm.nih.gov/{pmid}/`
- PMC link format: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{pmcid}/`
- Keep backward compatibility: existing tests should still pass
