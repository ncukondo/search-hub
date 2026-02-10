# Task: Unify Review Schema to Local Copy Pattern

## Purpose

Review YAML files (`init`, `merge`, `finalize`) reference the JSON Schema via a fragile hardcoded relative path (`../../../../.search-hub/schemas/review.schema.json`). This assumes a specific directory depth from `.internal/reviews.yaml` to the `.search-hub/schemas/` directory, which breaks if the sessions directory is relocated.

The `extract` command already uses a better pattern: copying the schema file alongside the YAML (`$schema=./review.schema.json`). This task unifies all review commands to use the same local-copy approach.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - schema reference in YAML examples

## Related Source Files

- `src/cli/commands/review/init.ts` - copies schema to `.search-hub/schemas/`, references via deep relative path
- `src/cli/commands/review/merge.ts` - hardcoded deep relative path
- `src/cli/commands/review/finalize.ts` - hardcoded deep relative path
- `src/cli/commands/review/extract.ts` - already uses local copy pattern (reference implementation)
- `src/cli/commands/review/init.test.ts`
- `src/cli/commands/review/merge.test.ts`
- `src/cli/commands/review/finalize.test.ts`
- `src/cli/commands/review/review-workflow.test.ts`

## Implementation Steps

### Step 1: Update `review init` to copy schema to `.internal/`

- [ ] Write test: schema file is copied to `.internal/review.schema.json` alongside `reviews.yaml`
- [ ] Write test: YAML comment references `./review.schema.json` (not deep relative path)
- [ ] Verify tests fail (Red)
- [ ] Update `executeReviewInit` to:
  - Copy schema to `.internal/review.schema.json` (same dir as `reviews.yaml`)
  - Change schema comment to `# yaml-language-server: $schema=./review.schema.json`
  - Remove copy to `.search-hub/schemas/` (no longer needed)
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `review init` creates `reviews.yaml` with `$schema=./review.schema.json` and copies schema alongside

### Step 2: Update `review merge` to use local schema path

- [ ] Write test: merged YAML references `./review.schema.json`
- [ ] Verify test fails (Red)
- [ ] Update `executeReviewMerge` to use `$schema=./review.schema.json`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: merge output references local schema

### Step 3: Update `review finalize` to use local schema path

- [ ] Write test: finalized YAML references `./review.schema.json`
- [ ] Verify test fails (Red)
- [ ] Update `executeReviewFinalize` to use `$schema=./review.schema.json`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: finalize output references local schema

### Step 4: Update spec examples

- [ ] Update `spec/cli/review.md` schema path examples from `../../schemas/review.schema.json` to `./review.schema.json`

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Verify existing E2E tests in `review-workflow.test.ts` pass with updated paths
- [ ] Verify schema file exists alongside `reviews.yaml` in `.internal/` after init
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: All tests pass, schema references are consistent across all review commands

## Notes

- `extract.ts` already uses the local copy pattern and should NOT be modified
- The `.search-hub/schemas/` directory and its copy logic can be removed from `init.ts`
- This is a pre-release change; no backward compatibility needed
