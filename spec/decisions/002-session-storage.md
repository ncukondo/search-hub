# ADR-002: Session Storage Design

## Status

Accepted (extended by [ADR-006](006-yaml-human-readable-layer.md))

## Context

Long-running searches may be interrupted. We need to:
1. Resume from where we left off
2. Maintain audit trail for PRISMA
3. Handle partial failures gracefully

Options considered:
1. **Single JSON file** - Simple but doesn't scale
2. **SQLite database** - Powerful but complex for CLI tool
3. **Directory structure with JSONL** - Append-only, streamable

## Decision

Use directory-based storage with JSON Lines format:

```
<data-dir>/sessions/  # Platform-specific, e.g., ~/.local/share/search-hub/sessions on Linux
└── {session-id}/
    ├── session.json      # Metadata and status
    ├── query_*.txt       # Translated queries
    ├── results_*.jsonl   # Results (append-only)
    └── log.jsonl         # Event log
```

Key design choices:
- **JSONL for results**: Append-only, crash-safe, streamable
- **Separate files per DB**: Independent resume, easy to debug
- **Event log**: Full audit trail for debugging

## Consequences

### Positive

- Crash-safe (append-only writes)
- Memory-efficient (streaming)
- Easy to inspect/debug
- Per-database resume granularity

### Negative

- Multiple files to manage
- More filesystem operations
- No complex queries (like SQLite)

### Neutral

- Session ID includes timestamp for natural ordering
- Old sessions can be manually archived
