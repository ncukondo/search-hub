# search-hub

A CLI tool for systematic literature searching across multiple academic databases.

## Features

- **Multi-database search**: PubMed, ERIC, arXiv, Scopus (Web of Science, Embase planned)
- **Unified query syntax**: YAML-based DSL with automatic translation
- **Reproducible searches**: Full session logging for PRISMA reporting
- **Resume support**: Continue interrupted searches at DB or page level
- **Reference manager integration**: Works with [reference-manager](https://github.com/ncukondo/reference-manager)

## Installation

```bash
npm install -g search-hub
```

Requires Node.js 22+.

## Quick Start

1. Initialize configuration:
```bash
search-hub init
```

This creates config and data directories in platform-specific locations:

| Platform | Config | Data |
|----------|--------|------|
| Linux | `~/.config/search-hub/` | `~/.local/share/search-hub/` |
| macOS | `~/Library/Preferences/search-hub/` | `~/Library/Application Support/search-hub/` |
| Windows | `%APPDATA%/search-hub/Config/` | `%LOCALAPPDATA%/search-hub/Data/` |

2. Create a query file (`query.yaml`):
```yaml
name: my_review
description: "Literature search for scoping review"

query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - "machine learning"
    operator: OR

filters:
  year_from: 2020
  language:
    - en
```

3. Run search:
```bash
search-hub search query.yaml
```

4. Export results:
```bash
search-hub export <session-id> --format ids
```

## Documentation

See [spec/](./spec/) for detailed specifications.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint
npm run lint

# Build
npm run build
```

## License

MIT
