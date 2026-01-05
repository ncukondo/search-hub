# Query DSL Specification

YAML-based domain-specific language for defining search queries that translate to multiple database syntaxes.

## File Structure

```yaml
# query.yaml
name: string                      # Required: query identifier
description: string               # Optional: human-readable description

query:                            # Required: list of query blocks
  - field: FieldType
    terms: TermBlock
    operator: "AND" | "OR"        # How to combine terms within block

filters:                          # Optional: global filters
  year_from: number
  year_to: number
  language: string[]
  publication_types:
    include: string[]
    exclude: string[]

overrides:                        # Optional: DB-specific customizations
  pubmed: OverrideBlock
  scopus: OverrideBlock
  ...
```

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

Terms can include keywords and controlled vocabularies:

```yaml
terms:
  keywords:                       # Free-text terms (all DBs)
    - diabetes
    - "type 2 diabetes"           # Phrase search
    - diabet*                     # Wildcard (where supported)

  mesh:                           # MeSH terms (PubMed only)
    - "Diabetes Mellitus, Type 2"
    - "Diabetes Mellitus"

  emtree:                         # Emtree terms (Embase only)
    - "non insulin dependent diabetes mellitus"
```

### Term Combination Logic

Within a TermBlock, terms combine as:
1. All keywords → OR'd together
2. All MeSH terms → OR'd together
3. All Emtree terms → OR'd together
4. keyword-group OR mesh-group OR emtree-group

For DBs that don't support a vocabulary, those terms are ignored.

## Operators

```yaml
query:
  - field: title_abstract
    terms: { keywords: [diabetes] }
    operator: OR                  # Within this block

  - field: title_abstract
    terms: { keywords: [AI] }
    operator: OR

# Blocks are AND'd together by default
# Result: (diabetes[tiab]) AND (AI[tiab])
```

## Filters

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

## DB-Specific Overrides

Override or extend the common query for specific databases:

```yaml
overrides:
  pubmed:
    filters:
      publication_types:
        exclude:
          - "Comment"
          - "Letter"

  arxiv:
    categories:                   # arXiv-specific
      - cs.AI
      - cs.LG
      - q-bio

  scopus:
    source_types:                 # Scopus-specific
      - journal
      - conference
```

## Complete Example

```yaml
name: diabetes_ai_scoping
description: "AI applications in Type 2 Diabetes management"

query:
  - field: title_abstract
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

  - field: title_abstract
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

  - field: title_abstract
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

overrides:
  pubmed:
    filters:
      publication_types:
        exclude:
          - "Review"
          - "Systematic Review"
          - "Meta-Analysis"

  arxiv:
    categories:
      - cs.AI
      - cs.LG
      - cs.CL
      - q-bio.QM
```

## Query AST

Internal representation after parsing.

See `src/query/types.ts` for the authoritative type definitions:
- `QueryAST` - Complete parsed query structure
- `QueryBlock` - Individual query block with field, terms, and operator
- `Filters` - Global filter settings (year range, languages, publication types)
- `OverrideBlock` - Provider-specific overrides

## Translation Rules

Each provider implements `translateQuery(ast: QueryAST): string`.

See individual provider specs for translation details:
- `providers/pubmed.md`
- `providers/eric.md`
- `providers/arxiv.md`
- `providers/scopus.md`
