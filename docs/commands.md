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
  fulltext    Manage fulltext retrieval
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

## fulltext

Manage fulltext retrieval for session articles. All subcommands operate on articles with `finalDecision=include` in the session's review data.

See the [Fulltext Management Guide](./fulltext.md) for workflow examples.

### fulltext init

Create directories for included articles with `meta.json` and `README.md`.

```bash
search-hub fulltext init <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be created without creating |

Each directory contains a `README.md` with article identifiers, download URLs, and instructions for manual file placement.

Examples:
```bash
# Create directories for all included articles
search-hub fulltext init my-session

# Preview without creating
search-hub fulltext init my-session --dry-run
```

### fulltext sync

Detect and register manually added fulltext files.

```bash
search-hub fulltext sync <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be synced without modifying |

Scans article directories for `fulltext.pdf`, `fulltext.xml`, and `fulltext.md`. Updates `meta.json` and review data with file information.

Examples:
```bash
# Sync all directories
search-hub fulltext sync my-session

# Preview changes
search-hub fulltext sync my-session --dry-run
```

### fulltext check

Check Open Access availability for included articles via Unpaywall, PMC, and CORE.

```bash
search-hub fulltext check --session <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `--format <format>` | Output format: `table` (default) or `json` |

Requires `unpaywall_email` in configuration. Optionally uses `core_api_key` for broader coverage.

Examples:
```bash
# Check OA status (table output)
search-hub fulltext check --session my-session

# JSON output for scripting
search-hub fulltext check --session my-session --format json
```

### fulltext fetch

Download available OA fulltexts.

```bash
search-hub fulltext fetch <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--source <sources>` | Filter by source (comma-separated: `pmc`, `arxiv`, `unpaywall`, `core`) |
| `--no-convert-markdown` | Skip auto-conversion of PMC XML to Markdown |
| `--dry-run` | Show what would be downloaded without downloading |

By default, PMC XML files are automatically converted to Markdown after download.

Examples:
```bash
# Fetch all available OA articles
search-hub fulltext fetch my-session

# Fetch only from PMC and arXiv
search-hub fulltext fetch my-session --source pmc,arxiv

# Fetch without Markdown conversion
search-hub fulltext fetch my-session --no-convert-markdown

# Preview downloads
search-hub fulltext fetch my-session --dry-run
```

### fulltext convert

Convert PMC XML files to Markdown.

```bash
search-hub fulltext convert <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--article <dir>` | Convert specific article directory only |

Converts JATS XML to readable Markdown, preserving section hierarchy, tables, figures, and citations.

Examples:
```bash
# Convert all XML files in session
search-hub fulltext convert my-session

# Convert specific article
search-hub fulltext convert my-session --article smith2024-a1b2c3d4
```

### fulltext attach

Attach fulltext files to reference-manager entries.

```bash
search-hub fulltext attach <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be attached without attaching |

Exports fulltexts (PDF and Markdown) to reference-manager using `ref fulltext attach`. Requires reference-manager integration to be configured.

Examples:
```bash
# Attach all fulltexts
search-hub fulltext attach my-session

# Preview attachments
search-hub fulltext attach my-session --dry-run
```

### fulltext status

Show fulltext retrieval status for a session.

```bash
search-hub fulltext status <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--format <format>` | Output format: `table` (default) or `json` |

Shows counts of articles with PDF, Markdown, both, pending (directory created but no files), and not initialized.

Examples:
```bash
search-hub fulltext status my-session
search-hub fulltext status my-session --format json
```

### fulltext pending

List articles that still need manual fulltext download.

```bash
search-hub fulltext pending <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--format <format>` | Output format: `table` (default) or `json` |
| `--export <file>` | Export download URLs to file |

Shows articles without fulltext files along with their DOIs, PMIDs, and known download URLs.

Examples:
```bash
# List pending articles
search-hub fulltext pending my-session

# Export URLs for batch download
search-hub fulltext pending my-session --export urls.txt
```

---

## register (fulltext integration)

The `register` command automatically attaches fulltext files when registering articles with reference-manager.

```bash
search-hub register <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--no-attach-fulltext` | Skip automatic fulltext attachment |
| `--dry-run` | Show what would be registered |

After importing articles, any available fulltext files (PDF and Markdown) are automatically attached to the corresponding reference-manager entries.

Examples:
```bash
# Register with automatic fulltext attachment
search-hub register my-session

# Register without attaching fulltexts
search-hub register my-session --no-attach-fulltext
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
