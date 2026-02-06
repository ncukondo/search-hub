# ADR-006: YAML as Human-Readable Layer in Session Storage

## Status

Accepted

## Context

ADR-002 established JSONL as the storage format for session results, chosen for its append-only, crash-safe, and streamable properties. These properties remain essential during search execution.

However, hands-on use of the tool for iterative query refinement (6 iterations across a WBA + generative AI literature search) revealed that:

1. **Results are not human-readable**: Inspecting search results required exporting to JSON and writing scripts to parse them. Users cannot simply open `results_pubmed.jsonl` in an editor to scan titles.
2. **Session-level judgments are ephemeral**: Qualitative assessments of search quality (e.g., "MeSH too broad", "precision ~54%") were made verbally and lost between sessions.
3. **JSONL serves dual purposes poorly**: It stores both raw provider data (`rawResponse`) and human-relevant metadata (title, abstract, journal) in the same opaque format.

Options considered:
1. **Replace JSONL with YAML entirely** — Loses crash-safety and streaming during search
2. **Add YAML as derived view alongside JSONL** — Both formats serve their purpose
3. **Improve CLI tooling only (no format change)** — Files remain unreadable in editors

## Decision

Adopt a **two-layer data model** within session directories:

- **JSONL layer** (machine-oriented): Raw, complete data written during search. Retained as archive.
- **YAML layer** (human-oriented): Derived views generated after search completion, plus user-authored annotations.

Updated session directory structure (extends ADR-002):

```
{session-id}/
├── session.yaml           # Metadata and status
├── query_common.yaml      # Original query (unchanged)
├── pubmed_query.txt       # Translated query (unchanged)
├── pubmed_results.jsonl   # Raw results archive (rawResponse included)
├── pubmed_results.yaml    # Human-readable results view (rawResponse excluded)
└── notes.yaml             # User annotations and assessments
```

Key principles:
- **JSONL is the source of truth** for complete data including `rawResponse`
- **YAML is a derived view** generated from JSONL at search completion, excluding `rawResponse` and null fields
- **notes.yaml is user-authored** — free-form annotations and structured assessments in a human-editable format
- **Read operations prefer YAML** when available, fall back to JSONL for in-progress or legacy sessions

## Consequences

### Positive

- Session directories become self-documenting and browsable in any editor
- Search strategy decisions are recorded alongside results (important for systematic review documentation)
- Raw data is preserved for full-fidelity re-export or debugging
- Backward compatible — legacy JSONL-only sessions continue to work via fallback

### Negative

- Disk usage increases slightly (YAML + JSONL for completed sessions)
- Additional conversion step after search completion
- Two representations of the same data to keep consistent (mitigated by YAML being derived, not edited)

### Neutral

- YAML is already a project dependency (used for query files)
- The conversion overhead is negligible for typical result sizes (50-500 articles)
