# Task: Migrate Fulltext Module to `@ncukondo/academic-fulltext` Package

## Purpose

Replace the in-tree `src/fulltext/` implementation (35 files) with the
`@ncukondo/academic-fulltext` npm package. The package is a superset of the
current implementation and adds:

- **DOI→PMCID auto-resolution** via NCBI ID Converter API
- **arXiv HTML→Markdown conversion** via LaTeXML HTML download
- **Batch ID resolution** for multiple DOIs

This reduces maintenance burden and unlocks new retrieval paths.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - Updated architecture, scope, and schema
- [spec/models/config.md](../models/config.md) - `ncbi_email`, `ncbi_tool` additions

## Related Source Files

### Package boundary (kept / moved)

- `src/cli/commands/fulltext/*.ts` — CLI layer (import rewrite only)
- `src/fulltext/attach-shared.ts` → `src/integration/attach-shared.ts` (move)
- `src/integration/fulltext-attach.ts` — import path update

### Deleted after migration

- `src/fulltext/` — entire directory (35 files)

## Implementation Steps

### Step 1: Install package & extend config schema

- [ ] Install `@ncukondo/academic-fulltext`
  ```bash
  npm install @ncukondo/academic-fulltext
  ```
- [ ] Add `ncbi_email` and `ncbi_tool` to `src/config/schema.ts` under `fulltext.sources`
  ```typescript
  ncbi_email: z.string().default(''),
  ncbi_tool: z.string().default('search-hub'),
  ```
- [ ] Update config spec `spec/models/config.md` if needed
- [ ] Run `npm run typecheck` — should pass
- [ ] Commit: "feat: install @ncukondo/academic-fulltext, add ncbi config"

### Step 2: Move `attach-shared.ts` to `src/integration/`

`attach-shared.ts` contains search-hub–specific logic (matching fulltext dirs
to ref entries) that is not part of the package.

- [ ] Move `src/fulltext/attach-shared.ts` → `src/integration/attach-shared.ts`
- [ ] Update its internal imports from `./types.js` → `@ncukondo/academic-fulltext`
  - `FulltextMeta` type
- [ ] Update consumers:
  - `src/cli/commands/fulltext/attach.ts:10` — `../../../fulltext/attach-shared.js` → `../../../integration/attach-shared.js`
  - `src/integration/fulltext-attach.ts:10` — `../fulltext/attach-shared.js` → `./attach-shared.js`
- [ ] Run `npm run typecheck` — should pass
- [ ] Commit: "refactor: move attach-shared to src/integration/"

### Step 3: Rewrite CLI command imports (8 production files)

Replace `../../../fulltext/*` imports with `@ncukondo/academic-fulltext` in each file:

- [ ] **`check.ts`** (lines 9-11)
  - `discoverOA`, `DiscoveryConfig`, `DiscoveryArticle` ← `@ncukondo/academic-fulltext`
  - `loadMeta`, `saveMeta` ← `@ncukondo/academic-fulltext`
  - `OAStatus` ← `@ncukondo/academic-fulltext`
- [ ] **`fetch.ts`** (lines 9-11)
  - `FulltextMeta` ← `@ncukondo/academic-fulltext`
  - `loadMeta` ← `@ncukondo/academic-fulltext`
  - `fetchAllFulltexts`, `FetchArticle` ← `@ncukondo/academic-fulltext`
- [ ] **`init.ts`** (lines 10-14)
  - `ArticleFulltextRef` ← `@ncukondo/academic-fulltext`
  - `generateCitationKey`, `generateDirName` ← `@ncukondo/academic-fulltext`
  - `createMeta`, `saveMeta` ← `@ncukondo/academic-fulltext`
  - `generateReadme` ← `@ncukondo/academic-fulltext`
  - `getFulltextDir`, `getArticleDir`, `getMetaPath`, `getReadmePath` ← `@ncukondo/academic-fulltext`
- [ ] **`sync.ts`** (lines 9-11)
  - `FulltextMeta`, `FileInfo` ← `@ncukondo/academic-fulltext`
  - `loadMeta`, `saveMeta`, `updateMetaFiles` ← `@ncukondo/academic-fulltext`
  - `getFulltextDir` ← `@ncukondo/academic-fulltext`
- [ ] **`convert.ts`** (lines 7-8)
  - `getFulltextDir`, `getArticleDir`, `getMetaPath` ← `@ncukondo/academic-fulltext`
  - `convertPmcXmlToMarkdown` ← `@ncukondo/academic-fulltext`
- [ ] **`status.ts`** (lines 9-10)
  - `loadMeta` ← `@ncukondo/academic-fulltext`
  - `getMetaPath` ← `@ncukondo/academic-fulltext`
- [ ] **`pending.ts`** (lines 9-11)
  - `loadMeta` ← `@ncukondo/academic-fulltext`
  - `getMetaPath` ← `@ncukondo/academic-fulltext`
  - `OALocation` ← `@ncukondo/academic-fulltext`
- [ ] **`review/types.ts`** (line 5)
  - `ArticleFulltextRef` ← `@ncukondo/academic-fulltext`
- [ ] Run `npm run typecheck` — should pass
- [ ] Commit: "refactor: rewrite fulltext imports to @ncukondo/academic-fulltext"

### Step 4: Add `hasFiles.html` field

Add `html: boolean` to `ArticleFulltextRef.hasFiles` across all usage sites.

- [ ] **`src/fulltext/types.ts`** (or verify package type already includes `html`) —
  The package should export `ArticleFulltextRef` with `hasFiles.html`.
  If the in-tree type is still used, add `html: boolean` to the `hasFiles` object.
- [ ] **`init.ts:104`** — `hasFiles: { pdf: false, xml: false, markdown: false }` → add `html: false`
- [ ] **`fetch.ts:185-188`** — add `html` field to hasFiles update logic
- [ ] **`sync.ts:62`** — update Map type to include `html`
- [ ] **`sync.ts:128-131`** — add `html: !!(updatedMeta.files.html)` to hasFiles computation
- [ ] Run `npm run typecheck` — should pass
- [ ] Commit: "feat: add hasFiles.html field to ArticleFulltextRef"

### Step 5: Leverage package's new features

- [ ] **`check.ts`**: Pass `ncbiEmail` and `ncbiTool` from config to `DiscoveryConfig`
  ```typescript
  const discoveryConfig: DiscoveryConfig = {
    ...existingConfig,
    ncbiEmail: config.fulltext.sources.ncbi_email,
    ncbiTool: config.fulltext.sources.ncbi_tool,
  };
  ```
- [ ] **`fetch.ts`**: Pass `arxivId` to `FetchArticle` so arXiv HTML can be downloaded
- [ ] **`convert.ts`**: Add `convertArxivHtmlToMarkdown` support
  - Import `convertArxivHtmlToMarkdown` from `@ncukondo/academic-fulltext`
  - After PMC XML conversion, check for `fulltext.html` and convert if present
  - Update meta.json `files.html` and `files.markdown` accordingly
- [ ] Run `npm run typecheck` — should pass
- [ ] Commit: "feat: enable DOI→PMCID resolution and arXiv HTML conversion"

### Step 6: Fix tests

#### 6a: Update `vi.mock()` paths in CLI tests

- [ ] **`check.test.ts:11`** — `vi.mock('../../../fulltext/discovery/index')` → `vi.mock('@ncukondo/academic-fulltext')`
- [ ] **`check.test.ts:7`** — `import * as discoveryModule` → update to package
- [ ] **`fetch.test.ts:23`** — `vi.mock('../../../fulltext/meta', ...)` → `vi.mock('@ncukondo/academic-fulltext', ...)`
- [ ] **`fetch.test.ts:28`** — `vi.mock('../../../fulltext/download/orchestrator', ...)` → merge into single package mock
- [ ] Update any `import` statements in test files that reference `../../../fulltext/types`

#### 6b: Add `html` to `hasFiles` literals in test files (9 files)

All `hasFiles: { pdf: ..., xml: ..., markdown: ... }` → add `html: false` (or appropriate value):

- [ ] `src/cli/commands/fulltext/init.test.ts` (1 location)
- [ ] `src/cli/commands/fulltext/fetch.test.ts` (7 locations)
- [ ] `src/cli/commands/fulltext/sync.test.ts` (4 locations)
- [ ] `src/cli/commands/fulltext/pending.test.ts` (4 locations)
- [ ] `src/cli/commands/fulltext/status.test.ts` (4 locations)
- [ ] `src/cli/commands/fulltext/status-pending.test.ts` (3 locations)
- [ ] `src/cli/commands/review/review-workflow.test.ts` (4 locations)
- [ ] `src/cli/commands/review/extract.test.ts` (2 locations)
- [ ] `src/cli/commands/fulltext/init-sync.test.ts` (if hasFiles literals exist)

#### 6c: Delete `src/fulltext/` test files (17 files)

These tests move to the package repository:

- [ ] `src/fulltext/citation-key.test.ts`
- [ ] `src/fulltext/meta.test.ts`
- [ ] `src/fulltext/paths.test.ts`
- [ ] `src/fulltext/readme.test.ts`
- [ ] `src/fulltext/foundation.test.ts`
- [ ] `src/fulltext/discovery/index.test.ts`
- [ ] `src/fulltext/discovery/core.test.ts`
- [ ] `src/fulltext/discovery/pmc.test.ts`
- [ ] `src/fulltext/discovery/arxiv.test.ts`
- [ ] `src/fulltext/discovery/unpaywall.test.ts`
- [ ] `src/fulltext/convert/index.test.ts`
- [ ] `src/fulltext/convert/jats-parser.test.ts`
- [ ] `src/fulltext/convert/markdown-writer.test.ts`
- [ ] `src/fulltext/convert/convert.e2e.test.ts`
- [ ] `src/fulltext/download/orchestrator.test.ts`
- [ ] `src/fulltext/download/downloader.test.ts`
- [ ] `src/fulltext/download/pmc-xml.test.ts`

- [ ] Run `npm test` — all remaining tests should pass
- [ ] Commit: "test: update mocks and hasFiles literals, remove in-tree fulltext tests"

### Step 7: Clean up

- [ ] Delete `src/fulltext/` directory entirely
- [ ] Check `package.json` for dependencies that were only used by `src/fulltext/`:
  - `fast-xml-parser` — likely removable (used by JATS parser)
  - `any-ascii` — likely removable (used by citation-key)
  - `node-html-parser` — likely removable (if only used by fulltext convert)
  - Verify each with `grep` before removing
- [ ] Run `npm run typecheck && npm run lint` — should pass
- [ ] Commit: "chore: remove src/fulltext/ and unused direct dependencies"

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Run full test suite: `npm test`
- [ ] Run typecheck: `npm run typecheck`
- [ ] Run lint: `npm run lint`
- [ ] **Manual verification**: Test key workflows manually
  - `search-hub fulltext check <session>` — should use DOI→PMCID resolution
  - `search-hub fulltext fetch <session>` — should download arXiv HTML
  - `search-hub fulltext convert <session>` — should convert both XML and HTML
  - `search-hub fulltext init <session>` — hasFiles should include `html: false`
  - `search-hub fulltext sync <session>` — should detect `fulltext.html`
- [ ] Acceptance: All tests pass, all CLI commands work correctly

## Notes

- The `@ncukondo/academic-fulltext` package API is designed to be a drop-in replacement
  for the current `src/fulltext/` exports. Type names and function signatures are identical.
- `attach-shared.ts` is the only file that stays in search-hub (moved to `src/integration/`)
  because it contains search-hub–specific logic for matching fulltext dirs to reference entries.
- The `hasFiles.html` field addition is backward-compatible — existing meta.json files
  without `html` will default to `false` via the package's type handling.
