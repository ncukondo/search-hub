# ADR-001: Query DSL Design

## Status

Accepted

## Context

Scoping reviews require reproducible searches across multiple databases. Each database has its own query syntax:
- PubMed: `[tiab]`, `[mh]` field tags
- Scopus: `TITLE-ABS-KEY()` functions
- ERIC: `title:`, `abstract:` prefixes
- arXiv: `ti:`, `abs:` prefixes

Users need to:
1. Write a query once and run across all databases
2. Use database-specific features (MeSH for PubMed, categories for arXiv)
3. Reproduce exact searches for PRISMA reporting

Options considered:
1. **Simple boolean string** - Easy to write, hard to translate accurately
2. **PubMed-style syntax** - Familiar to medical researchers, tied to one DB
3. **Structured YAML DSL** - Verbose but unambiguous, extensible

## Decision

Use YAML-based DSL with hybrid controlled vocabulary support:

```yaml
query:
  - field: title_abstract
    terms:
      keywords: [diabetes, "type 2 diabetes"]
      mesh: ["Diabetes Mellitus, Type 2"]
    operator: OR

overrides:
  arxiv:
    categories: [cs.AI, cs.LG]
```

Key design choices:
- **Keywords** apply to all databases
- **Controlled vocabularies** (mesh, emtree) only apply to supporting databases
- **Overrides** allow database-specific customization
- **Filters** (year, language) translate to each DB's syntax

## Consequences

### Positive

- Single source of truth for multi-database searches
- Explicit controlled vocabulary handling
- Easy to extend for new databases
- Machine-readable for PRISMA reporting

### Negative

- Learning curve for YAML syntax
- More verbose than simple boolean
- Translation logic per database

### Neutral

- Query files can be version-controlled
- Requires validation before execution
