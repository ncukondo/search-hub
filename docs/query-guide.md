# Query Guide

This guide explains how to write query files for search-hub.

## Getting Started

The easiest way to create a query file is with `query init`:

```bash
search-hub query init -o query.yaml
```

This generates a YAML template and a `query.schema.json` file. The template includes a `$schema` comment that enables autocompletion and inline validation in editors with YAML language support (e.g., VS Code with the Red Hat YAML extension).

## Basic Structure

Query files use YAML format:

```yaml
# yaml-language-server: $schema=./query.schema.json
name: my_search
description: "Description of this search"

query:
  - field: title_abstract
    terms:
      keywords:
        - term1
        - term2
    operator: OR

filters:
  year_from: 2020
  language:
    - en
```

## Fields

| Field | Description | Notes |
|-------|-------------|-------|
| `name` | Query identifier | Required. Used for session naming |
| `description` | Human-readable description | Optional |
| `query` | List of query blocks | Required |
| `filters` | Global filters | Optional |
| `overrides` | Database-specific settings | Optional |

## Query Blocks

Each query block specifies:
- **field**: Where to search
- **terms**: What to search for
- **operator**: How to combine terms (OR or AND)

Multiple blocks are combined with AND.

### Search Fields

| Field | Description |
|-------|-------------|
| `title` | Title only |
| `abstract` | Abstract only |
| `title_abstract` | Title or abstract |
| `author` | Author name |
| `keyword` | Keywords/descriptors |
| `all` | All fields |

### Terms

Each term block requires at least one of `keywords`, `mesh`, `eric`, or `emtree`. The `keywords` field is optional when controlled vocabulary terms are provided.

```yaml
terms:
  keywords:           # Free-text terms (all databases)
    - diabetes
    - "type 2 diabetes"    # Phrase (use quotes)
    - diabet*              # Wildcard

  mesh:               # MeSH terms (PubMed only)
    - "Diabetes Mellitus, Type 2"

  eric:               # ERIC Descriptors (ERIC only)
    - "Medical Education"
    - "Clinical Experience"

  emtree:             # Emtree terms (Scopus/Embase only)
    - "diabetes mellitus"

  exclude:            # Terms to exclude (NOT operator)
    - "unwanted term"
```

Within a term block:
1. All keywords are OR'd together
2. All controlled vocabulary terms (MeSH, ERIC, Emtree) are OR'd together
3. Results are combined: keywords OR controlled vocabulary
4. Exclude terms are applied with NOT

**Database-specific controlled vocabularies:**
- **PubMed**: `mesh` - Medical Subject Headings
- **ERIC**: `eric` - ERIC Descriptors (from ERIC Thesaurus)
- **Scopus**: `emtree` - Emtree terms

When a query contains vocabulary not supported by a provider (e.g., `emtree` terms queried against PubMed), those terms are ignored for that provider. If the block has keywords, they are still searched. If the block has only unsupported vocabulary, it is skipped entirely. Warnings are shown during `query translate` and `search --dry-run`.

## Filters

```yaml
filters:
  year_from: 2020        # Start year
  year_to: 2024          # End year
  language:
    - en                 # English
    - ja                 # Japanese
  publication_types:
    include:
      - "Journal Article"
    exclude:
      - "Review"
```

## Database-Specific Overrides

Customize queries for specific databases:

```yaml
overrides:
  pubmed:
    filters:
      publication_types:
        exclude:
          - "Comment"

  arxiv:
    categories:          # arXiv categories
      - cs.AI
      - cs.LG
```

## Complete Example

```yaml
# yaml-language-server: $schema=./query.schema.json
name: diabetes_ai_review
description: "AI in diabetes management - scoping review"

query:
  # Block 1: Diabetes terms
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - "type 2 diabetes"
        - T2DM
      mesh:
        - "Diabetes Mellitus, Type 2"
      emtree:
        - "diabetes mellitus"
    operator: OR

  # Block 2: AI terms
  - field: title_abstract
    terms:
      keywords:
        - "machine learning"
        - "artificial intelligence"
        - "deep learning"
      mesh:
        - "Machine Learning"
    operator: OR

filters:
  year_from: 2018
  language:
    - en

overrides:
  arxiv:
    categories:
      - cs.AI
      - cs.LG
```

This translates to: `(diabetes terms) AND (AI terms) AND (filters)`

Each provider receives only the vocabulary it supports: PubMed uses `mesh`, Scopus uses `emtree`, and all providers use `keywords`.

## Vocabulary Validation

`query validate` automatically checks controlled vocabulary terms against external APIs:

- **MeSH terms** are validated against the NLM MeSH Lookup API. Typos receive correction suggestions (e.g., "Diabetse Mellitus" suggests "Diabetes Mellitus").
- **ERIC descriptors** and **Emtree terms** are validated via count-only search (valid if the term returns hits).

Results are cached locally to avoid repeated API calls. Use `--no-vocab` to skip validation, or `--no-cache` to bypass the cache.

```bash
# Validate structure and vocabulary
search-hub query validate query.yaml

# Skip vocabulary validation
search-hub query validate query.yaml --no-vocab
```

## Tips

1. **Use `query init`**: Generate a template with JSON Schema for editor autocompletion
2. **Start simple**: Begin with keywords, add controlled vocabulary as needed
3. **Validate first**: Run `search-hub query validate` to check structure and vocabulary terms
4. **Preview translations**: Use `search-hub query translate` to see database-native syntax and warnings
5. **Use dry-run**: Test with `search-hub search --dry-run` before actual search
6. **Check hit counts**: Use `search-hub search --count-only` to estimate result sizes quickly
