# Reference Manager Integration

Integration with [reference-manager](https://github.com/ncukondo/reference-manager) CLI for citation management.

## Overview

search-hub exports identifiers (DOI/PMID) that reference-manager can import. The integration supports:

1. **Export mode**: Output IDs for manual piping
2. **Direct mode**: Invoke ref commands automatically

## reference-manager Commands

| Command | Purpose |
|---------|---------|
| `ref add <id>` | Add reference by DOI, `pmid:<pmid>`, or `ISBN:<isbn>` |
| `ref add <id> -o json` | Add reference with JSON output (machine-readable) |
| `ref export <id>` | Export reference metadata as JSON (default), YAML, or BibTeX |
| `ref update <id> --set "field=value"` | Update reference field (e.g., abstract) |
| `ref list --format json` | List all references |
| `ref search "<query>"` | Search references (e.g., `"author:smith 2024"`) |
| `ref fulltext attach <id> <path>` | Attach PDF/Markdown to reference |

### ID Format Requirements

| Type | Format | Example |
|------|--------|---------|
| DOI | Raw DOI | `ref add "10.1234/example"` |
| PMID | `pmid:` prefix required | `ref add "pmid:12345678"` |

### Duplicate Handling

When adding a reference that already exists:
```bash
❯ ref add 10.1080/0142159X.2025.2607513
Skipped 1 duplicate(s):
  - 10.1080/0142159X.2025.2607513: matches existing 'cleland-2025'
```
- Duplicates are skipped (not an error)
- Existing entry is not updated

### JSON Output Format

`ref add -o json` returns structured results:

```json
{
  "summary": { "total": 3, "added": 2, "skipped": 1, "failed": 0 },
  "added": [
    { "source": "10.1234/example", "id": "smith2024", "uuid": "abc-123-...", "title": "..." }
  ],
  "skipped": [
    { "source": "10.5678/existing", "reason": "duplicate", "existingId": "jones2023", "duplicateType": "doi" }
  ],
  "failed": [
    { "source": "10.9999/invalid", "reason": "fetch_error", "error": "Server responded with status code 404" }
  ]
}
```

Note: `uuid` field in `added` and `reason` field in `skipped`/`failed` were added in v0.16.x.

**Exit code behavior**: `ref add` returns exit code 1 when there are failures, but still outputs valid JSON. The integration handles this by parsing stdout even when exit code is non-zero.

Use `--full` flag to include complete CSL-JSON in `added[].item`.

## Integration Flows

### Flow 1: Export and Pipe

```bash
# Export DOIs
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type doi | xargs -n1 ref add

# Export PMIDs (add prefix)
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type pmid | xargs -I{} ref add "pmid:{}"
```

### Flow 2: Direct Registration

```bash
# Register all results
search-hub register 20240115_diabetes-ai_a3f2c1

# Internally executes (PMID preferred):
# ref add "pmid:12345678"
# ref add "pmid:87654321"
# ref add "10.1234/example1"  # DOI fallback when no PMID
# ...
```

### Flow 3: With Abstracts

```bash
search-hub register 20240115_diabetes-ai_a3f2c1 --with-abstracts

# Internally executes (PMID preferred):
# ref add "pmid:12345678"
# ref update "smith2024" --set "abstract=..."
# ref add "pmid:87654321"
# ref update "jones2024" --set "abstract=..."
# ...
```

## Implementation Details

### ID Priority

When registering:
1. Use PMID if available (preferred) - PubMed metadata is higher quality and more complete
2. Fall back to DOI
3. Skip if neither available (log warning)

Rationale for PMID preference:
- PubMed metadata is standardized and complete for medical literature
- Abstracts are almost always present
- Author name format is consistent (family/given separated)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| ref not found | Error with instruction to install |
| ref add fails | Log warning, continue with next |
| Duplicate ID | Skipped by ref (not an error) |

### Registration Record

Each registration saves a detailed record for auditing and reproducibility.

#### Data Structure

```typescript
interface RegistrationRecord {
  sessionId: string;
  timestamp: string;
  summary: {
    total: number;      // Total articles processed
    added: number;      // Successfully added to library
    skipped: number;    // Duplicates (already in library)
    failed: number;     // Failed to fetch/add
    noId: number;       // Articles without DOI/PMID
  };
  added: Array<{
    source: string;     // Input identifier (DOI or pmid:...)
    id: string;         // Generated citation key (e.g., "smith2024")
    title: string;
  }>;
  duplicates: Array<{
    source: string;     // Input identifier
    existingId: string; // Existing citation key in library
    duplicateType: string; // "doi" | "pmid" | "isbn"
  }>;
  failed: Array<{
    source: string;
    reason: string;     // "not_found" | "fetch_error" | "parse_error"
    error?: string;     // Detailed error message
  }>;
}
```

#### Storage Location

```
sessions/
  20240115_diabetes-ai_a3f2c1/
    references.json         # Session-specific CSL JSON library
    registration.json       # Registration record
    registration-log.txt    # Human-readable log (optional)
```

#### Session-Specific Library

Each session uses its own CSL JSON library for accurate duplicate detection within the session scope.

```bash
# Set library path via environment variable
export REFERENCE_MANAGER_LIBRARY=./sessions/20240115_diabetes-ai_a3f2c1/references.json
ref add "pmid:12345678"
```

Benefits:
- Accurate duplicate detection per search session
- Isolated from user's main library
- Reproducible results
- Can be merged into main library later if needed

#### CLI Output

```
Registering 100 references to reference-manager...

Registration complete:
  ✓ 95 added
  ⚠ 4 duplicates (already in library):
    - 10.1234/example → existing 'smith2024'
    - 10.5678/another → existing 'jones2023'
    - pmid:12345678 → existing 'chen2024'
    - pmid:87654321 → existing 'lee2024'
  ✗ 1 failed (not found)

Results saved to: sessions/20240115_diabetes-ai_a3f2c1/registration.json
```

#### Implementation

```typescript
// Reference implementation - actual implementation should use zod
// to validate ref command output, as the format may change between versions.

async function register(sessionId: string, options: RegisterOptions): Promise<RegistrationRecord> {
  const session = await loadSession(sessionId);
  const articles = await loadAllResults(session);

  // Use session-specific library for accurate duplicate detection
  const libraryPath = path.join(session.dir, 'references.json');
  const env = { ...process.env, REFERENCE_MANAGER_LIBRARY: libraryPath };

  const record: RegistrationRecord = {
    sessionId,
    timestamp: new Date().toISOString(),
    summary: { total: articles.length, added: 0, skipped: 0, failed: 0, noId: 0 },
    added: [],
    duplicates: [],
    failed: [],
  };

  for (const article of articles) {
    // PMID preferred for better metadata quality from PubMed
    const id = article.pmid ? `pmid:${article.pmid}` : article.doi ?? null;
    if (!id) {
      record.summary.noId++;
      continue;
    }

    // NOTE: Use zod schema validation in production (e.g., RefAddOutputSchema.parse())
    const output = JSON.parse(await exec(`ref add "${id}" -o json`, { env }));

    // Aggregate results
    record.summary.added += output.summary.added;
    record.summary.skipped += output.summary.skipped;
    record.summary.failed += output.summary.failed;

    // Record added items
    for (const item of output.added) {
      record.added.push({ source: item.source, id: item.id, title: item.title });

      // Update abstract if available
      if (options.withAbstracts && article.abstract) {
        await exec(`ref update "${item.id}" --set "abstract=${escape(article.abstract)}"`, { env });
      }
    }

    // Record duplicates
    for (const item of output.skipped) {
      record.duplicates.push({
        source: item.source,
        existingId: item.existingId,
        duplicateType: item.duplicateType,
      });
    }

    // Record failures
    for (const item of output.failed) {
      record.failed.push({ source: item.source, reason: item.reason, error: item.error });
    }
  }

  // Save record
  await saveRegistrationRecord(session, record);

  return record;
}
```

### Progress Display

```
Registering 1500 references...
⠋ Adding to reference-manager [████████░░░░] 400/1500
  ✓ 398 added
  ⚠ 2 skipped (no identifier)
```

## Metadata Handling

### Metadata Source Differences

The same article may have different metadata depending on the source:

| Field | PubMed | CrossRef (DOI) |
|-------|--------|----------------|
| Authors | Full names (family/given separated) | Publisher-dependent |
| Abstract | Almost always present | May be missing |
| Affiliations | Detailed | Brief or missing |
| Publication date | Electronic/print separated | Publisher-dependent |
| Journal name | Standard abbreviation | Full or abbreviated |

### Difference Detection and Reporting

When registering, compare search-hub article data with reference-manager entry:

```
Registered 100 references:
  ✓ 95 added
  ⚠ 5 with metadata differences:
    - smith2024: title differs (PubMed vs CrossRef)
    - jones2023: authors differ
```

### Abstract Completion

If search-hub has abstract but reference-manager entry does not, auto-fill:

```typescript
// After ref add (env contains REFERENCE_MANAGER_LIBRARY)
const refData = JSON.parse(await exec(`ref export "${refId}"`, { env }));

if (article.abstract && !refData.abstract) {
  await exec(`ref update "${refId}" --set "abstract=${escape(article.abstract)}"`, { env });
}
```

## Configuration

```toml
[integration.reference_manager]
enabled = true
command = "ref"              # CLI command name
auto_register = false        # Auto-run after search
```

### Auto-register

If `auto_register = true`, search command automatically runs register after completion:

```bash
search-hub search ./query.yaml
# Automatically followed by:
# search-hub register <session-id>
```

## Batch Optimization

For large result sets:
- Group by identifier type (DOIs together, PMIDs together)
- Consider parallel execution with concurrency limit
- Show progress with estimated time

## Output Format Compatibility

search-hub output formats compatible with ref:

| Format | ref Usage |
|--------|-----------|
| `ids` (doi) | `cat ids.txt \| xargs -n1 ref add` |
| `ids` (pmid) | `cat ids.txt \| xargs -I{} ref add "pmid:{}"` |
| `json` | Future: `ref import --format json` |

## reference-manager Feature Status

Features relevant to search-hub integration:

| Feature | Status | Notes |
|---------|--------|-------|
| `ref add -o json` | ✅ Implemented | Returns `{ summary, added[], skipped[], failed[] }` |
| `ref export <id>` | ✅ Implemented | Get entry metadata as JSON/YAML/BibTeX |
| `ref update --set` | ✅ Implemented | Update arbitrary fields |
| `ref fulltext attach` | ✅ Implemented | Attach PDF/Markdown to references |

## Future Considerations

### MCP Integration

reference-manager supports MCP (Model Context Protocol). Future integration options:

```toml
[integration.reference_manager]
mode = "mcp"  # or "cli"
```

Benefits:
- No process spawn overhead
- Structured error handling
- Efficient batch processing
