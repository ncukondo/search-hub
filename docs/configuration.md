# Configuration Guide

## Quick Setup

```bash
# Initialize a project (creates .search-hub/ in current directory)
search-hub init

# Initialize global config (API keys, user preferences)
search-hub init --global
```

## Two-Tier Config

search-hub uses a two-tier configuration system:

- **Global config** (`<config-dir>/config.toml`) — API keys, credentials, user preferences
- **Local config** (`.search-hub/config.toml`) — project-specific overrides

Local settings override global settings at the field level (deep merge).

### Project Directory

Running `search-hub init` creates:

```
.search-hub/
├── config.toml     # Project config (no secrets)
├── sessions/       # Session storage
└── queries/        # Query files
```

### Platform-Specific Paths

| Platform | Global Config | Data Directory |
|----------|---------------|----------------|
| Linux | `~/.config/search-hub/config.toml` | `~/.local/share/search-hub/` |
| macOS | `~/Library/Preferences/search-hub/config.toml` | `~/Library/Application Support/search-hub/` |
| Windows | `%APPDATA%/search-hub/Config/config.toml` | `%LOCALAPPDATA%/search-hub/Data/` |

### Config Priority (highest to lowest)

1. CLI arguments
2. Explicit `--config <path>` file
3. Environment variables
4. Local config (`.search-hub/config.toml`)
5. Global config (`<config-dir>/config.toml`)

## Config Command

```bash
# View all config values
search-hub config

# View with origin info (env/local/global/default)
search-hub config --show-origin

# View environment variable mappings
search-hub config --env-vars

# Get a specific value
search-hub config providers.pubmed.rate_limit

# Set a value (auto-selects local if in project, global otherwise)
search-hub config providers.pubmed.max_results 5000

# Explicitly target global or local
search-hub config --global providers.pubmed.api_key "my-key"
search-hub config --local providers.scopus.enabled false
```

## Global Config File Format

```toml
# Session storage
[session]
directory = ""    # Empty = use platform default

# Logging
[log]
level = "info"    # debug, info, warn, error

# Output preferences
[output]
color = true
progress_bar = true

# Provider configurations
[providers.pubmed]
enabled = true
api_key = ""              # Optional but recommended
email = "you@example.com" # Required by NCBI
rate_limit = 3            # Requests/second (10 with key)
timeout = 30000           # ms
retries = 3
max_results = 10000

[providers.eric]
enabled = true
rate_limit = 5
timeout = 30000
retries = 3
max_results = 10000

[providers.arxiv]
enabled = true
rate_limit = 0.33         # 1 request per 3 seconds
timeout = 60000           # arXiv can be slow
retries = 3
max_results = 10000

[providers.scopus]
enabled = true
api_key = ""              # Required for Scopus
inst_token = ""           # Optional institutional token
rate_limit = 2
timeout = 30000
retries = 3
max_results = 10000

# Fulltext management
[fulltext]
enabled = true
auto_convert_markdown = true
auto_attach_on_register = true

[fulltext.sources]
unpaywall_email = ""
core_api_key = ""
ncbi_email = ""
ncbi_tool = "search-hub"
prefer_sources = ["pmc", "arxiv", "unpaywall", "core"]

[fulltext.download]
concurrent_downloads = 3
retry_attempts = 3

# Reference manager integration
[integration.reference_manager]
enabled = true
command = "ref"
auto_register = false
with_abstracts = false
```

## Local Config (Project Overrides)

The local config in `.search-hub/config.toml` only needs to contain fields you want to override. Secret fields (`api_key`, `email`, `inst_token`) are excluded from generated files.

```toml
# Example: project-specific overrides
[providers.pubmed]
max_results = 5000

[providers.scopus]
enabled = false    # Skip Scopus for this project

[integration.reference_manager]
auto_register = true
```

## Environment Variables

| Variable | Maps To |
|----------|---------|
| `SEARCH_HUB_PUBMED_API_KEY` | `providers.pubmed.api_key` |
| `SEARCH_HUB_PUBMED_EMAIL` | `providers.pubmed.email` |
| `SEARCH_HUB_SCOPUS_API_KEY` | `providers.scopus.api_key` |
| `SEARCH_HUB_SCOPUS_INST_TOKEN` | `providers.scopus.inst_token` |
| `SEARCH_HUB_WOS_API_KEY` | `providers.wos.api_key` |
| `SEARCH_HUB_SESSION_DIR` | `session.directory` |
| `SEARCH_HUB_LOG_LEVEL` | `log.level` |

> **Note**: Fulltext settings (`fulltext.*`, `fulltext.sources.*`, `fulltext.download.*`) do not currently have environment variable alternatives. Configure them via config file or CLI arguments.

## API Keys

### PubMed

- **Optional** but recommended (higher rate limits)
- Get key at: https://www.ncbi.nlm.nih.gov/account/settings/
- Also set `email` for NCBI tracking

### Scopus

- **Required** for Scopus searches
- Requires institutional access
- Get key at: https://dev.elsevier.com/

### ERIC & arXiv

- No API key required

## Fulltext Settings

### General

```toml
[fulltext]
enabled = true                     # Enable fulltext management
auto_convert_markdown = true       # Auto-convert PMC XML to Markdown on fetch
auto_attach_on_register = true     # Auto-attach fulltexts on register command
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable fulltext features |
| `auto_convert_markdown` | boolean | `true` | Automatically convert PMC XML to Markdown after download |
| `auto_attach_on_register` | boolean | `true` | Attach fulltexts when running `register` |

### Data Sources

```toml
[fulltext.sources]
unpaywall_email = "user@example.com"                    # Required for Unpaywall API
core_api_key = ""                                       # Optional, for CORE API
prefer_sources = ["pmc", "arxiv", "unpaywall", "core"]  # Source priority order
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `unpaywall_email` | string | `""` | Email for Unpaywall API (required for OA checks) |
| `core_api_key` | string | `""` | API key for CORE API (free registration) |
| `prefer_sources` | string[] | `["pmc", "arxiv", "unpaywall", "core"]` | Preferred source order for downloads |

### Download Settings

```toml
[fulltext.download]
concurrent_downloads = 3
retry_attempts = 3
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `concurrent_downloads` | integer | `3` | Number of parallel downloads |
| `retry_attempts` | integer | `3` | Retry count for failed downloads |

## CLI Options

Override config for a single command:

```bash
search-hub search query.yaml --session-dir ./my-sessions
search-hub search query.yaml -v  # verbose
search-hub search query.yaml -q  # quiet
```
