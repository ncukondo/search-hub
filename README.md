# @ncukondo/search-hub

[![npm version](https://img.shields.io/npm/v/@ncukondo/search-hub.svg)](https://www.npmjs.com/package/@ncukondo/search-hub)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI tool for systematic literature searching across multiple academic databases.

## Features

- **Multi-database search**: PubMed, ERIC, arXiv, Scopus (Web of Science, Embase planned)
- **Unified query syntax**: YAML-based DSL with automatic translation and JSON Schema support
- **Controlled vocabulary validation**: Validates MeSH, ERIC descriptors, and Emtree terms with typo suggestions
- **Reproducible searches**: Full session logging for PRISMA reporting
- **Session comparison**: Diff results between query iterations to track refinements
- **Resume support**: Continue interrupted searches at DB or page level
- **Review workflow**: Multi-reviewer screening with agreement tracking and finalization
- **Fulltext management**: OA discovery, automatic retrieval, PMC XML to Markdown conversion
- **Reference manager integration**: Works with [reference-manager](https://github.com/ncukondo/reference-manager)

## Installation

```bash
npm install -g @ncukondo/search-hub
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

2. Create a query file:
```bash
search-hub query init -o query.yaml
```

This generates a YAML template with JSON Schema support for editor autocompletion. Edit it to define your search:

```yaml
# yaml-language-server: $schema=./query.schema.json
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

3. Validate the query:
```bash
search-hub query validate query.yaml
```

This checks structure, validates controlled vocabulary terms (MeSH, ERIC descriptors, Emtree) against external APIs, and suggests corrections for typos.

4. Run search:
```bash
search-hub search query.yaml
```

5. Export results:
```bash
search-hub export <session-id> --format ids
```

## Query Development

Developing an effective search query is iterative. Start broad, then refine based on results.

### Workflow

1. **Start with a broad query** - Get an initial set of results:
   ```bash
   search-hub search query-v1.yaml --max-results 100
   ```

2. **Review initial results** - Check titles to assess quality:
   ```bash
   search-hub results <session-v1> --limit 50
   ```

3. **Refine the query** - Copy and modify your query file:
   ```bash
   cp query-v1.yaml query-v2.yaml
   # Edit query-v2.yaml to add/remove terms, adjust filters
   ```

4. **Run the refined search**:
   ```bash
   search-hub search query-v2.yaml --max-results 100
   ```

5. **Compare results with diff** - See what changed:
   ```bash
   search-hub diff <session-v1> <session-v2> --show removed
   ```
   This shows articles excluded by your refinements. Review these to ensure you're not losing relevant papers.

### Tips for Effective Refinement

- **Use `--count-only` first**: Check hit counts before downloading full results.
  ```bash
  search-hub search query.yaml --count-only
  ```

- **Use `--preview`** to see hit counts with sample titles:
  ```bash
  search-hub search query.yaml --preview
  ```

- **Use `--dry-run`** to preview translations: See exactly what query each database will receive.
  ```bash
  search-hub search query.yaml --dry-run
  ```

- **Compare removed articles carefully**: When narrowing a search, `--show removed` reveals what you're excluding. If important papers are removed, your refinement may be too aggressive.

- **Keep query versions**: Save each iteration (v1, v2, v3) to track your development process and maintain reproducibility.

## Fulltext Retrieval

After screening, retrieve fulltext articles for included papers:

```bash
# Check Open Access availability
search-hub fulltext check --session <session-id>

# Download available OA fulltexts (auto-converts PMC XML to Markdown)
search-hub fulltext fetch <session-id>

# For non-OA articles: create directories for manual download
search-hub fulltext init <session-id>
search-hub fulltext pending <session-id>

# After manually adding PDFs, sync and register
search-hub fulltext sync <session-id>
search-hub register <session-id>
```

See [Fulltext Management Guide](./docs/fulltext.md) for details.

## Documentation

- [Query Guide](./docs/query-guide.md) - How to write query files (DSL, JSON Schema, vocabulary validation)
- [Command Reference](./docs/commands.md) - All CLI commands and options
- [Configuration](./docs/configuration.md) - Setup and configuration
- [Databases](./docs/databases.md) - Supported databases, controlled vocabularies, and tips
- [Fulltext Management](./docs/fulltext.md) - Fulltext retrieval and management

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
