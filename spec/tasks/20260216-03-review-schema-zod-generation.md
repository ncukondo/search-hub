# Task: Replace Static JSON Schema with Zod-Generated Schema

## Purpose

The review workflow uses a manually maintained `schemas/review.schema.json` alongside
manually maintained TypeScript interfaces in `types.ts`. These two definitions can
drift apart (e.g., the `fulltext` field exists in TypeScript but not in JSON Schema).

By defining Zod schemas as the single source of truth, we:
1. Derive TypeScript types automatically (`z.infer<>`)
2. Generate JSON Schema for IDE autocompletion (`z.toJSONSchema()`)
3. Enable future runtime validation of YAML input
4. Eliminate the static `schemas/review.schema.json` file

This follows the existing pattern in `src/query/json-schema.ts`.

## Related Specs

- [spec/cli/review.md](../cli/review.md) - review file format

## Related Source Files

- `src/cli/commands/review/types.ts` - current manual interfaces
- `src/cli/commands/review/init.ts` - schema discovery via `findSchemaSource()`
- `src/cli/commands/review/extract.ts` - schema copy logic
- `schemas/review.schema.json` - static schema to be replaced
- `src/query/json-schema.ts` - existing Zod→JSON Schema pattern

## Implementation Steps

### Step 1: Create Zod schemas and `generateReviewJSONSchema()`

- [ ] Create `src/cli/commands/review/schema.ts` with Zod schemas:
  - `reviewDecisionSchema`, `reviewBasisSchema`
  - `reviewSchema`, `mergedSourceSchema`
  - `articleFulltextRefSchema`, `articleEntrySchema`
  - `reviewerRecordSchema`, `reviewFileSchema`
  - `generateReviewJSONSchema()` function
- [ ] Write tests in `src/cli/commands/review/schema.test.ts`:
  - JSON Schema generation produces valid schema
  - Required/optional fields match current schema
  - Enum values are correct
  - `fulltext` field is included (fixing current gap)
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Zod schemas produce equivalent JSON Schema

### Step 2: Replace TypeScript interfaces with Zod-derived types

- [ ] Update `types.ts` to import types from `schema.ts` using `z.infer<>`
- [ ] Remove manual interface definitions for: `Review`, `MergedSource`, `ArticleEntry`, `ReviewerRecord`, `ReviewFile`
- [ ] Keep in `types.ts`: `classifyStatus`, `basisRank`, `BASIS_RANK`, `ReviewStatus`, `WorkFile`, `WorkFileArticle`
- [ ] Verify all existing tests pass (no type breakage)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All types derived from Zod, all consumers compile

### Step 3: Replace static schema with generated schema in `init.ts`

- [ ] Update `init.ts`: replace `findSchemaSource()` with `generateReviewJSONSchema()`
- [ ] Write generated JSON Schema to disk instead of copying static file
- [ ] Delete `schemas/review.schema.json`
- [ ] Verify init tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `review init` generates schema from Zod

### Final Step: Full Test Suite

- [ ] Run `npm run test:all`
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All tests pass

## Notes

- `WorkFile` and `WorkFileArticle` are deprecated legacy types; leave as manual interfaces
- `ReviewStatus` is a runtime classification type, not a YAML schema type; leave as-is
- `ArticleFulltextRef` comes from `@ncukondo/academic-fulltext`; define a matching Zod schema
- The current static schema is missing the `fulltext` field; the Zod schema fixes this
