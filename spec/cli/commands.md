# CLI Commands

## Command Overview

```
search-hub <command> [options]

Commands:
  search      Execute search across databases
  resume      Resume interrupted session
  status      Show session status
  export      Export session results
  register    Register results with reference-manager
  config      View/edit configuration
  init        Initialize configuration
  query       Query utilities (validate, translate)
```

## Global Options

| Option | Short | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Config file path |
| `--session-dir <path>` | | Session directory |
| `--verbose` | `-v` | Increase verbosity |
| `--quiet` | `-q` | Suppress output |
| `--no-color` | | Disable colors |
| `--help` | `-h` | Show help |
| `--version` | `-V` | Show version |

---

## search

Execute search across multiple databases.

### Syntax

```bash
# Full search from query file
search-hub search <query.yaml> [options]

# Single database direct query (for testing)
search-hub search --db <provider> --query <query-string> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--db <provider>` | Target specific database(s), comma-separated |
| `--query <string>` | Direct query string (requires --db) |
| `--name <string>` | Session name (default: from query file) |
| `--max-results <n>` | Limit results per database |
| `--dry-run` | Show translated queries without executing |
| `--no-resume` | Start fresh even if session exists |

### Examples

```bash
# Search all enabled databases
search-hub search ./diabetes-ai.yaml

# Search specific databases only
search-hub search ./query.yaml --db pubmed,eric

# Direct query to single database (testing)
search-hub search --db pubmed --query "diabetes[tiab] AND AI[tiab]"

# Dry run - show translated queries
search-hub search ./query.yaml --dry-run

# Limit results
search-hub search ./query.yaml --max-results 100
```

---

## resume

Resume an interrupted search session.

### Syntax

```bash
search-hub resume <session-id> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--db <provider>` | Resume only specific database(s) |
| `--retry-failed` | Retry failed databases |

### Examples

```bash
# Resume session
search-hub resume 20240115_diabetes-ai_a3f2c1

# Resume only failed databases
search-hub resume 20240115_diabetes-ai_a3f2c1 --retry-failed

# Resume specific database
search-hub resume 20240115_diabetes-ai_a3f2c1 --db scopus
```

---

## status

Show session status and statistics.

### Syntax

```bash
# List all sessions
search-hub status

# Show specific session
search-hub status <session-id>
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--all` | Include completed sessions |

### Examples

```bash
# List recent sessions
search-hub status

# Show session details
search-hub status 20240115_diabetes-ai_a3f2c1

# JSON output for scripting
search-hub status 20240115_diabetes-ai_a3f2c1 --json
```

---

## export

Export session results to various formats.

### Syntax

```bash
search-hub export <session-id> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--format <fmt>` | Output format: `ids`, `json`, `jsonl` |
| `--output <path>` | Output file (default: stdout) |
| `--db <provider>` | Export only specific database(s) |
| `--id-type <type>` | For ids format: `doi`, `pmid`, `all` |

### Examples

```bash
# Export DOIs only
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type doi

# Export PMIDs
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type pmid > pmids.txt

# Export full JSON
search-hub export 20240115_diabetes-ai_a3f2c1 --format json -o results.json

# Export specific database
search-hub export 20240115_diabetes-ai_a3f2c1 --db pubmed --format jsonl
```

---

## register

Register results with reference-manager.

### Syntax

```bash
search-hub register <session-id> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--db <provider>` | Register only specific database(s) |
| `--dry-run` | Show what would be registered |
| `--with-abstracts` | Also update abstracts via ref update |

### Examples

```bash
# Register all results (ref add)
search-hub register 20240115_diabetes-ai_a3f2c1

# Register with abstracts
search-hub register 20240115_diabetes-ai_a3f2c1 --with-abstracts

# Dry run
search-hub register 20240115_diabetes-ai_a3f2c1 --dry-run
```

---

## config

View and edit configuration.

### Syntax

```bash
# Show current config
search-hub config

# Show specific key
search-hub config <key>

# Set value
search-hub config <key> <value>
```

### Examples

```bash
# Show all config
search-hub config

# Show PubMed config
search-hub config providers.pubmed

# Set API key
search-hub config providers.pubmed.api_key "your-key"
```

---

## init

Initialize configuration file.

### Syntax

```bash
search-hub init [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing config |

### Behavior

1. Creates `~/.search-hub/config.toml` with defaults
2. Prompts for API keys interactively
3. Creates session directory structure

---

## query

Query file utilities.

### query validate

Validate query YAML file.

```bash
search-hub query validate <query.yaml>
```

### query translate

Show translated queries for each database.

```bash
search-hub query translate <query.yaml> [--db <provider>]
```

### Examples

```bash
# Validate query file
search-hub query validate ./diabetes-ai.yaml

# Show all translations
search-hub query translate ./diabetes-ai.yaml

# Show PubMed translation only
search-hub query translate ./diabetes-ai.yaml --db pubmed
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Config error |
| 3 | Query validation error |
| 4 | Network/API error |
| 5 | Session error |

## Output Modes

- **Normal**: Progress bars, summary
- **Verbose** (`-v`): Debug information
- **Quiet** (`-q`): Errors only
- **JSON** (`--json`): Machine-readable output
