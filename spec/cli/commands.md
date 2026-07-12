# CLI Commands

## Command Overview

```
search-hub <command> [options]

Commands:
  search      Execute search across databases
  related     Find related articles from seed PMIDs
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
  query       Query utilities (init, validate, translate, assess, log)
  upgrade     Upgrade search-hub to the latest release
```

## Global Options

| Option | Short | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Config file path |
| `--session-dir <path>` | | Session directory |
| `--verbose` | `-v` | Increase verbosity |
| `--quiet` | `-q` | Suppress output |
| `--no-color` | | Disable colors |
| `--no-update-check` | | Disable the async update-version check |
| `--help` | `-h` | Show help |
| `--version` | `-V` | Show version |

---

## search

Execute search across multiple databases.

### Syntax

```bash
# Full search from query file (resolved via Query File Resolution)
search-hub search <query> [options]

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
| `--sort <field>` | Sort results: `relevance` or `date` |
| `--dry-run` | Show translated queries, provider readiness, and diagnostics without executing |
| `--no-resume` | Start fresh even if session exists |

### Examples

```bash
# Search all enabled databases (query name resolves to .search-hub/queries/diabetes-ai.yaml)
search-hub search diabetes-ai

# Explicit path also works
search-hub search ./diabetes-ai.yaml

# Search specific databases only
search-hub search diabetes-ai --db pubmed,eric

# Direct query to single database (testing)
search-hub search --db pubmed --query "diabetes[tiab] AND AI[tiab]"

# Dry run - show translated queries
search-hub search diabetes-ai --dry-run

# Sort by relevance
search-hub search diabetes-ai --sort relevance

# Limit results
search-hub search diabetes-ai --max-results 100
```

### Help Text Enhancement

`search --help` の末尾に以下を追加:

```
Query features (use "query init <title>" to create a template):
  filters:    year_from, year_to, language, publication_types
  exclude:    NOT terms per block (terms.exclude)
  mesh/eric:  controlled vocabulary (terms.mesh, terms.eric)
  overrides:  per-database settings (pubmed, scopus, eric, arxiv)
```

---

## related

Find related articles from seed PMIDs using PubMed ELink API.

### Syntax

```bash
# Direct PMID input
search-hub related <pmids...> [options]

# From existing session
search-hub related --from-session <session-id> --pmid <pmid>... [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `pmids...` | One or more seed PMIDs |

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--name` | `-n` | Session name | `related-{date}` |
| `--max-results` | `-m` | Max related articles to retrieve | 20 |
| `--db` | | Database to use | `pubmed` |
| `--from-session` | `-s` | Load context from existing session | - |
| `--pmid` | | Seed PMIDs (alternative to positional, required with --from-session) | - |
| `--term` | `-t` | Additional PubMed filter (e.g., `"review[filter]"`) | - |

### Examples

```bash
# Find articles related to a single PMID
search-hub related 12345678

# Multiple seed PMIDs with custom session name
search-hub related 12345678 23456789 --name diabetes-related -m 50

# From existing session, specifying which articles to use as seeds
search-hub related --from-session my-search --pmid 12345678 --pmid 23456789

# With additional filter
search-hub related 12345678 --term "review[filter]+AND+2024[pdat]"
```

### Behavior

1. Resolve seed PMIDs (positional args or `--from-session` + `--pmid`)
2. Call PubMed ELink API (`cmd=neighbor_score`) to find related articles
3. Fetch full article records for top results (ranked by similarity score)
4. Create session with `type: related` and `seeds` metadata
5. Save results in standard format (compatible with review, export, register)

### Session Output

Creates a standard session with:
- `type: related` in session.yaml
- `seeds` field recording seed PMIDs and source session
- Results in standard JSONL format (works with all existing commands)

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
4. Creates `.search-hub/queries/` directory for query files

---

## query

Query file utilities.

### Query File Resolution

All query subcommands and `search` accept a query file argument with smart resolution.
When the argument does not point to an existing file, the following paths are tried in order:

1. Exact path as given
2. `<arg>.yaml` in CWD
3. `.search-hub/queries/<arg>.yaml` in CWD

This allows shorthand usage:

```bash
# All equivalent (if .search-hub/queries/wba-pain.yaml exists)
search-hub query validate .search-hub/queries/wba-pain.yaml
search-hub query validate wba-pain.yaml
search-hub query validate wba-pain
```

### query init

Generate a query YAML file from a template.

```bash
search-hub query init <title> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<title>` | Query name (required). Sets `name` in YAML and determines filename |

#### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Override output path |
| `--stdout` | Print template to stdout instead of writing file |
| `--force` | Overwrite existing file |

#### Behavior

1. Sanitizes `<title>` to a filename: lowercase, spaces to hyphens, non-alphanumeric removed
2. Generates a YAML template with `name: <title>` and `$schema` link
3. Default output: `.search-hub/queries/<sanitized-title>.yaml` (creates `.search-hub/queries/` if needed)
4. Generates `query.schema.json` alongside the output file
5. If `--stdout`, prints template to stdout without creating files
6. If `-o`, writes to that path instead of default

#### Output Message

```
Created: .search-hub/queries/wba-pain.yaml

Next steps:
  1. Edit query:      $EDITOR .search-hub/queries/wba-pain.yaml
  2. Validate:        search-hub query validate wba-pain
  3. Check counts:    search-hub search wba-pain --count-only

Iterate: edit the same file and re-run step 3. Counts are logged automatically.
```

### query validate

Validate query YAML file (auto-checks controlled vocabulary).

```bash
search-hub query validate <query> [options]
```

`<query>` is resolved via Query File Resolution (see above).

| Option | Description |
|--------|-------------|
| `--no-vocab` | Skip controlled vocabulary validation |
| `--no-cache` | Skip vocabulary lookup cache |

### query translate

Show translated queries for each database.

```bash
search-hub query translate <query> [--db <provider>]
```

`<query>` is resolved via Query File Resolution (see above).

### query assess

Record an assessment for a query file. Assessments are stored in a log file alongside the query file (`{basename}.search-log.yaml`).

```bash
search-hub query assess <query.yaml> [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--verdict <value>` | Quality judgment: `good`, `refine`, `reject` |
| `--precision <value>` | Estimated precision (free text, e.g., "~54%", "15/28") |
| `--comment <text>` | Free text explanation |

At least one of `--verdict`, `--precision`, or `--comment` is required.

#### Behavior

1. Resolves the log file path from the query file path (`{basename}.search-log.yaml` in the same directory)
2. Appends an assessment entry with timestamp
3. Creates the log file if it does not exist

### query log

Display the iteration log for a query file.

```bash
search-hub query log <query.yaml> [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### Behavior

1. Reads the log file associated with the query file
2. Displays entries in chronological order with type indicators
3. If no log file exists, reports that no log entries exist

### Query Iteration Log

When `search --count-only` or `search --preview` is executed with a query file, the results are automatically appended to a log file alongside the query file. This provides an audit trail of the query refinement process.

#### Log File Naming

For `{path}/{name}.yaml`, the log file is `{path}/{name}.search-log.yaml`.

Examples:
- `./my-search.yaml` → `./my-search.search-log.yaml`
- `./.search-hub/queries/diabetes.yaml` → `./.search-hub/queries/diabetes.search-log.yaml`

#### Log File Format

```yaml
# Search iteration log for my-search.yaml
# Auto-generated by search-hub. You can also edit this file manually.

- date: "2026-02-16 10:30"
  type: count
  query_hash: "abc123"
  counts:
    pubmed: 50000
    scopus: 42000
  total: 92000

- date: "2026-02-16 10:35"
  type: assessment
  verdict: reject
  comment: "Too broad, need more specific MeSH terms"

- date: "2026-02-16 11:00"
  type: count
  query_hash: "def456"
  counts:
    pubmed: 1200
    scopus: 800
  total: 2000

- date: "2026-02-16 11:05"
  type: assessment
  verdict: good
  precision: "~60%"
  comment: "Acceptable range, proceeding to full search"
```

Entry types:
- `count` — Auto-recorded by `search --count-only` (includes `query_hash` to link to query version)
- `preview` — Auto-recorded by `search --preview` (includes counts and sample titles)
- `assessment` — Recorded by `query assess` (includes verdict, precision, comment)

The `query_hash` field links each count/preview entry to the specific version of the query file, making it possible to correlate refinements with results.

### Examples

```bash
# Create a query file (writes to .search-hub/queries/diabetes-ai.yaml)
search-hub query init "diabetes ai"

# Create with explicit output path
search-hub query init "diabetes ai" -o ./my-query.yaml

# Print template to stdout
search-hub query init "diabetes ai" --stdout

# Overwrite existing file
search-hub query init "diabetes ai" --force

# Validate query file (smart resolution: name → .search-hub/queries/<name>.yaml)
search-hub query validate diabetes-ai

# Show all translations
search-hub query translate diabetes-ai

# Show PubMed translation only
search-hub query translate diabetes-ai --db pubmed

# Check hit counts (auto-logged to .search-hub/queries/diabetes-ai.search-log.yaml)
search-hub search diabetes-ai --count-only

# Record assessment after reviewing counts
search-hub query assess diabetes-ai --verdict reject --comment "Too broad, 50k hits"
search-hub query assess diabetes-ai --verdict good --precision "~60%" --comment "Acceptable"

# View iteration log
search-hub query log diabetes-ai
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

## upgrade

Upgrade search-hub to the latest release (or a pinned version).

### Syntax

```bash
search-hub upgrade [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--check` | Report current vs. latest version; perform no upgrade |
| `--version <tag>` | Pin to a specific release tag (e.g. `v0.23.1`) |
| `--yes`, `-y` | Skip confirmation prompts (npm-global strategy runs npm directly) |
| `--install-dir <path>` | Override install dir for single-binary mode (default: directory of the running binary) |

### Behavior

Detects the install method from the resolved invocation path and applies the
appropriate strategy:

| Install method | Detection | Action |
|---|---|---|
| Single binary | Path outside `node_modules/`, typically `~/.local/bin/search-hub` (Bun-compiled binaries resolve via `process.execPath`) | Download `search-hub-{os}-{arch}[.exe]` from GitHub Releases, verify with `--version`, atomically replace the running binary |
| npm global | Resolved path contains `node_modules/` | Print `npm i -g @ncukondo/search-hub@latest`; run it with `--yes` |
| Dev / npx | Path inside a git worktree or npm cache (`_npx`) | Print guidance only |

Release source: `https://github.com/ncukondo/search-hub/releases`.
Binary replacement downloads to `{dest}.tmp.{pid}`, verifies the download by
running `--version`, then moves it into place (on Windows the running `.exe`
is rotated to `{dest}.old`).

### Exit Codes (upgrade-specific)

| Code | Meaning |
|------|---------|
| 0 | Already up to date, or upgrade completed successfully |
| 1 | Upgrade failed (network, permissions, verification) |
| 2 | Install method cannot be upgraded automatically (dev/npx) |

### Update Notification

After any normal command finishes, an async check compares the running
version against the latest GitHub release. When a newer release exists, a
one-line ASCII notice is printed to **stderr**:

```
>>> New version available: 0.23.1 -> 0.24.0
    Run: search-hub upgrade
```

- The check result is cached for 24 hours at `{data}/update-check.json`
  (search-hub's platform data dir); a fresh cache means no HTTP request.
- Network failures are silent; the user's command output is never delayed.
- GitHub rate-limit responses (403/429) fall back to the existing cache.

Suppression rules — the check is skipped entirely (no network, no cache
write) when any of:

- stdout is not a TTY (machine-readable output such as `export`/`--json`
  pipes is never contaminated)
- `SEARCH_HUB_NO_UPDATE_CHECK=1` in env
- `--no-update-check` flag passed
- The running command is `upgrade` itself

### Examples

```bash
# Upgrade to the latest release
search-hub upgrade

# Report current vs. latest without changing anything
search-hub upgrade --check

# Pin to a specific release
search-hub upgrade --version v0.23.1

# npm-global install: run npm without prompting
search-hub upgrade -y

# Single-binary install at a custom location
search-hub upgrade --install-dir ~/bin
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
