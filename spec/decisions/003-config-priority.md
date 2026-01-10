# ADR-003: Configuration Priority

## Status

Accepted

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
2. Environment variables
3. Local config (`./search-hub.config.toml`)
4. Global config (platform-specific, e.g., `~/.config/search-hub/config.toml` on Linux)
5. Built-in defaults

Implementation:
- Deep merge configs (field-level override)
- Environment variables follow `SEARCH_HUB_` prefix convention
- Zod validation after merge

## Consequences

### Positive

- Flexible configuration
- CI/CD friendly (env vars)
- Project-specific overrides possible
- Secure API key handling (env vars)

### Negative

- Debugging config source can be tricky
- Need clear documentation

### Neutral

- Matches common CLI tool patterns
