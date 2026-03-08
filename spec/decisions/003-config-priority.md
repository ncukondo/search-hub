# ADR-003: Configuration Priority

## Status

Accepted (Updated)

## Context

Configuration values come from multiple sources:
- Global defaults
- User config file
- Project-local config
- Environment variables
- CLI arguments

Need clear precedence rules.

## Decision

Priority (highest to lowest):
1. CLI arguments
2. Explicit `--config <path>` file
3. Environment variables
4. Local config (`.search-hub/config.toml` in project root)
5. Global config (platform-specific, e.g., `~/.config/search-hub/config.toml` on Linux)
6. Built-in defaults

Implementation:
- Deep merge configs (field-level override)
- Environment variables follow `SEARCH_HUB_` prefix convention
- Zod validation after merge
- Two-tier design: global for credentials/preferences, local for project overrides
- Project detection via `.search-hub/` directory existence

## Consequences

### Positive

- Flexible configuration
- CI/CD friendly (env vars)
- Project-specific overrides via `.search-hub/config.toml`
- Secure API key handling (env vars or global config only)
- Secrets excluded from local config by default

### Negative

- Debugging config source can be tricky
  - Mitigated by `search-hub config --show-origin` which displays the origin (env/local/global/default) of each value
- Need clear documentation

### Neutral

- Matches common CLI tool patterns
