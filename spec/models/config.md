# Configuration Specification

## Configuration Priority

```
Highest ──► CLI arguments
         │  Environment variables
         │  Local config (./search-hub.config.toml)
Lowest  ──► Global config (~/.search-hub/config.toml)
```

Later sources override earlier ones at the field level (deep merge).

## Config File Locations

| Location | Purpose |
|----------|---------|
| `~/.search-hub/config.toml` | Global defaults, API keys |
| `./search-hub.config.toml` | Project-specific overrides |

## Environment Variables

| Variable | Maps To |
|----------|---------|
| `SEARCH_HUB_PUBMED_API_KEY` | `providers.pubmed.api_key` |
| `SEARCH_HUB_SCOPUS_API_KEY` | `providers.scopus.api_key` |
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

```toml
# ~/.search-hub/config.toml

# Session storage
[session]
directory = "~/.search-hub/sessions"    # Default session location

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
max_results = 10000                     # Per search limit

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

# Reference manager integration
[integration.reference_manager]
enabled = true
command = "ref"                         # CLI command name
auto_register = false                   # Auto-run ref add after search
```

## Zod Schema (TypeScript)

```typescript
import { z } from 'zod';

const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  api_key: z.string().optional(),
  email: z.string().email().optional(),
  rate_limit: z.number().positive().default(3),
  timeout: z.number().positive().default(30000),
  retries: z.number().int().min(0).default(3),
  max_results: z.number().int().positive().default(10000),
  inst_token: z.string().optional(),
});

const ConfigSchema = z.object({
  session: z.object({
    directory: z.string().default('~/.search-hub/sessions'),
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

  integration: z.object({
    reference_manager: z.object({
      enabled: z.boolean().default(true),
      command: z.string().default('ref'),
      auto_register: z.boolean().default(false),
    }).default({}),
  }).default({}),
});

type Config = z.infer<typeof ConfigSchema>;
```

## Config Loading Logic

```typescript
async function loadConfig(cliOptions: CLIOptions): Promise<Config> {
  // 1. Start with defaults
  let config = getDefaultConfig();

  // 2. Load global config
  const globalPath = expandPath('~/.search-hub/config.toml');
  if (await exists(globalPath)) {
    config = deepMerge(config, await loadToml(globalPath));
  }

  // 3. Load local config
  const localPath = './search-hub.config.toml';
  if (await exists(localPath)) {
    config = deepMerge(config, await loadToml(localPath));
  }

  // 4. Apply environment variables
  config = applyEnvVars(config);

  // 5. Apply CLI arguments
  config = applyCLIOptions(config, cliOptions);

  // 6. Validate
  return ConfigSchema.parse(config);
}
```

## Init Command

```bash
search-hub init
```

Creates `~/.search-hub/config.toml` with defaults and prompts for API keys:

```
? PubMed API key (optional): [input]
? PubMed contact email: user@example.com
? Scopus API key (required for Scopus): [input]
```
