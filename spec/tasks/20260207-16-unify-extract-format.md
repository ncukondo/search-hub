# Task: Unify Review Extract Format

## Purpose

Unify WorkFile and ReviewFile extract formats into a single ReviewFile-based format.
Currently, `review extract` produces two different formats depending on whether `--basis`
is specified: a WorkFile (flat `id`/`decision`/`comment` per article) or a ReviewFile
(with `reviews[]` array). Each format lacks features the other has — WorkFile lacks
identifiers (doi, pmid, etc.) and ReviewFile lacks the `basis` field.

This task unifies both into a single ReviewFile-based format, adds a `--finalize` flag
for final decision mode with basis-scoped content, and ensures schema references and
guidance comments on all extracted files.

## Related Specs

- [spec/cli/review.md](../cli/review.md) — File Formats, Commands sections

## Related Source Files

- `src/cli/commands/review/types.ts`
- `src/cli/commands/review/extract.ts` + `.test.ts`
- `src/cli/commands/review/merge.ts` + `.test.ts`
- `src/cli/commands/review/mark.ts` + `.test.ts`
- `src/cli/commands/review/review-workflow.test.ts`
- `src/cli/index.ts`
- `schemas/review.schema.json`

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Schema + types

- [ ] Add `basis` to `review.schema.json` as optional top-level field (enum: title, abstract, fulltext)
- [ ] Add `basis?: ReviewBasis` to `ReviewFile` interface in `types.ts`
- [ ] Mark `WorkFile`/`WorkFileArticle` as deprecated (keep for backward compat)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Schema validates files with optional top-level `basis`; types compile

### Step 2: Add `--finalize` option to CLI

- [ ] Write test: `src/cli/commands/review/extract.test.ts` — test `--finalize` option parsing
- [ ] Add `finalize` to `ReviewExtractOptions` in `types.ts`
- [ ] Register `--finalize` flag in `src/cli/index.ts`
- [ ] Verify test fails (Red)
- [ ] Implement option wiring
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `--finalize` flag is recognized and passed to extract handler

### Step 3: Rewrite extract `--basis` branch

- [ ] Write test: `src/cli/commands/review/extract.test.ts` — `--basis` outputs ReviewFile format
- [ ] Verify test fails (Red)
- [ ] Rewrite `--basis` branch to output ReviewFile instead of WorkFile:
  - Include identifiers (doi, pmid, etc.) on each article
  - Pre-populate `reviews: [{ decision: 'uncertain', comment: '' }]`
  - Add decision inline comments: title → `# exclude / uncertain`, abstract/fulltext → `# include / exclude / uncertain`
  - Add schema reference + guidance comments at top of file
  - Set top-level `basis` field
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: `--basis title` extract produces ReviewFile with `basis: title`, identifiers, and pre-populated reviews

### Step 4: Add `--finalize` mode to extract

- [ ] Write test: `src/cli/commands/review/extract.test.ts` — `--finalize` tests
- [ ] Verify test fails (Red)
- [ ] Implement `--finalize` mode:
  - `--finalize` alone: all content + reviewHistory + finalDecision
  - `--finalize --basis title`: title + reviewHistory + finalDecision (no abstract)
  - `--finalize --basis abstract`: title + abstract + reviewHistory + finalDecision
  - No `--basis` and no `--finalize`: backward compat → same as `--finalize` (all content)
  - Add `getFinalDecisionGuidanceComment()` function
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: `--finalize` extracts include reviewHistory, finalDecision field, and scoped content

### Step 5: Update merge for unified format

- [ ] Write test: `src/cli/commands/review/merge.test.ts` — unified format merge tests
- [ ] Verify test fails (Red)
- [ ] Update `isWorkFile()` to detect OLD format only (flat `id` + `decision` without `reviews`)
- [ ] Update `processReviewFile()` to use top-level `basis` if present
- [ ] Keep `processWorkFile()` for backward compat (add deprecation comment)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: Merge correctly handles new unified format; old WorkFile format still works

### Step 6: Update mark command

- [ ] Write test: `src/cli/commands/review/mark.test.ts` — ReviewFile format tests
- [ ] Verify test fails (Red)
- [ ] Rewrite `loadWorkFile()` → `loadScreeningFile()` (loads ReviewFile with basis)
- [ ] Update article lookup from `id` matching to identifier field matching
- [ ] Update `reviews[0].decision`/`comment` instead of flat fields
- [ ] Preserve schema reference + guidance comments on save
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: `review mark` works with new ReviewFile-based screening files

### Step 7: Update tests

- [ ] `extract.test.ts`: Update `--basis` tests → ReviewFile assertions, add `--finalize` tests
- [ ] `merge.test.ts`: Add new format tests + backward compat tests
- [ ] `mark.test.ts`: Update to ReviewFile format
- [ ] `review-workflow.test.ts`: Update E2E assertions
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All existing tests updated and passing

### Final Step: E2E Integration Test (MANDATORY)

- [ ] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full workflow: init → extract (screening) → mark → merge → extract (finalize) → merge
  - **Minimize mocks** — Only mock external services when absolutely necessary
  - **Follow user flows** — Test the same paths users will take
  - **Use real file I/O** — Test actual file operations with temp directories
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test the feature manually as a user would
- [ ] Acceptance: All tests pass, feature works in real usage

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

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** — Mock-based unit tests often miss real-world issues
- Always complete the Final Step (E2E tests) before marking the task complete
- Backward compatibility with old WorkFile format must be maintained during transition
- The old WorkFile format should be deprecated but not removed in this task
