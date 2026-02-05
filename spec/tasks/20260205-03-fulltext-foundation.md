# Task: Fulltext Management Foundation

## Purpose

Establish the foundation for fulltext management: type definitions, directory structure, citation key generation, and index management. This enables subsequent tasks (init, sync, fetch, etc.) to build on a solid base.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - Full specification
- [spec/models/session.md](../models/session.md) - Session directory structure

## Related Source Files

- `src/fulltext/types.ts` (new) - Type definitions
- `src/fulltext/citation-key.ts` (new) - Citation key generation
- `src/fulltext/index-manager.ts` (new) - fulltext-index.json management
- `src/fulltext/meta.ts` (new) - meta.json management
- `src/fulltext/paths.ts` (new) - Path resolution utilities

## Implementation Steps

### Step 1: Type Definitions

- [x] Create `src/fulltext/types.ts`
  - Define `FulltextMeta`, `OALocation`, `FileInfo` interfaces
  - Define `FulltextIndex`, `FulltextIndexEntry` interfaces
  - Define `ArticleFulltextRef` (for reviews.yaml extension)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All types compile without errors

### Step 2: Citation Key Generation

- [x] Write test: `src/fulltext/citation-key.test.ts`
  - Test: `smith2024` from author "Smith, J." and year 2024
  - Test: `muller2023` from author "Müller, K." (transliteration)
  - Test: `tanaka2024` from author "田中" (romaji)
  - Test: `unknown0000` when no author/year
  - Test: Collision handling: `smith2024`, `smith2024a`, `smith2024b`
  - Test: UUID8 suffix generation
- [x] Create stub: `src/fulltext/citation-key.ts`
- [x] Verify test fails (Red)
- [x] Implement `generateCitationKey()` and `generateDirName()`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Citation keys generated correctly for all edge cases

### Step 3: Path Resolution Utilities

- [x] Write test: `src/fulltext/paths.test.ts`
  - Test: `getFulltextDir(sessionDir)` returns `<sessionDir>/fulltext`
  - Test: `getArticleDir(sessionDir, dirName)` returns correct path
  - Test: `getMetaPath(sessionDir, dirName)` returns `<dir>/meta.json`
  - Test: `getReadmePath(sessionDir, dirName)` returns `<dir>/README.md`
  - Test: `getIndexPath(sessionDir)` returns `<sessionDir>/fulltext/fulltext-index.json`
- [x] Create stub: `src/fulltext/paths.ts`
- [x] Verify test fails (Red)
- [x] Implement path utilities
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All paths resolve correctly

### Step 4: Meta.json Management

- [x] Write test: `src/fulltext/meta.test.ts`
  - Test: `createMeta()` creates valid FulltextMeta
  - Test: `loadMeta()` reads and parses meta.json
  - Test: `saveMeta()` writes meta.json with proper formatting
  - Test: `updateMetaFiles()` updates files section
- [x] Create stub: `src/fulltext/meta.ts`
- [x] Verify test fails (Red)
- [x] Implement meta management functions
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: meta.json created, loaded, saved correctly

### Step 5: Index Management

- [x] Write test: `src/fulltext/index-manager.test.ts`
  - Test: `createIndex()` creates empty index
  - Test: `loadIndex()` reads existing index
  - Test: `addEntry()` adds new entry to index
  - Test: `updateEntry()` updates existing entry
  - Test: `findByDoi()`, `findByPmid()` lookup functions
  - Test: `saveIndex()` writes index with proper formatting
- [x] Create stub: `src/fulltext/index-manager.ts`
- [x] Verify test fails (Red)
- [x] Implement index management functions
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: fulltext-index.json managed correctly

### Step 6: README Template Generation

- [x] Write test: `src/fulltext/readme.test.ts`
  - Test: `generateReadme()` creates proper Markdown
  - Test: Includes title, identifiers, URLs
  - Test: Includes instructions for manual download
- [x] Create stub: `src/fulltext/readme.ts`
- [x] Verify test fails (Red)
- [x] Implement README generation
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: README.md generated with all required sections

### Final Step: Integration Test

- [x] Write integration test: `src/fulltext/foundation.test.ts`
  - Test: Create article directory with meta.json, README.md
  - Test: Add to index, verify lookup works
  - Test: Update meta with file info
- [x] Run full test suite: `npm test`
- [x] Acceptance: All foundation components work together

## Notes

- Use `any-ascii` or similar library for transliteration (or implement simple mapping)
- UUID generation: use `crypto.randomUUID()`
- JSON formatting: 2-space indentation for readability
