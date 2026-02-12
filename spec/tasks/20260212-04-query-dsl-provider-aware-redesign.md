# Task: Query DSL Provider-Aware Redesign

## Purpose

Redesign the query DSL to support provider-specific search strategies within a single query file. The current `overrides` model only allows filter customization per provider; when search strategies diverge significantly (e.g., arXiv requiring different keywords and fields vs. PubMed), users must create separate query files and merge results manually.

The new design introduces:
1. **Named concept blocks** (`id` on every `QueryBlock`) — links blocks across default and provider sections
2. **`providers` section** with `replaces` (block replacement) and `adds` (filter merging) — explicit, self-documenting actions
3. **Resolution layer** (`resolveForProvider`) — resolves provider-specific blocks and filters before translation, simplifying translators
4. **Unified `Filters`** — `categories` (arXiv) and `sourceTypes` (Scopus) move into `Filters`, eliminating `OverrideBlock`

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) — updated DSL specification (already updated)

## Related Source Files

### Core types and parsing
- `src/query/types.ts` — `QueryBlock`, `QueryAST`, `Filters`, `OverrideBlock` (to remove)
- `src/query/validator.ts` — Zod schemas for YAML validation
- `src/query/parser.ts` — YAML parsing
- `src/query/json-schema.ts` — JSON Schema generation for editor support
- `src/query/index.ts` — module exports

### Resolution layer (new)
- `src/query/resolver.ts` — new file: `resolveForProvider(ast, providerName)`

### Translators (signature change: `QueryAST` → `ResolvedAST`)
- `src/providers/base/types.ts` — `Provider` interface (`translateQuery` signature)
- `src/providers/base/provider.ts` — `BaseProvider` abstract class
- `src/providers/pubmed/translator.ts` — remove override handling
- `src/providers/scopus/translator.ts` — remove override handling
- `src/providers/arxiv/translator.ts` — remove override handling
- `src/providers/eric/translator.ts` — no override handling (unchanged logic)
- `src/providers/pubmed/provider.ts`
- `src/providers/scopus/provider.ts`
- `src/providers/arxiv/provider.ts`
- `src/providers/eric/provider.ts`

### CLI integration
- `src/cli/commands/search-executor.ts` — `translateQueryForProvider` → use resolver
- `src/cli/commands/query/translate.ts` — use resolver

## Design

### Type Changes

```typescript
// QueryBlock: add required id
interface QueryBlock {
  id: string;                    // NEW: required unique identifier
  field: FieldType;
  terms: TermBlock;
  operator: Operator;
}

// Filters: absorb categories and sourceTypes from OverrideBlock
interface Filters {
  yearFrom?: number;
  yearTo?: number;
  languages?: string[];
  publicationTypes?: PublicationTypeFilter;
  categories?: string[];         // NEW: moved from OverrideBlock (arXiv)
  sourceTypes?: string[];        // NEW: moved from OverrideBlock (Scopus)
}

// ProviderSection: replaces OverrideBlock
interface ProviderSection {
  replaces?: Record<string, Omit<QueryBlock, 'id'>>;
  adds?: {
    filters?: Partial<Filters>;
  };
}

// QueryAST: overrides → providers
interface QueryAST {
  name: string;
  description?: string;
  blocks: QueryBlock[];
  filters: Filters;
  providers?: Partial<Record<ProviderName, ProviderSection>>;
}

// ResolvedAST: NEW — output of resolveForProvider
interface ResolvedAST {
  name: string;
  description?: string;
  blocks: QueryBlock[];          // default blocks with replaces applied
  filters: Filters;              // default filters deep-merged with adds.filters
}
```

### Resolution Layer

```typescript
function resolveForProvider(ast: QueryAST, provider: ProviderName): ResolvedAST
```

- Applies `providers[provider].replaces` — matched blocks fully replaced, unmatched blocks kept as-is
- Deep-merges `providers[provider].adds.filters` into `ast.filters`
- Returns a flat `ResolvedAST` with no `providers` section

### Translator Signature Change

```typescript
// Before
translateQuery(ast: QueryAST): TranslatedQuery

// After
translateQuery(resolved: ResolvedAST): TranslatedQuery
```

Translators no longer need to read `ast.overrides` — all resolution is done upstream.

## Implementation Steps

### Step 1: Update types

- [ ] Write test: `src/query/types.test.ts`
  - `QueryBlock` requires `id` field
  - `Filters` accepts `categories` and `sourceTypes`
  - `ProviderSection` accepts `replaces` and `adds`
  - `QueryAST` has `providers` instead of `overrides`
  - `ResolvedAST` has no `providers` field
  - Existing `OverrideBlock` tests → replaced by `ProviderSection` tests
- [ ] Update `src/query/types.ts`
  - Add `id: string` to `QueryBlock`
  - Add `categories?: string[]` and `sourceTypes?: string[]` to `Filters`
  - Remove `OverrideBlock` interface
  - Add `ProviderSection` interface
  - Add `ResolvedAST` interface
  - Change `QueryAST.overrides` → `QueryAST.providers`
- [ ] Verify test fails (Red) → Implement → Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck` — expect type errors in downstream files (OK at this step)
- [ ] Acceptance: types compile, type tests pass

### Step 2: Update Zod schemas

- [ ] Write test: `src/query/validator.test.ts`
  - Schema accepts `id` in query blocks
  - Schema accepts `providers` with `replaces` and `adds`
  - Schema rejects `overrides` (removed)
  - Schema rejects blocks without `id`
  - Cross-validation: `replaces` keys must reference existing block `id`s
  - Cross-validation: when `providers` exists, all blocks must have `id`
  - `adds.filters` accepts `categories` and `sourceTypes`
- [ ] Update `src/query/validator.ts`
  - Add `id` to `queryBlockSchema` (required)
  - Remove `overrideBlockSchema` and `overridesSchema`
  - Add `providerSectionSchema` with `replaces` and `adds`
  - Update `queryFileSchema` to use `providers` instead of `overrides`
  - Add `categories` and `sourceTypes` to `filtersSchema`
  - Add `.refine()` for cross-field validation
- [ ] Verify test fails (Red) → Implement → Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: validation tests pass, invalid inputs rejected with clear errors

### Step 3: Update parser

- [ ] Write test: `src/query/parser.test.ts`
  - Parses YAML with `id` on blocks
  - Parses `providers` section with `replaces` and `adds`
  - Correctly maps `providers.{name}.replaces` to `ProviderSection`
  - Correctly maps `providers.{name}.adds.filters` to partial `Filters`
  - Backward-compat: old `overrides` format produces clear error message
- [ ] Update `src/query/parser.ts`
  - Update YAML-to-AST mapping for new structure
  - `overrides` → `providers` key mapping
  - `id` extraction from blocks
- [ ] Verify test fails (Red) → Implement → Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: parser tests pass

### Step 4: Implement resolution layer

- [ ] Write test: `src/query/resolver.test.ts`
  - No providers section → returns blocks and filters unchanged
  - `replaces` for one block → that block replaced, others unchanged
  - `replaces` for multiple blocks → all replaced correctly
  - `adds.filters` merges with default filters (scalars replace, arrays replace, objects deep-merge)
  - `adds.filters` with no default filters → filters set from adds
  - Provider not in `providers` → returns default as-is
  - `replaces` references non-existent id → error (should be caught by validator, but defensive)
- [ ] Create `src/query/resolver.ts`
  - `resolveForProvider(ast: QueryAST, provider: ProviderName): ResolvedAST`
  - `deepMergeFilters(base: Filters, override: Partial<Filters>): Filters`
- [ ] Verify test fails (Red) → Implement → Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: resolver tests pass, all merge semantics verified

### Step 5: Update translator signatures and remove override handling

- [ ] Update `src/providers/base/types.ts`
  - `translateQuery(resolved: ResolvedAST): TranslatedQuery`
- [ ] Update `src/providers/base/provider.ts`
  - Abstract method signature change
- [ ] Update PubMed translator (`src/providers/pubmed/translator.ts`)
  - Accept `ResolvedAST` instead of `QueryAST`
  - Remove `mergeFilters(ast.filters, pubmedOverride?.filters)` — filters already merged
  - Use `resolved.filters` directly
  - Update tests in `src/providers/pubmed/translator.test.ts`
- [ ] Update Scopus translator (`src/providers/scopus/translator.ts`)
  - Accept `ResolvedAST`
  - Remove `ast.overrides.scopus` references
  - Use `resolved.filters.sourceTypes` directly
  - Update tests in `src/providers/scopus/translator.test.ts`
- [ ] Update arXiv translator (`src/providers/arxiv/translator.ts`)
  - Accept `ResolvedAST`
  - Remove `ast.overrides.arxiv` references
  - Use `resolved.filters.categories` directly
  - Update tests in `src/providers/arxiv/translator.test.ts`
- [ ] Update ERIC translator (`src/providers/eric/translator.ts`)
  - Accept `ResolvedAST` (minimal change — ERIC had no override handling)
  - Update tests in `src/providers/eric/translator.test.ts`
- [ ] Update all 4 provider classes (`*/provider.ts`) to match new signature
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: all translator tests pass

### Step 6: Wire resolver into CLI

- [ ] Update `src/cli/commands/search-executor.ts`
  - Replace `translateQueryForProvider` switch with: resolve → translate pipeline
  - Import and use `resolveForProvider`
  - Update tests in `src/cli/commands/search-executor.test.ts`
- [ ] Update `src/cli/commands/query/translate.ts`
  - Use resolver before translator
  - Update tests in `src/cli/commands/query/translate.test.ts`
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: CLI tests pass

### Step 7: Update JSON Schema and exports

- [ ] Update `src/query/json-schema.ts`
  - Add `id` to block schema
  - Replace `overrides` with `providers` structure
  - Add `categories` and `sourceTypes` to filters schema
  - Update tests in `src/query/json-schema.test.ts`
- [ ] Update `src/query/index.ts`
  - Export `ProviderSection`, `ResolvedAST`, `resolveForProvider`
  - Remove `OverrideBlock` export
  - Update tests in `src/query/index.test.ts`
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: all module tests pass

### Step 8: Update mock providers and remaining test fixtures

- [ ] Update `src/providers/base/provider.test.ts` — mock provider signature
- [ ] Update `src/providers/base/registry.test.ts` — mock provider signature
- [ ] Update `src/providers/base/mock-provider.ts` — signature change
- [ ] Update `src/query/vocab-validator.test.ts` — mock provider updates
- [ ] Search codebase for remaining `overrides` references and update
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: zero test failures, zero type errors

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/query/resolver.e2e.test.ts`
  - Parse a YAML file with `providers` section → resolve → translate → verify native queries
  - Parse a YAML file without `providers` → resolve → translate → verify (backward compat for no-override case)
  - Verify arXiv gets custom blocks while PubMed gets defaults
  - Verify filter merging produces correct native query filters
- [ ] Update existing E2E tests that use `overrides` in query fixtures
  - `src/cli/commands/search.e2e.test.ts`
  - `src/cli/commands/query/validate.e2e.test.ts`
  - `src/cli/commands/query/translate.e2e.test.ts` (if exists)
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Create a query YAML with `providers` section, run `query translate`, verify output
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- This is a breaking change. All existing query YAML files with `overrides` must be migrated to `providers` + `adds`.
- The `query init` template (`src/cli/commands/query/init.ts`) should be updated to generate the new format.
- Test files are co-located with source files (`*.test.ts`).
- The `query inspect` command (showing provider×block matrix) is a separate task that depends on this one.
