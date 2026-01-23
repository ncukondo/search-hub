# Command Reference

## Overview

```
search-hub <command> [options]

Commands:
  init        Initialize configuration
  config      View/edit configuration
  query       Query utilities (validate, translate)
  search      Execute search across databases
  status      Show session status
  resume      Resume interrupted session
  export      Export session results
  register    Register results with reference-manager
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

## init

Initialize configuration file.

```bash
search-hub init [--force]
```

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing config |

Creates config file and prompts for API keys.

---

## config

View and edit configuration.

```bash
# Show all config
search-hub config

# Show specific key
search-hub config <key>

# Set value
search-hub config <key> <value>
```

Examples:
```bash
search-hub config providers.pubmed.api_key
search-hub config providers.pubmed.api_key "your-key"
```

---

## query validate

Validate a query file.

```bash
search-hub query validate <query.yaml>
```

Examples:
```bash
search-hub query validate ./my-search.yaml
```

---

## query translate

Show translated queries for each database.

```bash
search-hub query translate <query.yaml> [--db <provider>]
```

| Option | Description |
|--------|-------------|
| `--db <provider>` | Show specific database only |

Examples:
```bash
search-hub query translate ./query.yaml
search-hub query translate ./query.yaml --db pubmed
```

---

## search

Execute search across databases.

```bash
search-hub search <query.yaml> [options]
```

| Option | Description |
|--------|-------------|
| `--db <provider>` | Target specific database(s), comma-separated |
| `--name <string>` | Session name |
| `--max-results <n>` | Limit results per database |
| `--dry-run` | Show queries without executing |
| `--no-resume` | Start fresh session |

Examples:
```bash
# Search all databases
search-hub search ./query.yaml

# Search specific databases
search-hub search ./query.yaml --db pubmed,eric

# Dry run
search-hub search ./query.yaml --dry-run

# Limit results
search-hub search ./query.yaml --max-results 100
```

---

## status

Show session status.

```bash
# List all sessions
search-hub status

# Show specific session
search-hub status <session-id>
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--all` | Include completed sessions |

Examples:
```bash
search-hub status
search-hub status 20240115_diabetes_a3f2c1 --json
```

---

## resume

Resume an interrupted session.

```bash
search-hub resume <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--db <provider>` | Resume specific database only |
| `--retry-failed` | Retry failed databases |

Examples:
```bash
search-hub resume 20240115_diabetes_a3f2c1
search-hub resume 20240115_diabetes_a3f2c1 --retry-failed
```

---

## export

Export session results.

```bash
search-hub export <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--format <fmt>` | Output format: `ids`, `json`, `jsonl` |
| `--output <path>` | Output file (default: stdout) |
| `--db <provider>` | Export specific database only |
| `--id-type <type>` | For ids format: `doi`, `pmid`, `all` |

Examples:
```bash
# Export DOIs
search-hub export SESSION_ID --format ids --id-type doi

# Export full JSON
search-hub export SESSION_ID --format json -o results.json

# Export as JSON lines
search-hub export SESSION_ID --format jsonl
```

---

## register

Register results with reference-manager.

```bash
search-hub register <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--db <provider>` | Register specific database only |
| `--dry-run` | Show what would be registered |
| `--with-abstracts` | Also update abstracts |

Examples:
```bash
search-hub register SESSION_ID
search-hub register SESSION_ID --dry-run
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
