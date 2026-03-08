# Configuration Specification

## Configuration Priority

```
Highest ──► CLI arguments
         │  Explicit --config <path>
         │  Environment variables
         │  Local config (.search-hub/config.toml)
Lowest  ──► Global config (<config-dir>/config.toml)
```

Later sources override earlier ones at the field level (deep merge).

## Platform-Specific Directories

Uses [env-paths](https://github.com/sindresorhus/env-paths) for XDG-compliant paths.

| Platform | Config Directory | Data Directory |
|----------|------------------|----------------|
| Linux | `~/.config/search-hub` | `~/.local/share/search-hub` |
| macOS | `~/Library/Preferences/search-hub` | `~/Library/Application Support/search-hub` |
| Windows | `%APPDATA%/search-hub/Config` | `%APPDATA%/search-hub/Data` |

## Two-Tier Config Design

### Global Config

- **Location:** `<config-dir>/config.toml` (platform-specific, see above)
- **Created by:** `search-hub init --global`
- **Purpose:** User preferences, API credentials, default settings
- **Contains:** All config sections; credential fields as commented hints

### Local Config (Project)

- **Location:** `.search-hub/config.toml` (in project root)
- **Created by:** `search-hub init` (default behavior)
- **Purpose:** Project-specific overrides (provider settings, integration options)
- **Contains:** Provider settings and integration options, **excluding secrets** (`api_key`, `email`, `inst_token`)
- **Project detection:** `.search-hub/` directory existence indicates a project context

### Project Directory Structure

```
.search-hub/
├── config.toml     # Local config (project overrides)
├── sessions/       # Session storage (when inside project)
└── queries/        # Query files
```

## Data Directories

| Directory | Purpose |
|-----------|---------|
| `<data-dir>/sessions/` | Session storage (outside project) |
| `.search-hub/sessions/` | Session storage (inside project, auto-selected) |

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

## CLI Arguments

Common options available on most commands:

```bash
--config <path>         # Override config file
--session-dir <path>    # Override session directory
--verbose, -v           # Increase log verbosity
--quiet, -q             # Suppress output
--no-color              # Disable colored output
```

Provider-specific:

```bash
--pubmed-api-key <key>
--scopus-api-key <key>
```

## TOML Schema

### Global Config (`<config-dir>/config.toml`)

Contains all settings including credentials.

```toml
# Session storage
[session]
directory = ""    # Default: <data-dir>/sessions or .search-hub/sessions

# Logging
[log]
level = "info"                          # debug, info, warn, error

# Output preferences
[output]
color = true
progress_bar = true

# Provider configurations
[providers.pubmed]
enabled = true
api_key = ""                            # Optional but recommended
email = "user@example.com"              # Required by NCBI for tracking
rate_limit = 3                          # Requests per second (10 with key)
timeout = 30000                         # ms
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
rate_limit = 0.33                       # 1 request per 3 seconds
timeout = 60000                         # arXiv can be slow
retries = 3
max_results = 10000

[providers.scopus]
enabled = true
api_key = ""                            # Required
inst_token = ""                         # Optional institutional token
rate_limit = 2
timeout = 30000
retries = 3
max_results = 10000

[providers.wos]
enabled = false                         # Not yet implemented
api_key = ""

[providers.embase]
enabled = false                         # Not yet implemented

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
command = "ref"                         # CLI command name
auto_register = false                   # Auto-run ref add after search
with_abstracts = false
```

### Local Config (`.search-hub/config.toml`)

Project-specific overrides. Secret fields (`api_key`, `email`, `inst_token`) are excluded from generated files. Only override what you need.

```toml
# Example: project-specific overrides
[providers.pubmed]
max_results = 5000

[providers.scopus]
enabled = false    # Skip Scopus for this project

[integration.reference_manager]
auto_register = true
```

## Zod Schema (TypeScript)

```typescript
import { z } from 'zod';

const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  api_key: z.string().default(''),
  email: z.string().refine(
    (val) => val === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val),
    { message: 'Invalid email' }
  ).default(''),
  rate_limit: z.number().positive().default(3),
  timeout: z.number().positive().default(30000),
  retries: z.number().int().min(0).default(3),
  max_results: z.number().int().positive().default(10000),
  inst_token: z.string().default(''),
});

const ConfigSchema = z.object({
  session: z.object({
    directory: z.string().default(''),  // Empty = use platform default
  }).default({}),

  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }).default({}),

  output: z.object({
    color: z.boolean().default(true),
    progress_bar: z.boolean().default(true),
  }).default({}),

  providers: z.object({
    pubmed: ProviderConfigSchema.default({}),
    eric: ProviderConfigSchema.default({}),
    arxiv: ProviderConfigSchema.default({}),
    scopus: ProviderConfigSchema.default({}),
    wos: ProviderConfigSchema.default({}),
    embase: ProviderConfigSchema.default({}),
  }).default({}),

  fulltext: z.object({
    enabled: z.boolean().default(true),
    auto_convert_markdown: z.boolean().default(true),
    auto_attach_on_register: z.boolean().default(true),
    sources: z.object({
      unpaywall_email: z.string().default(''),
      core_api_key: z.string().default(''),
      ncbi_email: z.string().default(''),
      ncbi_tool: z.string().default('search-hub'),
      prefer_sources: z.array(z.string()).default(['pmc', 'arxiv', 'unpaywall', 'core']),
    }).default({}),
    download: z.object({
      concurrent_downloads: z.number().int().positive().default(3),
      retry_attempts: z.number().int().min(0).default(3),
    }).default({}),
  }).default({}),

  integration: z.object({
    reference_manager: z.object({
      enabled: z.boolean().default(true),
      command: z.string().default('ref'),
      auto_register: z.boolean().default(false),
      with_abstracts: z.boolean().default(false),
    }).default({}),
  }).default({}),
});

type Config = z.infer<typeof ConfigSchema>;
```

## Config Loading Logic

```typescript
import envPaths from 'env-paths';

const paths = envPaths('search-hub');

async function loadConfig(options: LoadConfigOptions): Promise<Config> {
  // 1. Start with defaults
  let config = getDefaultConfig();

  // 2. Load global config
  const globalPath = join(paths.config, 'config.toml');
  config = deepMerge(config, await loadToml(globalPath));

  // 3. Load local config (.search-hub/config.toml)
  const localPath = '.search-hub/config.toml';
  config = deepMerge(config, await loadToml(localPath));

  // 4. Apply environment variables
  config = applyEnvVars(config);

  // 5. Apply explicit --config file (if provided)
  if (options.explicitConfigPath) {
    config = deepMerge(config, await loadToml(options.explicitConfigPath));
  }

  // 6. Apply CLI arguments
  config = applyCLIOptions(config, options);

  // 7. Validate
  config = ConfigSchema.parse(config);

  // 8. Resolve session directory
  //    - If inside project (.search-hub/ exists): .search-hub/sessions/
  //    - Otherwise: <data-dir>/sessions/
  if (!config.session.directory) {
    config.session.directory = await isInsideProject()
      ? '.search-hub/sessions'
      : join(paths.data, 'sessions');
  }

  return config;
}
```

## Init Command

### Local Init (default)

```bash
search-hub init
```

Creates `.search-hub/` directory in the current working directory with:
- `.search-hub/config.toml` — project config (no secrets)
- `.search-hub/sessions/` — session storage
- `.search-hub/queries/` — query files

Options:
- `--force` — overwrite existing config

### Global Init

```bash
search-hub init --global
```

Creates `<config-dir>/config.toml` with defaults and credential hints as comments.

Options:
- `--force` — overwrite existing config

## Config Command

```bash
search-hub config [key] [value]
```

Read and write configuration values.

### Subcommands

| Usage | Description |
|-------|-------------|
| `search-hub config` | Show all config values |
| `search-hub config <key>` | Show value for a specific key |
| `search-hub config <key> <value>` | Set a config value |

### Flags

| Flag | Description |
|------|-------------|
| `--global` | Target global config file |
| `--local` | Target local project config file |
| `--show-origin` | Show where each config value comes from (env/local/global/default) |
| `--env-vars` | Show environment variable mappings |

### Write Scope Resolution

When setting a value:
- `--global` and `--local` are mutually exclusive
- `--local` outside a project is an error
- Default: local if inside project (`.search-hub/` exists), global otherwise

### Secret Key Warning

Setting secret keys (`api_key`, `email`, `inst_token`) to local config triggers a warning, as secrets should be stored in global config or environment variables.

### Examples

```bash
# View all config with origins
search-hub config --show-origin

# View environment variable mappings
search-hub config --env-vars

# Set a global config value
search-hub config --global providers.pubmed.api_key "my-key"

# Set a local project override
search-hub config --local providers.pubmed.max_results 5000

# View a single key
search-hub config providers.pubmed.rate_limit
```
