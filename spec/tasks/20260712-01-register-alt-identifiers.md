# Task: Register Articles with Alternative Identifiers (arXiv/ERIC/Scopus) — Issue #151

## Purpose

`search-hub register` currently registers only articles that have a DOI or PMID.
Articles that only have an arXiv ID, ERIC ID, or Scopus ID are skipped with
"skipped (no DOI or PMID)" even when their review decision is `include`
(GitHub issue #151).

Investigation showed most of the pipeline is already identifier-agnostic:

- **Citation key (CSL id)**: `generateCslId()` uses `{first-author-family}-{year}`,
  no DOI/PMID dependency. reference-manager also regenerates its own key from
  author/year/title. → No work needed.
- **Duplicate detection**: reference-manager's `detectDuplicate` priority is
  DOI → PMID → ISBN → arXiv (`custom.arxiv_id`, version-stripped) →
  Title+Author+Year fallback. arXiv matching already works if we emit
  `custom.arxiv_id`. ERIC/Scopus-only articles fall back to Title+Author+Year.
  (Exact ERIC/Scopus matching is tracked in ncukondo/reference-manager#98 —
  out of scope here.)
- **Actual gap**: search-hub drops arxivId/scopusId/ericId during CSL-JSON
  conversion, and two gate functions block registration:
  - `hasIdentifier()` in `src/integration/register.ts` (DOI/PMID only)
  - `getRegistrationId()` in `src/cli/commands/register.ts` (dry-run display)

## Goal

Articles with any of DOI / PMID / arXiv ID / ERIC ID / Scopus ID are registered.
Only articles with none of these identifiers are skipped, and messages say so
accurately.

## Related Specs

- [spec/integration/reference-manager.md](../integration/reference-manager.md)
- GitHub issue: ncukondo/search-hub#151, related: ncukondo/reference-manager#98

## Related Source Files

- `src/integration/csl-json.ts` / `src/integration/csl-json.test.ts`
- `src/integration/register.ts` / `src/integration/register.test.ts`
- `src/cli/commands/register.ts` / test
- `src/integration/register.e2e.test.ts`

## Implementation Steps

Each step follows the TDD cycle: Red → Green → Refactor.

- [x] Step 1: Emit alternative identifiers in CSL-JSON conversion
  - [x] Write tests in `src/integration/csl-json.test.ts`:
    - `articleToCslJson` emits `custom: { arxiv_id }` when `article.arxivId` set
      (key name MUST be `arxiv_id` — reference-manager's duplicate detector and
      fulltext discovery read `custom.arxiv_id`)
    - emits `custom.eric_id` / `custom.scopus_id` when set
    - no `custom` field at all when article has none of the three
    - arXiv-only article gets `URL: https://arxiv.org/abs/{arxivId}` when
      article has no existing URL-worthy identifier (DOI absent)
    - ERIC-only article gets `URL: https://eric.ed.gov/?id={ericId}`
  - [x] Extend `CslJsonItem` type with `custom?` and `URL?`, implement in
        `articleToCslJson`
  - [x] Verify Red → Green, run `npm run lint && npm run typecheck`
  - [x] Acceptance: CSL-JSON items carry alternative identifiers in `custom`

- [ ] Step 2: Relax registration gate in integration layer
  - [ ] Write tests in `src/integration/register.test.ts`:
    - article with only `arxivId` (or `ericId`, `scopusId`) is included in the
      bulk import, not counted as `noId`
    - article with no identifier at all is still counted as `noId` and skipped
  - [ ] Update `hasIdentifier()` in `src/integration/register.ts` to accept
        `arxivId`/`scopusId`/`ericId`
  - [ ] Verify Red → Green, lint/typecheck
  - [ ] Acceptance: arXiv/ERIC/Scopus-only articles reach `refAddBulk`

- [ ] Step 3: Update CLI dry-run display and skip messages
  - [ ] Write tests for `src/cli/commands/register.ts`:
    - `formatDryRunOutput`: arXiv-only article listed under "Would register"
      with id shown as `arxiv:{id}` (analogous for `eric:`/`scopus:`)
    - skip message no longer says "no DOI or PMID" but "no identifier"
      and only truly identifier-less articles appear there
  - [ ] Update `getRegistrationId()` to fall back to
        `arxiv:` / `eric:` / `scopus:` prefixed ids after PMID/DOI
  - [ ] Update skip message wording in `formatDryRunOutput`
  - [ ] Verify Red → Green, lint/typecheck
  - [ ] Acceptance: dry-run and summary reflect the new behavior

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Extend `src/integration/register.e2e.test.ts`:
  - register flow with an arXiv-only article: appears in bulk import file,
    `custom.arxiv_id` present in written CSL-JSON
  - identifier-less article: skipped with `noId` count
- [ ] Run full test suite: `npm test`
- [ ] Manual verification: `search-hub register <session> --dry-run` output
      with a session containing arXiv/ERIC-only articles (if feasible)
- [ ] Acceptance: All tests pass

## Notes

- Do NOT change citation key generation (`generateCslId`) — already
  identifier-agnostic.
- Duplicate detection lives in reference-manager; ERIC/Scopus exact matching
  is a separate issue (ncukondo/reference-manager#98). Title+Author+Year
  fallback covers those articles for now.
- Keep `noId` semantics in `RegistrationRecord` (now meaning "no identifier of
  any kind").
