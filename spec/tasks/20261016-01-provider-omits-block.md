# Task: Provider Block Omission (`providers.<db>.omits`) (#155)

## Purpose

`providers.<db>.replaces` can swap a concept block's terms per database, but cannot drop a block.
In practice a multi-block strategy (e.g. 4 blocks ANDed) can return 0 records on a small database
such as arXiv, and reviewers agree to run a reduced combination (e.g. #1 AND #2 AND #4) there only.
Today this requires a separate YAML and a separate session, which splits one search strategy and
makes deduplication and PRISMA counting manual.

Add an explicit `omits` action key so one query file / one session can drop named blocks for
specific providers.

```yaml
providers:
  arxiv:
    omits:
      - concept-wba
```

### Design decisions

- `omits` is an independent action key alongside `replaces` and `adds`, following the DSL's
  "Explicit actions" principle. `replaces: { <id>: null }` is **not** supported.
- Omission is applied in `resolveForProvider()` (before translation), so translators need no changes.
- Validation errors (both in the zod validator and in `resolveForProvider`):
  - `omits` references a non-existent block id
  - the same id appears in both `replaces` and `omits` for one provider
  - `omits` would remove **all** blocks for a provider
  - duplicate ids within `omits` (dedupe silently or error — prefer error for clarity)

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - "Provider Sections", "Reading Rules", "Resolution Layer"
- [spec/cli/commands.md](../cli/commands.md) - `query inspect`, `query translate`, `search --dry-run` output

## Related Source Files

- `src/query/types.ts` — `ProviderSection` (add `omits?: string[]`)
- `src/query/validator.ts` — provider section schema + cross-validation
- `src/query/json-schema.ts` — editor JSON schema input
- `src/query/resolver.ts` — `resolveForProvider()`
- `src/cli/commands/query/inspect.ts` — per-provider block display (currently marks `replaces`)
- `src/cli/commands/query/translate.ts`
- `src/cli/commands/search.ts` — `--dry-run` output
- `src/session/manager.ts` — `query_common.yaml` copy (raw YAML, so `omits` is recorded as-is)
- `src/cli/commands/search-executor.ts` — per-provider translated query files

## Implementation Steps

- [x] Step 1: Types & validator
  - [x] Write tests: `src/query/validator.test.ts` — accepts `omits: [id]`; rejects unknown id, id in both `replaces` and `omits`, all blocks omitted, duplicate ids
  - [x] Add `omits?: string[]` to `ProviderSection` in `src/query/types.ts`
  - [x] Extend provider section schema and cross-validation in `src/query/validator.ts`
  - [x] Verify Red → Green; `npm run lint && npm run typecheck`
  - [x] Acceptance: invalid `omits` usage reports a clear error naming the provider and block id

- [x] Step 2: JSON schema
  - [x] Write/extend test: `src/query/json-schema.test.ts` — `omits` present as string array
  - [x] Update `src/query/json-schema.ts`
  - [x] Acceptance: generated schema allows `providers.<db>.omits`

- [x] Step 3: Resolution layer
  - [x] Write tests: `src/query/resolver.test.ts` — omitted block absent from `ResolvedAST.blocks` for that provider only; other providers unaffected; combines with `replaces` on other blocks and with `adds.filters`; block order preserved; errors for unknown id / overlap / all omitted
  - [x] Implement in `resolveForProvider()`
  - [x] Acceptance: `query translate` for arXiv produces `#1 AND #2 AND #4` when block 3 is omitted

- [x] Step 4: CLI visibility (`query inspect`, `query translate`, `search --dry-run`)
  - [x] Write tests for each command's output
  - [x] `query inspect`: mark omitted blocks per provider (e.g. `(omitted)` alongside the existing `(replaced)` marker)
  - [x] `query translate` / `--dry-run`: show a note listing omitted block ids per provider
  - [x] Acceptance: a user can see from `--dry-run` alone which blocks each provider skips

- [x] Step 5: Session snapshot
  - [x] Write test: session created from a query with `omits` keeps `omits` in `query_common.yaml`, and the provider's saved translated query excludes the block
  - [x] Acceptance: the session fully records the per-provider strategy

- [x] Step 6: Spec & docs
  - [x] Update `spec/models/query-dsl.md`: design principle 3, provider section example, Reading Rules, Resolution Layer
  - [x] Update `spec/cli/commands.md` output examples if affected
  - [x] Update user docs / README query DSL section if it documents `replaces`

### Final Step: E2E Integration Tests (MANDATORY)

- [x] Write E2E test: `src/query/omits.e2e.test.ts` (or extend existing query/search E2E)
  - YAML file with 4 blocks and `providers.arxiv.omits: [<block-3>]`
  - `query translate` → arXiv query lacks block 3; PubMed query contains all 4
  - `search --dry-run` → shows omission note for arXiv
  - Invalid cases (unknown id, overlap with `replaces`, all omitted) exit non-zero with clear message
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: run `query inspect`, `query translate`, `search --dry-run` on a sample file
- [x] Acceptance: All tests pass, feature works in real usage; close #155 via PR

## Notes

- Raw YAML is copied into the session as `query_common.yaml`, so no session schema change is expected.
- Keep translators untouched — all logic lives in the resolution layer.
