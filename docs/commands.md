# Command Reference

## Overview

```
search-hub <command> [options]

Commands:
  init        Initialize configuration
  config      View/edit configuration
  query       Query utilities (init, validate, translate)
  search      Execute search across databases
  status      Show session status
  results     List session articles
  summary     Show session statistics
  diff        Compare two sessions
  merge       Combine session results
  check       Verify coverage of known articles
  resume      Resume interrupted session
  export      Export session results
  register    Register results with reference-manager
  review      Multi-reviewer screening workflow
  notes       Session notes management
  assess      Record quality assessment
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

## query init

Generate a query YAML template with JSON Schema support for editor autocompletion.

```bash
search-hub query init [options]
```

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Write to file (default: stdout) |
| `--force` | Overwrite existing file |

When writing to a file, also generates a `query.schema.json` alongside it. The YAML template includes a `$schema` comment that enables autocompletion in editors with YAML language support (e.g., VS Code with Red Hat YAML extension).

Examples:
```bash
# Print template to stdout
search-hub query init

# Generate query.yaml and query.schema.json
search-hub query init -o query.yaml
```

---

## query validate

Validate a query file. Checks YAML structure and optionally validates controlled vocabulary terms (MeSH, ERIC descriptors, Emtree) against external APIs.

```bash
search-hub query validate <query.yaml> [options]
```

| Option | Description |
|--------|-------------|
| `--no-vocab` | Skip controlled vocabulary validation |
| `--no-cache` | Skip vocabulary lookup cache |

When controlled vocabulary terms are present, the command automatically validates them:
- **MeSH terms** are checked against the NLM MeSH Lookup API with typo suggestions
- **ERIC descriptors** and **Emtree terms** are validated via count-only search (valid if hits > 0)

If a query file lacks a `$schema` link, the output includes a tip suggesting `query init` to enable editor autocompletion.

Examples:
```bash
# Validate structure and vocabulary
search-hub query validate ./my-search.yaml

# Skip vocabulary validation
search-hub query validate ./my-search.yaml --no-vocab
```

---

## query translate

Show translated queries for each database. Displays warnings when a query contains controlled vocabulary terms unsupported by a provider (e.g., Emtree terms in PubMed).

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
search-hub search [query-file] [options]
```

| Option | Description |
|--------|-------------|
| `--db <providers>` | Target specific database(s), comma-separated |
| `--query <string>` | Direct query in database-native syntax (requires `--db`) |
| `--name <string>` | Session name |
| `--max-results <n>` | Limit results per database |
| `--dry-run` | Show translated queries without executing |
| `--count-only` | Get hit counts without downloading results (no session created) |
| `--preview` | Get hit counts and first 5 titles without creating session |
| `--skip-connection-test` | Skip API connection test during dry-run |
| `--no-resume` | Start fresh even if session exists |
| `--strict` | Require all targeted databases to succeed |

Examples:
```bash
# Search all databases
search-hub search ./query.yaml

# Search specific databases
search-hub search ./query.yaml --db pubmed,eric

# Check hit counts only
search-hub search ./query.yaml --count-only

# Preview counts with sample titles
search-hub search ./query.yaml --preview

# Dry run to see translated queries
search-hub search ./query.yaml --dry-run

# Limit results
search-hub search ./query.yaml --max-results 100

# Direct query (advanced)
search-hub search --db pubmed --query "diabetes AND machine learning"
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

## results

List articles from a session.

```bash
search-hub results <session-id> [options]
```

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

**Logic:** AND between different fields, OR within same field. Quoted phrases are supported (e.g., `title:"deep learning"`).

Examples:
```bash
# Free text search (title + abstract)
search-hub results SESSION_ID -q "machine learning"

# Field-specific filter
search-hub results SESSION_ID -q "author:smith year:2020-2024"

# Check specific article by DOI
search-hub results SESSION_ID -q "doi:10.1001/jama.2023.12345"

# Combined filter with abstract display
search-hub results SESSION_ID -q "title:diabetes year:2023" --abstract

# Show first 50 results
search-hub results SESSION_ID --limit 50

# JSON output for scripting
search-hub results SESSION_ID --json
```

---

## summary

Show session statistics.

```bash
search-hub summary <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

Examples:
```bash
search-hub summary SESSION_ID
search-hub summary SESSION_ID --json
```

---

## diff

Compare two sessions to see what changed between query iterations.

```bash
search-hub diff <session-id-1> <session-id-2> [options]
```

| Option | Description |
|--------|-------------|
| `--show <section>` | Show only: `added`, `removed`, or `common` |
| `--json` | Output as JSON |
| `--no-query-diff` | Hide query changes section |

Matches articles by identifiers (DOI, PMID, arXiv ID, etc.). Also compares query blocks and filters between sessions.

Examples:
```bash
# Full diff between two sessions
search-hub diff SESSION_V1 SESSION_V2

# Show only removed articles
search-hub diff SESSION_V1 SESSION_V2 --show removed

# JSON output
search-hub diff SESSION_V1 SESSION_V2 --json
```

---

## merge

Combine results from multiple sessions into one.

```bash
search-hub merge <session-ids...> [options]
```

| Option | Description |
|--------|-------------|
| `--name <string>` | Name for merged session |
| `--dry-run` | Show what would be merged without creating session |
| `--json` | Output as JSON |

Examples:
```bash
# Merge two sessions
search-hub merge SESSION_1 SESSION_2 --name combined

# Preview merge
search-hub merge SESSION_1 SESSION_2 --dry-run
```

---

## check

Verify whether known articles are present in a session's results. Used for search query quality validation against prior reviews or reference lists.

```bash
search-hub check <session-id> [options]
```

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

Examples:
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

## export

Export session results.

```bash
search-hub export <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--format <fmt>` | Output format: `ids`, `json`, `jsonl`, `csl-json` (default: `jsonl`) |
| `-o, --output <path>` | Output file (default: stdout) |
| `-q, --query <expr>` | Filter by query expression (same syntax as `results -q`) |
| `--id-type <type>` | For ids format: `doi`, `pmid`, `all` |
| `--no-dedup` | Disable deduplication of results |
| `--db <providers>` | _(deprecated, use `-q "source:provider"`)_ Export specific database(s) only |
| `--filter-year <range>` | _(deprecated, use `-q "year:range"`)_ Year range filter |
| `--filter-title <keywords>` | _(deprecated, use `-q "title:keyword"`)_ Title keyword filter |
| `--filter-abstract <keywords>` | _(deprecated, use `-q "abstract:keyword"`)_ Abstract keyword filter |

Examples:
```bash
# Export DOIs
search-hub export SESSION_ID --format ids --id-type doi

# Export full JSON
search-hub export SESSION_ID --format json -o results.json

# Export as CSL-JSON (for citation managers)
search-hub export SESSION_ID --format csl-json -o refs.json

# Export with query filter
search-hub export SESSION_ID --format json -q "year:2023-2025"
search-hub export SESSION_ID --format ids -q "title:machine learning"
search-hub export SESSION_ID --format ids -q "source:pubmed"
```

---

## register

Register results with reference-manager.

```bash
search-hub register <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--db <providers>` | Register specific database(s) only |
| `--dry-run` | Show what would be registered |
| `--with-abstracts` | Also update abstracts |
| `--reviewed` | Register only articles with `finalDecision=include` |
| `--all` | Register all articles (ignore reviews) |
| `--force` | Skip confirmation prompts |
| `--no-attach-fulltext` | Skip automatic fulltext attachment |

Examples:
```bash
search-hub register SESSION_ID
search-hub register SESSION_ID --dry-run
search-hub register SESSION_ID --reviewed
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

## review

Multi-reviewer screening workflow for systematic literature review.

### review init

Generate `reviews.yaml` from deduplicated search results.

```bash
search-hub review init --session <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `-f, --force` | Overwrite existing `reviews.yaml` |

### review status

Show review progress summary.

```bash
search-hub review status --session <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `--json` | Output as JSON |

### review list

List articles with optional status filtering.

```bash
search-hub review list --session <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `--filter <type>` | Filter: `pending`, `incomplete`, `uncertain`, `agreed-include`, `agreed-exclude`, `conflicting`, `finalized`, `all` (default: `all`) |
| `--json` | Output as JSON |

### review extract

Extract a subset of articles into a work file for distributed review.

```bash
search-hub review extract --session <session-id> --name <name> --reviewer <id> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `--name <name>` | Name for the review subset (output: `for-review/<name>/review.yaml`) |
| `--reviewer <id>` | Reviewer identifier (e.g., `"ai:claude"`) (required) |
| `--filter <types>` | Filter by status (comma-separated) |
| `--sort <method>` | Sort: `year`, `title`, `random`, `none` (default: `none`) |
| `--limit <n>` | Limit number of articles |
| `--offset <n>` | Skip first n articles |
| `--seed <n>` | Random seed for reproducible sorting |
| `--basis <type>` | Basis for review: `title`, `abstract`, or `fulltext` |
| `--finalize` | Extract for final decision (includes reviewHistory and finalDecision) |

### review merge

Merge edited review file back into main `reviews.yaml`.

```bash
search-hub review merge --session <session-id> --name <name> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `--name <name>` | Name of the review subset to merge |
| `--dry-run` | Show changes without applying |

### review mark

Mark a decision in a work file.

```bash
search-hub review mark --file <path> --id <id> --decision <decision> [options]
```

| Option | Description |
|--------|-------------|
| `--file <path>` | Path to work file (required) |
| `--id <id>` | Article ID to mark |
| `--decision <decision>` | Decision: `include`, `exclude`, or `uncertain` |
| `--comment <text>` | Optional comment |

### review export

Export articles based on final decision.

```bash
search-hub review export --session <session-id> --only <filter> -o <path> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `--only <filter>` | Export filter: `included` or `excluded` |
| `-o, --output <path>` | Output file path (required) |
| `--format <fmt>` | Output format: `yaml`, `json`, `jsonl` (default: `yaml`) |

### review finalize

Auto-set `finalDecision` for articles with reviewer consensus.

```bash
search-hub review finalize --session <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--session <id>` | Session ID (required) |
| `--dry-run` | Preview without changes |
| `--min-reviewers <n>` | Minimum agreeing reviewers needed (default: 1) |

Examples:
```bash
# Full review workflow
search-hub review init --session SESSION_ID
search-hub review extract --session SESSION_ID --name title-screening --reviewer reviewer1 --basis title
# (edit for-review/title-screening/review.yaml)
search-hub review merge --session SESSION_ID --name title-screening
search-hub review finalize --session SESSION_ID
search-hub review export --session SESSION_ID --only included -o included.yaml
```

---

## notes

Manage session notes.

### notes list

List notes for a session or across all sessions.

```bash
search-hub notes list [session-id] [options]
```

| Option | Description |
|--------|-------------|
| `--all` | Show notes from all sessions |
| `--json` | Output as JSON |

### notes add

Add a note to a session.

```bash
search-hub notes add <session-id> [text] [options]
```

| Option | Description |
|--------|-------------|
| `--file <path>` | Read note text from a file instead |

### notes assess

Add a structured quality assessment to a session.

```bash
search-hub notes assess <session-id> [options]
```

| Option | Description |
|--------|-------------|
| `--precision <value>` | Estimated precision (e.g., `"~54%"`, `"15/28"`) |
| `--verdict <value>` | Quality judgment: `good`, `refine`, `reject` |
| `--comment <text>` | Free text explanation |

At least one of `--precision`, `--verdict`, or `--comment` is required.

Examples:
```bash
# Add a note
search-hub notes add SESSION_ID "Expanded MeSH terms for better coverage"

# Record assessment
search-hub notes assess SESSION_ID --precision "~54%" --verdict good --comment "Good recall"

# List all session notes
search-hub notes list --all
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
