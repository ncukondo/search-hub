# Reference Manager Integration

Integration with [reference-manager](https://github.com/ncukondo/reference-manager) CLI for citation management.

## Overview

search-hub exports identifiers (DOI/PMID) that reference-manager can import. The integration supports:

1. **Export mode**: Output IDs for manual piping
2. **Direct mode**: Invoke ref commands automatically

## reference-manager Commands

| Command | Purpose |
|---------|---------|
| `ref add <id>` | Add reference by DOI/PMID |
| `ref update <id> --abstract <text>` | Update reference with abstract |
| `ref list --format json` | List references |

## Integration Flows

### Flow 1: Export and Pipe

```bash
# Export DOIs
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type doi | xargs -n1 ref add

# Export PMIDs
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type pmid | xargs -n1 ref add
```

### Flow 2: Direct Registration

```bash
# Register all results
search-hub register 20240115_diabetes-ai_a3f2c1

# Internally executes:
# ref add 10.1234/example1
# ref add 10.1234/example2
# ref add 12345678  (PMID)
# ...
```

### Flow 3: With Abstracts

```bash
search-hub register 20240115_diabetes-ai_a3f2c1 --with-abstracts

# Internally executes:
# ref add 10.1234/example1
# ref update 10.1234/example1 --abstract "..."
# ref add 10.1234/example2
# ref update 10.1234/example2 --abstract "..."
# ...
```

## Implementation Details

### Register Command

```typescript
async function register(sessionId: string, options: RegisterOptions) {
  const session = await loadSession(sessionId);
  const articles = await loadAllResults(session);

  for (const article of articles) {
    const id = article.doi || article.pmid;
    if (!id) continue;

    // Add reference
    await exec(`ref add "${id}"`);

    // Update abstract if requested
    if (options.withAbstracts && article.abstract) {
      await exec(`ref update "${id}" --abstract "${escape(article.abstract)}"`);
    }
  }
}
```

### ID Priority

When registering:
1. Use DOI if available (preferred)
2. Fall back to PMID
3. Skip if neither available (log warning)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| ref not found | Error with instruction to install |
| ref add fails | Log warning, continue with next |
| Duplicate ID | ref handles idempotently |

### Progress Display

```
Registering 1500 references...
⠋ Adding to reference-manager [████████░░░░] 400/1500
  ✓ 398 added
  ⚠ 2 skipped (no identifier)
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
| `ids` (pmid) | Same as above |
| `json` | Future: `ref import --format json` |
