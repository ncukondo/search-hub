# Session Specification

Sessions track search progress, enable resume, and provide audit trails for PRISMA reporting.

> **Implementation**: See `src/session/` for type definitions and implementation details.

## Session Directory Structure

Default location is `<data-dir>/sessions/` (platform-specific, see [config.md](config.md#platform-specific-directories)).

```
<data-dir>/sessions/
└── {session-id}/
    ├── session.yaml              # Session metadata & status
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

## Merged Session

`search-hub merge` により作成されるセッション。複数の検索戦略の結果を統合する。

### Directory Structure

```
<data-dir>/sessions/
└── {session-id}/
    ├── session.yaml              # type: merge, sources参照
    ├── {provider}_results.jsonl  # 統合・重複除去済みの結果
    ├── {provider}_results.yaml
    └── sources/                  # ソースセッションの出自情報コピー
        ├── {source-session-id-1}/
        │   ├── session.yaml
        │   ├── query_common.yaml
        │   └── {provider}_query.txt
        └── {source-session-id-2}/
            ├── session.yaml
            ├── query_common.yaml
            └── {provider}_query.txt
```

### session.yaml Schema (type: merge)

通常セッションとの差異:
- `type: merge` フィールドが追加される (通常セッションは `type` フィールドなし or `type: search`)
- `query` フィールドは存在しない
- `sources` フィールドでソースセッションIDを参照
- `resume` 不可

```yaml
version: 1
id: "20260208_wba-merged_abc123"
name: "wba-merged"
type: merge
createdAt: "2026-02-08T..."
updatedAt: "2026-02-08T..."
sources:
  - id: "20260208_wba-v4_ff6c52"
    name: "wba-v4"
  - id: "20260208_wba-v9_251b24"
    name: "wba-v9"
databases:
  pubmed:
    status: completed
    files:
      results: pubmed_results.jsonl
      resultsYaml: pubmed_results.yaml
    retrievedCount: 95    # 統合後のユニーク件数
  scopus:
    status: completed
    files:
      results: scopus_results.jsonl
      resultsYaml: scopus_results.yaml
    retrievedCount: 60
summary:
  totalRetrieved: 155
  status: completed
```

### 制約

- mergedセッションを `merge` のソースにすることはできない（エラー + 元ソースを展開したコマンドを提案）
- `resume` は不可（セッションエラーとして報告）
- `sources/` には結果ファイル（JSONL）はコピーしない（クエリと出自情報のみ）

## Session ID Format

`{date}_{name}_{hash}`

- `date`: YYYYMMDD format
- `name`: Sanitized query name (lowercase, alphanumeric, dashes)
- `hash`: First 6 chars of query file hash

Example: `20240115_diabetes-ai-scoping_a3f2c1`

## session.yaml Schema

The session file contains:

- **version**: Schema version (currently 1)
- **id, name, description**: Session identification
- **createdAt, updatedAt**: ISO 8601 timestamps
- **query**: Original file path, hash, and target providers
- **databases**: Per-provider status (only targeted providers are included)
- **summary**: Aggregated totals and overall status

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

Event log for debugging and audit (JSON Lines):

```jsonl
{"ts":"2024-01-15T10:00:00Z","event":"session_created","data":{...}}
{"ts":"2024-01-15T10:00:01Z","event":"search_started","provider":"pubmed"}
{"ts":"2024-01-15T10:00:02Z","event":"page_fetched","provider":"pubmed","page":1,"count":100}
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

1. Load `session.yaml`
2. Find DBs with `status != 'completed'`
3. For each:
   - If `status == 'failed'` and `error.retryable`: retry from start
   - If `status == 'in_progress'`: resume from `pagination.cursor`
   - If `status == 'pending'`: start fresh

### Page-Level Resume

When resuming mid-pagination:
- If cursor exists: continue from cursor position (API-specific)
- Fallback: re-fetch and skip already-saved IDs using page number

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
