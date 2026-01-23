# Query Guide

This guide explains how to write query files for search-hub.

## Basic Structure

Query files use YAML format:

```yaml
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

```yaml
terms:
  keywords:           # Free-text terms (all databases)
    - diabetes
    - "type 2 diabetes"    # Phrase (use quotes)
    - diabet*              # Wildcard

  mesh:               # MeSH terms (PubMed only)
    - "Diabetes Mellitus, Type 2"
```

Within a term block:
1. All keywords are OR'd together
2. All MeSH terms are OR'd together
3. Results are combined: keywords OR mesh

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

## Tips

1. **Start simple**: Begin with keywords, add complexity as needed
2. **Validate first**: Run `search-hub query validate` before searching
3. **Preview translations**: Use `search-hub query translate` to see database-native syntax
4. **Use dry-run**: Test with `search-hub search --dry-run` before actual search
