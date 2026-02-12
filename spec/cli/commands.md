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
  summary     Show session result statistics
  config      View/edit configuration
  init        Initialize configuration
  results     Display and filter session articles
  diff        Compare results between sessions
  merge       Merge results from multiple sessions
  check       Verify coverage of known articles
  query       Query utilities (init, validate, translate)
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
| `--dry-run` | Show translated queries, provider readiness, and diagnostics without executing |
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

### Help Text Enhancement

`search --help` の末尾に以下を追加:

```
Query features (use "query init" to see full template):
  filters:    year_from, year_to, language, publication_types
  exclude:    NOT terms per block (terms.exclude)
  mesh/eric:  controlled vocabulary (terms.mesh, terms.eric)
  overrides:  per-database settings (pubmed, scopus, eric, arxiv)
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
| `--format <fmt>` | Output format: `ids`, `json`, `jsonl`, `csl-json` |
| `--output <path>` | Output file (default: stdout) |
| `-q, --query <expr>` | Filter by query expression (same syntax as `results -q`) |
| `--id-type <type>` | For ids format: `doi`, `pmid`, `all` |
| `--db <provider>` | _(deprecated, use `-q "source:provider"`)_ Export only specific database(s) |
| `--filter-year <range>` | _(deprecated, use `-q "year:range"`)_ Year range filter |
| `--filter-title <keywords>` | _(deprecated, use `-q "title:keyword"`)_ Title keyword filter |
| `--filter-abstract <keywords>` | _(deprecated, use `-q "abstract:keyword"`)_ Abstract keyword filter |

### Examples

```bash
# Export DOIs only
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type doi

# Export PMIDs
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids --id-type pmid > pmids.txt

# Export full JSON
search-hub export 20240115_diabetes-ai_a3f2c1 --format json -o results.json

# Export as CSL-JSON
search-hub export 20240115_diabetes-ai_a3f2c1 --format csl-json -o results.json

# Export with query filter
search-hub export 20240115_diabetes-ai_a3f2c1 --format json -q "year:2023-2025"
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids -q "title:machine learning"
search-hub export 20240115_diabetes-ai_a3f2c1 --format json -q "year:2024-2025 abstract:randomized"
search-hub export 20240115_diabetes-ai_a3f2c1 --format ids -q "source:pubmed"
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

## results

Display and filter articles from a session's results.

### Syntax

```bash
search-hub results <session-id> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-q, --query <expr>` | Filter by query expression (see Query Expression Syntax below) |
| `--limit <n>` | Maximum number of results to show |
| `--offset <n>` | Skip first n results |
| `--json` | Output as JSON array |
| `--fields <fields>` | Fields to display (comma-separated) |
| `--abstract` | Show abstracts with results |
| `--abstract-length <n>` | Maximum abstract length in characters (default: 300) |
| `--db <providers>` | _(deprecated, use `-q "source:pubmed"`)_ Filter by database(s) |
| `--filter-year <range>` | _(deprecated, use `-q "year:2023-2025"`)_ Year range filter |
| `--filter-title <keywords>` | _(deprecated, use `-q "title:keyword"`)_ Title keyword filter |
| `--filter-abstract <keywords>` | _(deprecated, use `-q "abstract:keyword"`)_ Abstract keyword filter |

### Query Expression Syntax

The `-q` flag accepts a query expression with free text and field-specific terms:

```
query       = term ( SP term )*
term        = field_term | text_term
field_term  = field_name ":" value
text_term   = quoted_phrase | word        # searches title + abstract
```

**Supported fields:**

| Field | Matching | Example |
|---|---|---|
| _(free text)_ | title OR abstract substring | `"diabetes"` |
| `title:` | title substring | `title:learning` |
| `abstract:` | abstract substring | `abstract:randomized` |
| `author:` | author name substring | `author:tanaka` |
| `journal:` | journal name substring | `journal:lancet` |
| `year:` | exact or range | `year:2023`, `year:2020-2024` |
| `doi:` | case-insensitive exact | `doi:10.1234/xxx` |
| `pmid:` | exact match | `pmid:37654321` |
| `arxiv:` | exact match | `arxiv:2301.12345` |
| `scopus:` | exact match | `scopus:xxx` |
| `eric:` | exact match | `eric:EJ123456` |
| `source:` | provider name exact | `source:pubmed` |

**Logic:** AND between different fields, OR within same field.

### Examples

```bash
# Show all articles
search-hub results SESSION_ID

# Free text search (title + abstract)
search-hub results SESSION_ID -q "machine learning"

# Field-specific filter
search-hub results SESSION_ID -q "author:smith year:2020-2024"

# Check specific article by DOI
search-hub results SESSION_ID -q "doi:10.1001/jama.2023.12345"

# Combined filter with abstract display
search-hub results SESSION_ID -q "title:diabetes year:2023" --abstract
```

---

## check

Verify whether known articles are present in a session's results. Used for search query quality validation against prior reviews or reference lists.

### Syntax

```bash
search-hub check <session-id> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--file <path>` | File with identifiers to check (one per line) |
| `--doi <ids>` | Comma-separated DOIs to check |
| `--pmid <ids>` | Comma-separated PMIDs to check |
| `--json` | Output as JSON |
| `--missing-only` | Show only missing articles |

At least one of `--file`, `--doi`, or `--pmid` is required.

### Identifier File Format

Plain text, one identifier per line:

```
10.1001/jama.2023.12345          # DOI (starts with "10.")
37654321                          # PMID (numeric only)
DOI:10.1038/s41586-023-xxxxx    # DOI (explicit prefix)
PMID:36543210                    # PMID (explicit prefix)
arxiv:2301.12345                 # arXiv ID (explicit prefix)
# comment lines are ignored
```

Auto-detection: `10.*` → DOI, all-digits → PMID. Explicit prefixes (`DOI:`, `PMID:`, `ARXIV:`) are also accepted (case-insensitive).

### Examples

```bash
# Check coverage from file
search-hub check SESSION_ID --file prior-review-dois.txt

# Check specific DOIs
search-hub check SESSION_ID --doi "10.1001/jama.2023.12345,10.1016/j.lancet.2022.xxx"

# JSON output for scripting
search-hub check SESSION_ID --file refs.txt --json

# Show only missing articles
search-hub check SESSION_ID --file refs.txt --missing-only
```

---

## summary

Show session result statistics and analysis.

### Syntax

```bash
search-hub summary <session-id> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### Output

Displays:
- Session header (name, ID)
- Total and unique article counts
- Year distribution (with bar chart)
- Database breakdown (with percentages)
- Top journals by article count
- Identifier coverage (DOI, PMID, no-ID)

### Examples

```bash
# Show session summary
search-hub summary 20240115_diabetes-ai_a3f2c1

# JSON output for scripting
search-hub summary 20240115_diabetes-ai_a3f2c1 --json
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

1. Creates config file in platform-specific config directory (see spec/models/config.md)
2. Prompts for API keys interactively
3. Creates session directory in platform-specific data directory

---

## query

Query file utilities.

### query init

Generate a template query YAML file.

```bash
search-hub query init [-o <path>] [--force]
```

#### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Write to file instead of stdout |
| `--force` | Overwrite existing file |

#### Behavior

1. Generates a well-commented YAML template with placeholder structure
2. If `-o` is specified, writes to that file path (fails if file exists unless `--force`)
3. If no `-o` option, prints the template to stdout

### query validate

Validate query YAML file (auto-checks controlled vocabulary).

```bash
search-hub query validate [options] <query.yaml>
```

| Option | Description |
|--------|-------------|
| `--no-vocab` | Skip controlled vocabulary validation |
| `--no-cache` | Skip vocabulary lookup cache |

### query translate

Show translated queries for each database.

```bash
search-hub query translate <query.yaml> [--db <provider>]
```

### Examples

```bash
# Generate a query template to stdout
search-hub query init

# Write template to file
search-hub query init -o ./my-query.yaml

# Overwrite existing file
search-hub query init -o ./my-query.yaml --force

# Validate query file
search-hub query validate ./diabetes-ai.yaml

# Show all translations
search-hub query translate ./diabetes-ai.yaml

# Show PubMed translation only
search-hub query translate ./diabetes-ai.yaml --db pubmed
```

---

## review

Systematic review workflow commands. See [review.md](review.md) for full specification.

### Subcommands

| Subcommand | Description |
|---|---|
| `review init` | Initialize review file from search results |
| `review status` | Show review progress with dynamic next steps |
| `review list` | List articles filtered by status |
| `review extract` | Extract articles for review (work file or review file) |
| `review mark` | Mark a single article's decision |
| `review merge` | Merge reviewed file back into master |
| `review finalize` | Auto-set finalDecision for consensus articles |
| `review export` | Export finalized articles |

---

## merge

Merge results from multiple search sessions into a single session.

### Syntax

```bash
search-hub merge <session-id>... [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `session-id...` | Two or more session IDs to merge |

### Options

| Option | Description |
|--------|-------------|
| `--name <string>` | Name for merged session (default: auto-generated) |
| `--dry-run` | Show what would be merged without creating session |
| `--json` | Output as JSON |

### Behavior

1. Validate all source sessions exist and are completed
2. Reject merged sessions as sources (suggest expanded command with original sources)
3. Load articles from all source sessions
4. Deduplicate across sessions using identifier matching (DOI, PMID, etc.)
5. Create new session directory with `type: merge`
6. Copy source session provenance to `sources/` subdirectory
7. Write merged results per database

### Examples

```bash
# Merge two sessions
search-hub merge 20260208_wba-v4_ff6c52 20260208_wba-v9_251b24

# Merge with custom name
search-hub merge session-v4 session-v9 --name wba-combined

# Merge three sessions
search-hub merge session-a session-b session-c

# Dry run
search-hub merge session-v4 session-v9 --dry-run
```

### Error Cases

```
# Merged session as source
$ search-hub merge merged-session new-session
Error: Session 'merged-session' is a merged session (sources: v4, v9).
  Merge the original sources directly:
  search-hub merge v4 v9 new-session
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
