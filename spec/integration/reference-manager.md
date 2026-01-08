# Reference Manager Integration

Integration with [reference-manager](https://github.com/ncukondo/reference-manager) CLI for citation management.

## Overview

search-hub exports identifiers (DOI/PMID) that reference-manager can import. The integration supports:

1. **Export mode**: Output IDs for manual piping
2. **Direct mode**: Invoke ref commands automatically

## reference-manager Commands

| Command | Purpose |
|---------|---------|
| `ref add <id>` | Add reference by DOI or `pmid:<pmid>` |
| `ref update <id> --set "field=value"` | Update reference field (e.g., abstract) |
| `ref list --format json` | List references |

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

# Internally executes:
# ref add "10.1234/example1"
# ref add "10.1234/example2"
# ref add "pmid:12345678"
# ...
```

### Flow 3: With Abstracts

```bash
search-hub register 20240115_diabetes-ai_a3f2c1 --with-abstracts

# Internally executes:
# ref add "10.1234/example1"
# ref update "10.1234/example1" --set "abstract=..."
# ref add "10.1234/example2"
# ref update "10.1234/example2" --set "abstract=..."
# ...
```

## Implementation Details

### Register Command

```typescript
async function register(sessionId: string, options: RegisterOptions) {
  const session = await loadSession(sessionId);
  const articles = await loadAllResults(session);

  for (const article of articles) {
    // DOI preferred, PMID requires prefix
    const id = article.doi || (article.pmid ? `pmid:${article.pmid}` : null);
    if (!id) continue;

    // Add reference
    await exec(`ref add "${id}"`);

    // Update abstract if requested and available
    if (options.withAbstracts && article.abstract) {
      await exec(`ref update "${id}" --set "abstract=${escape(article.abstract)}"`);
    }
  }
}
```

### ID Priority

When registering:
1. Use DOI if available (preferred)
2. Fall back to PMID with `pmid:` prefix
3. Skip if neither available (log warning)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| ref not found | Error with instruction to install |
| ref add fails | Log warning, continue with next |
| Duplicate ID | Skipped by ref (not an error) |

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
// After ref add
const refData = await exec(`ref show "${refId}" --output json`);

if (article.abstract && !refData.abstract) {
  await exec(`ref update "${refId}" --set "abstract=${escape(article.abstract)}"`);
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

## Recommended reference-manager Enhancements

The following features would improve integration:

| Feature | Purpose | Priority |
|---------|---------|----------|
| `ref add --output json` | Machine-readable add result (added/skipped counts) | High |
| `ref show <id> --output json` | Get entry metadata for diff detection | High |
| `ref update --set` | Update arbitrary fields | Existing |

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
