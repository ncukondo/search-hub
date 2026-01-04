# Session Specification

Sessions track search progress, enable resume, and provide audit trails for PRISMA reporting.

## Session Directory Structure

```
~/.search-hub/sessions/
└── {session-id}/
    ├── session.json              # Session metadata & status
    ├── query_common.yaml         # Original query file (copy)
    ├── query_pubmed.txt          # Translated PubMed query
    ├── query_eric.txt            # Translated ERIC query
    ├── query_arxiv.txt           # Translated arXiv query
    ├── query_scopus.txt          # Translated Scopus query
    ├── results_pubmed.jsonl      # Results (JSON Lines format)
    ├── results_eric.jsonl
    ├── results_arxiv.jsonl
    ├── results_scopus.jsonl
    └── log.jsonl                 # Event log
```

## Session ID Format

`{date}_{name}_{hash}`

- `date`: YYYYMMDD format
- `name`: Sanitized query name (lowercase, alphanumeric, dashes)
- `hash`: First 6 chars of query file hash

Example: `20240115_diabetes-ai-scoping_a3f2c1`

## session.json Schema

```typescript
interface SessionFile {
  version: 1;                     // Schema version
  id: string;
  name: string;                   // From query.name
  description?: string;           // From query.description
  createdAt: string;              // ISO 8601
  updatedAt: string;              // ISO 8601

  // Query info
  query: {
    file: string;                 // Original file path
    hash: string;                 // SHA-256 of original
    targets: ProviderName[];      // DBs to search
  };

  // Per-DB status
  databases: Record<ProviderName, DatabaseStatus>;

  // Summary
  summary: {
    totalHits: number;            // Sum of all DB hits
    totalRetrieved: number;       // Sum of all retrieved
    status: SessionStatus;
  };
}

interface DatabaseStatus {
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  totalHits?: number;
  retrievedCount?: number;

  // Pagination state (for resume)
  pagination?: {
    cursor: string | null;
    pageNumber: number;
    isComplete: boolean;
  };

  // Error info
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };

  // File paths (relative to session dir)
  files: {
    query: string;                // e.g., "query_pubmed.txt"
    results: string;              // e.g., "results_pubmed.jsonl"
  };
}

type SessionStatus = 'created' | 'running' | 'completed' | 'partial' | 'failed';
```

## Results File Format

JSON Lines format (one Article per line) for streaming and partial reads:

```jsonl
{"doi":"10.1234/example1","title":"...","authors":[...],...}
{"doi":"10.1234/example2","title":"...","authors":[...],...}
```

Benefits:
- Append-only (safe for crashes)
- Streamable (low memory)
- Easy to count lines
- Easy to merge/dedupe with standard tools

## Log File Format

Event log for debugging and audit:

```jsonl
{"ts":"2024-01-15T10:00:00Z","event":"session_created","data":{...}}
{"ts":"2024-01-15T10:00:01Z","event":"search_started","provider":"pubmed"}
{"ts":"2024-01-15T10:00:02Z","event":"page_fetched","provider":"pubmed","page":1,"count":100}
{"ts":"2024-01-15T10:00:05Z","event":"rate_limited","provider":"pubmed","waitMs":1000}
{"ts":"2024-01-15T10:01:00Z","event":"search_completed","provider":"pubmed","total":500}
{"ts":"2024-01-15T10:01:01Z","event":"search_started","provider":"eric"}
...
```

### Event Types

| Event | Data | Description |
|-------|------|-------------|
| `session_created` | `{id, query}` | New session initialized |
| `search_started` | `{provider}` | DB search begins |
| `page_fetched` | `{provider, page, count, cursor}` | Page retrieved |
| `rate_limited` | `{provider, waitMs}` | Rate limit hit, waiting |
| `retry` | `{provider, attempt, reason}` | Retrying after error |
| `search_completed` | `{provider, total, duration}` | DB search done |
| `search_failed` | `{provider, error}` | DB search failed |
| `session_completed` | `{summary}` | All DBs done |
| `session_resumed` | `{fromProvider, fromPage}` | Resume from checkpoint |

## Session Lifecycle

```
┌─────────────┐
│   created   │
└──────┬──────┘
       │ search starts
       ▼
┌─────────────┐
│   running   │◄────────┐
└──────┬──────┘         │ resume
       │                │
       ├─── all DBs complete ───► completed
       │
       ├─── some DBs failed ───► partial ──► (can resume)
       │
       └─── critical error ───► failed
```

## Resume Logic

1. Load `session.json`
2. Find DBs with `status != 'completed'`
3. For each:
   - If `status == 'failed'` and `error.retryable`: retry from start
   - If `status == 'in_progress'`: resume from `pagination.cursor`
   - If `status == 'pending'`: start fresh

### Page-Level Resume

```typescript
// When resuming mid-pagination:
const { cursor, pageNumber } = db.pagination;

if (cursor) {
  // API supports cursors (PubMed retstart, Scopus start)
  continueFrom(cursor);
} else {
  // Fallback: re-fetch and skip already-saved IDs
  refetchAndDedupe(pageNumber * pageSize);
}
```

## Session Commands

```bash
# List sessions
search-hub status

# Show specific session
search-hub status 20240115_diabetes-ai_a3f2c1

# Resume incomplete session
search-hub resume 20240115_diabetes-ai_a3f2c1

# Export results
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids
```
