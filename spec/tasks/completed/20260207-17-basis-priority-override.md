# Task: Basis Priority Override in classifyStatus

## Purpose

Fix `classifyStatus()` so higher-basis definitive decisions override ALL lower-basis decisions (not just uncertain), and make the `incomplete` check basis-aware. This enables the 3-stage screening workflow without requiring finalization between stages.

Currently two issues prevent skipping finalization between stages:
1. **Cross-reviewer basis override**: Definitive decisions at different basis levels produce false `conflicting` instead of letting the higher basis win (e.g. title:exclude + abstract:include → should be `agreed-include`, currently `conflicting`)
2. **Incomplete regression**: Registering an abstract-level reviewer makes all title-only articles `incomplete` even when they're `agreed-exclude` at title level

## Related Specs

- [spec/cli/review.md](../cli/review.md) - Classification Logic, Status Model sections

## Related Source Files

- `src/cli/commands/review/types.ts` — `classifyStatus()`, `basisRank()`
- `src/cli/commands/review/types.test.ts`
- `src/cli/commands/review/review-workflow.test.ts` (E2E)

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Change basis-priority filter to drop ALL lower-basis decisions

- [x] Step 1: Higher-basis definitive overrides ALL lower-basis decisions
  - [x] Write test: `src/cli/commands/review/types.test.ts`
    - A title:include + B abstract:exclude → `agreed-exclude` (was `conflicting`)
    - A title:exclude + B abstract:include → `agreed-include` (was `conflicting`)
    - Same-basis conflicts remain `conflicting` (A title:include + B title:exclude → `conflicting`)
  - [x] Verify test fails (Red)
  - [x] Implement: In `classifyStatus()`, line ~237-243: change `decision === 'uncertain' && rank < highestDefinitiveRank` to `rank < highestDefinitiveRank`
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Verify test still passes
  - [x] Acceptance: Cross-basis definitive decisions resolved by higher basis; same-basis conflicts still `conflicting`

### Step 2: Make `incomplete` check basis-aware

- [x] Step 2: Filter registered reviewers by article's highest reviewed basis
  - [x] Write test: `src/cli/commands/review/types.test.ts`
    - Title-only article + abstract reviewer registered → NOT `incomplete`
    - Two title reviewers exclude + abstract reviewer registered but didn't review → `agreed-exclude`
    - Article with abstract review + abstract reviewer not yet reviewed → `incomplete` (unchanged)
  - [x] Verify test fails (Red)
  - [x] Implement: In `classifyStatus()`, line ~168-176: filter `registeredReviewers` to only those with `basisRank(reg.basis) <= highestReviewedRank` of the article
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Refactor if needed
  - [x] Verify test still passes
  - [x] Acceptance: `incomplete` only checks reviewers whose registered basis ≤ article's highest reviewed basis

### Final Step: E2E Multi-Stage Workflow Test (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [x] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full workflow without finalization: title screening → abstract screening → verify correct statuses
  - 2 agreed-exclude at title → still `agreed-exclude` after abstract reviewer registered
  - 8 uncertain at title → abstract-include overrides → `agreed-include`
  - **Minimize mocks** — Only mock external services when absolutely necessary
  - **Follow user flows** — Test the same paths users will take
  - **Use real file I/O** — Test actual file operations with temp directories
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: Test the feature manually as a user would
- [x] Acceptance: All tests pass, feature works in real usage

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
- This task depends on #88 (Review Basis Priority in Status Classification) which introduced the current basis-priority logic
