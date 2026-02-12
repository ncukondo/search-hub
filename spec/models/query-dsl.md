# Query DSL Specification

YAML-based domain-specific language for defining search queries that translate to multiple database syntaxes.

## Design Principles

1. **One file = one search intent** — A single YAML file represents one search intent across all providers
2. **Default + provider customization** — Common query blocks serve all providers; provider-specific sections customize where strategies diverge
3. **Explicit actions** — `replaces` means replacement, `adds` means additive; no implicit merge semantics
4. **Named concept blocks** — Every block has an `id` that links it across default and provider sections

## File Structure

```yaml
# query.yaml
name: string                      # Required: query display name
description: string               # Optional: human-readable description

query:                            # Required: list of query blocks
  - id: string                   # Required: unique block identifier
    field: FieldType
    terms: TermBlock
    operator: "AND" | "OR"        # How to combine terms within block

filters:                          # Optional: default filters (all providers)
  year_from: number
  year_to: number
  language: string[]
  publication_types:
    include: string[]
    exclude: string[]

providers:                        # Optional: provider-specific customizations
  pubmed: ProviderSection
  scopus: ProviderSection
  eric: ProviderSection
  arxiv: ProviderSection
```

## Query Blocks

Each block represents a search concept (e.g., population, intervention) and must have a unique `id`.

```yaml
query:
  - id: population
    field: title_abstract
    terms:
      keywords: [diabetes, "type 2 diabetes"]
      mesh: ["Diabetes Mellitus, Type 2"]
    operator: OR

  - id: intervention
    field: title_abstract
    terms:
      keywords: ["artificial intelligence", "machine learning"]
      mesh: ["Artificial Intelligence"]
    operator: OR
```

The `id` serves as:
- A reference key in `providers.{name}.replaces`
- A label in CLI output (e.g., `query inspect`, `query translate`)
- A conceptual identifier (often maps to PICO elements in systematic reviews)

## Field Types

| Field | Description | PubMed | Scopus | ERIC | arXiv |
|-------|-------------|--------|--------|------|-------|
| `title` | Title only | [ti] | TITLE() | title: | ti: |
| `abstract` | Abstract only | [ab] | ABS() | abstract: | abs: |
| `title_abstract` | Title OR Abstract | [tiab] | TITLE-ABS() | - | - |
| `author` | Author name | [au] | AUTH() | author: | au: |
| `keyword` | Keywords/descriptors | [mh] | KEY() | descriptor: | - |
| `all` | All fields | [all] | ALL() | - | all: |

## Term Block

Terms can include keywords, controlled vocabularies, and exclusions.
At least one of `keywords`, `mesh`, `emtree`, or `eric` is required per block:

```yaml
terms:
  keywords:                       # Free-text terms (all DBs, optional)
    - diabetes
    - "type 2 diabetes"           # Phrase search
    - diabet*                     # Wildcard (where supported)

  mesh:                           # MeSH terms (PubMed only, optional)
    - "Diabetes Mellitus, Type 2"
    - "Diabetes Mellitus"

  emtree:                         # Emtree terms (Embase only, optional)
    - "non insulin dependent diabetes mellitus"

  eric:                           # ERIC Descriptors (ERIC only, optional)
    - "Diabetes"

  exclude:                        # Terms to exclude (NOT operator)
    - "environmental protection"  # Use when terms are ambiguous
    - "pollution"
```

A block with only controlled vocabulary (no keywords) is valid:

```yaml
# MeSH-only block — common in systematic reviews
- id: ai_mesh
  field: title_abstract
  terms:
    mesh:
      - "Artificial Intelligence"
      - "Machine Learning"
  operator: OR
```

### Exclude Terms

The `exclude` field allows filtering out irrelevant results using NOT operators. This is useful when search terms have multiple meanings:

```yaml
# Example: Searching for EPA (Entrustable Professional Activities)
# but excluding results about EPA (Environmental Protection Agency)
query:
  - id: epa
    field: title_abstract
    terms:
      keywords:
        - EPA
        - "entrustable professional activities"
      exclude:
        - "environmental protection"
        - pollution
        - agency
    operator: OR
```

Provider-specific NOT syntax:
| Provider | Syntax |
|----------|--------|
| PubMed | `NOT term[field]` |
| Scopus | `AND NOT FIELD(term)` |
| ERIC | `NOT field:term` |
| arXiv | `ANDNOT prefix:term` |

### Term Combination Logic

Within a TermBlock, terms combine as:
1. All keywords → OR'd together
2. All MeSH terms → OR'd together
3. All Emtree terms → OR'd together
4. keyword-group OR mesh-group OR emtree-group
5. Exclude terms → applied as NOT clause to the block

For DBs that don't support a vocabulary, those terms are ignored.

## Operators

```yaml
query:
  - id: concept_a
    field: title_abstract
    terms: { keywords: [diabetes] }
    operator: OR                  # Within this block

  - id: concept_b
    field: title_abstract
    terms: { keywords: [AI] }
    operator: OR

# Blocks are AND'd together by default
# Result: (diabetes[tiab]) AND (AI[tiab])
```

## Filters

Default filters apply to all providers. Provider-specific filters can be added via the `providers` section.

```yaml
filters:
  year_from: 2020
  year_to: 2024
  language:
    - en
    - ja
  publication_types:
    include:
      - "Journal Article"
    exclude:
      - "Review"
      - "Meta-Analysis"
```

Provider-specific filter types (also part of the `Filters` type):

| Filter | Applicable Provider | Description |
|--------|---------------------|-------------|
| `categories` | arXiv | arXiv subject categories (e.g., `cs.AI`) |
| `source_types` | Scopus | Source types (e.g., `journal`, `conference`) |

## Provider Section

The `providers` section contains two explicit action keys:

- **`replaces`** — Named block replacement (the only override mechanism)
- **`adds`** — Additive configuration (filters merged with defaults)

```yaml
providers:
  arxiv:
    replaces:
      population:                          # Replaces the default "population" block
        field: all
        terms:
          keywords: [diabetes, "type 2 diabetes", T2DM, "diabetic patients"]
        operator: OR
    adds:
      filters:
        categories: [cs.AI, cs.LG, q-bio.QM]

  pubmed:
    adds:
      filters:
        publication_types:
          exclude: ["Review", "Systematic Review", "Meta-Analysis"]

  scopus:
    adds:
      filters:
        source_types: [journal, conference]
```

### Reading Rules

```
providers.{name}:
  replaces  → Replace the named block entirely for this provider
  adds      → Merge into default configuration for this provider
```

- A block **not mentioned** in `replaces` → default block is used as-is
- A block **mentioned** in `replaces` → default block is completely replaced
- `adds.filters` → deep-merged with default `filters` (arrays replace, scalars replace, objects recurse)

### Filter Merge Semantics

| Default | Provider `adds.filters` | Resolved |
|---------|------------------------|----------|
| `year_from: 2018` | *(not set)* | `year_from: 2018` |
| `year_from: 2018` | `year_from: 2020` | `year_from: 2020` |
| *(not set)* | `categories: [cs.AI]` | `categories: [cs.AI]` |
| `language: [en]` | `language: [en, ja]` | `language: [en, ja]` |

Arrays are **replaced** (not appended). Scalars are replaced. Objects are recursively merged.

## Resolution Layer

Before translation, the query AST is resolved for a specific provider using `resolveForProvider(ast, providerName)`. This produces a `ResolvedAST` with:

- Blocks: default blocks with any `replaces` applied
- Filters: default filters deep-merged with `adds.filters`

Translators receive `ResolvedAST` and do not need to handle provider sections themselves.

```
QueryAST ──→ resolveForProvider(ast, 'arxiv') ──→ ResolvedAST ──→ translateQuery(resolved)
```

## Complete Example

```yaml
name: diabetes_ai_scoping
description: "AI applications in Type 2 Diabetes management"

query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - "type 2 diabetes"
        - "diabetes mellitus"
        - T2DM
      mesh:
        - "Diabetes Mellitus, Type 2"
        - "Diabetes Mellitus"
    operator: OR

  - id: intervention
    field: title_abstract
    terms:
      keywords:
        - "artificial intelligence"
        - "machine learning"
        - "deep learning"
        - "neural network"
      mesh:
        - "Artificial Intelligence"
        - "Machine Learning"
        - "Deep Learning"
    operator: OR

  - id: outcome
    field: title_abstract
    terms:
      keywords:
        - diagnosis
        - prediction
        - management
        - treatment
    operator: OR

filters:
  year_from: 2018
  year_to: 2024
  language:
    - en

providers:
  arxiv:
    replaces:
      population:
        field: all
        terms:
          keywords:
            - diabetes
            - "type 2 diabetes"
            - T2DM
            - "diabetic patients"
            - "glucose monitoring"
        operator: OR
      intervention:
        field: all
        terms:
          keywords:
            - "artificial intelligence"
            - "machine learning"
            - "deep learning"
            - "neural network"
            - "transformer model"
            - "large language model"
        operator: OR
    adds:
      filters:
        categories:
          - cs.AI
          - cs.LG
          - cs.CL
          - q-bio.QM

  pubmed:
    adds:
      filters:
        publication_types:
          exclude:
            - "Review"
            - "Systematic Review"
            - "Meta-Analysis"
```

## Query AST

Internal representation after parsing.

See `src/query/types.ts` for the authoritative type definitions:
- `QueryAST` - Complete parsed query structure (with `providers` section)
- `QueryBlock` - Individual query block with `id`, field, terms, and operator
- `Filters` - Filter settings (year range, languages, publication types, categories, source types)
- `ProviderSection` - Provider-specific customizations (`replaces` and `adds`)
- `ResolvedAST` - Provider-resolved query (blocks and filters fully merged, no `providers` section)

## Translation Rules

Each provider implements `translateQuery(resolved: ResolvedAST): TranslatedQuery`.

The resolution layer (`resolveForProvider`) applies provider-specific block replacements and filter merges before the query reaches the translator. Translators only see a flat, resolved AST.

See individual provider specs for translation details:
- `providers/pubmed.md`
- `providers/eric.md`
- `providers/arxiv.md`
- `providers/scopus.md`
