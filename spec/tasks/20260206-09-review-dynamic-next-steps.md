# Task: Dynamic Review Next Steps

## Purpose

Replace the static workflow guidance in review commands with dynamic, context-aware
Next Steps based on the current article status distribution. Each command's output
suggests the exact next command to run, so users can progress through the screening
workflow by copy-pasting without needing to understand filter options.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - Dynamic Next Steps section
- [spec/cli/suggestions.md](../cli/suggestions.md) - Phase 4 review suggestions

## Related Source Files

- `src/cli/commands/review/status.ts` - `formatStatusOutput()` (static guidance to remove)
- `src/cli/commands/review/list.ts` - `WorkflowGuidance`, `WorkflowPhase`, `generateWorkflow()`
- `src/cli/commands/review/merge.ts` - `formatMergeOutput()`
- `src/cli/commands/review/finalize.ts` - `formatFinalizeOutput()` (from Task 74)
- `src/cli/commands/review/extract.ts` - extract output
- `src/cli/suggestions/` - existing suggestion system
- `src/cli/index.ts` - command output handling

## Implementation Steps

### Step 1: Create `generateReviewNextSteps` Common Function

- [x] Write test: `src/cli/commands/review/next-steps.test.ts`
  - `agreed > 0` → suggests `review finalize`
  - `agreed = 0, uncertain + conflicting + incomplete > 0` → suggests `review extract` with next basis
  - All finalized → suggests `review export`
  - `--limit` used with remaining → suggests next batch with correct offset
  - Next basis detection: no abstract reviews → abstract; has abstract → fulltext
  - Session ID is embedded in suggested commands
- [x] Create `src/cli/commands/review/next-steps.ts` with `generateReviewNextSteps()`
- [x] Define `ReviewNextStepsContext` interface:
  ```typescript
  interface ReviewNextStepsContext {
    sessionId: string;
    statusResult: ReviewStatusResult;
    extractName?: string;       // for batch continuation
    extractedCount?: number;    // for batch continuation
    totalMatching?: number;     // for batch continuation
    limit?: number;             // for batch continuation
    offset?: number;            // for batch continuation
  }
  ```
- [x] Verify test fails (Red)
- [x] Implement `generateReviewNextSteps`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Correct next steps generated for all scenarios

### Step 2: Integrate into `review merge` Output

- [x] Write test: `src/cli/commands/review/merge.test.ts`
  - Merge output includes Next Steps section
  - After merge, suggests `review finalize` (if agreed articles exist) or `review status`
- [x] Update `formatMergeOutput` to accept optional next steps
- [x] Update `executeReviewMerge` caller in `index.ts` to compute and pass next steps
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review merge` output shows contextual next steps

### Step 3: Integrate into `review finalize` Output

- [x] Write test: `src/cli/commands/review/finalize.test.ts`
  - After finalize with remaining uncertain → suggests extract for next phase
  - After finalize with all finalized → suggests export
- [x] Update `formatFinalizeOutput` to accept optional next steps
- [x] Update finalize caller in `index.ts` to compute and pass next steps
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review finalize` output shows contextual next steps

### Step 4: Integrate into `review extract` Output

- [x] Write test: `src/cli/commands/review/extract.test.ts`
  - Extract output suggests merge command with correct `--name`
  - When `--limit` used with remaining articles, suggests next batch
  - Next batch suggestion has correct `--offset` and incremented `--name`
- [x] Update extract output in `index.ts` to include next steps
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review extract` output shows merge and batch continuation hints

### Step 5: Update `review status` Output

- [x] Write test: `src/cli/commands/review/status.test.ts`
  - Status output includes dynamic Next Steps instead of static workflow guide
  - Next Steps logic matches `generateReviewNextSteps`
- [x] Update `formatStatusOutput` to use `generateReviewNextSteps`
- [x] Remove old static "AI Agent Workflow" block
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `review status` shows dynamic, context-aware next steps

### Step 6: Update `suggestions.md` Spec and Suggestion Rules

- [ ] Update `spec/cli/suggestions.md` Phase 4 section to reference dynamic generation
- [x] Update `src/cli/suggestions/rules.ts` review-related rules to use new logic
- [x] Verify existing suggestion tests still pass
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Suggestion system aligned with new review workflow

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/review/review-workflow.test.ts`
  - Full workflow progression: verify each command's output suggests the correct next step
  - After merge → finalize suggestion appears
  - After finalize → extract for next phase suggestion appears
  - After all finalized → export suggestion appears
  - Batch continuation: extract with limit → next batch suggested with correct offset
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, users can follow Next Steps through entire workflow

## Notes

- Depends on Task 72 (Status Model), Task 73 (Extract Format), Task 74 (Finalize Command).
- `generateReviewNextSteps` calls `executeReviewStatus` internally to get current counts.
  This adds minimal I/O (one YAML read) per command, which is acceptable.
- The existing suggestion system in `src/cli/suggestions/` continues to work for
  non-review commands. Review-specific next steps are handled by the new function.
- `--quiet` suppresses next steps (existing behavior for all output).
