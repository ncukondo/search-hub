# @ncukondo/search-hub

[![npm version](https://img.shields.io/npm/v/@ncukondo/search-hub.svg)](https://www.npmjs.com/package/@ncukondo/search-hub)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI tool for systematic literature searching across multiple academic databases.

## Features

- **Multi-database search**: PubMed, ERIC, arXiv, Scopus (Web of Science, Embase planned)
- **Unified query syntax**: YAML-based DSL with automatic translation and JSON Schema support
- **Controlled vocabulary validation**: Validates MeSH, ERIC descriptors, and Emtree terms with typo suggestions
- **Reproducible searches**: Full session logging for PRISMA reporting
- **Result filtering**: Flexible query expressions (`-q`) to search and filter results by title, abstract, author, year, and more
- **Coverage verification**: Check whether known articles appear in search results for query quality validation
- **Session comparison**: Diff results between query iterations to track refinements
- **Resume support**: Continue interrupted searches at DB or page level
- **Review workflow**: Multi-reviewer screening with agreement tracking and finalization
- **Fulltext management**: OA discovery, automatic retrieval, PMC XML to Markdown conversion
- **Reference manager integration**: Works with [reference-manager](https://github.com/ncukondo/reference-manager)

## Installation

### Binary (no Node.js required)

Download the latest binary for your platform:

**Linux / macOS (Intel & Apple Silicon):**

```bash
curl -fsSL https://raw.githubusercontent.com/ncukondo/search-hub/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/ncukondo/search-hub/main/install.ps1 | iex
```

Or download manually from [GitHub Releases](https://github.com/ncukondo/search-hub/releases).

### npm

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
search-hub query init "my review"
```

This creates `queries/my-review.yaml` with JSON Schema support for editor autocompletion. Edit it to define your search:

```yaml
# yaml-language-server: $schema=./query.schema.json
name: "my review"
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
search-hub query validate my-review
```

This checks structure, validates controlled vocabulary terms (MeSH, ERIC descriptors, Emtree) against external APIs, and suggests corrections for typos. The query name is automatically resolved to `queries/my-review.yaml`.

4. Run search:
```bash
search-hub search my-review
```

5. Export results:
```bash
search-hub export <session-id> --format ids
```

## Query Development

Developing an effective search query is iterative. Start broad, then refine based on results.

### Workflow

1. **Create a query** - Start with a template:
   ```bash
   search-hub query init "my review"
   # Creates queries/my-review.yaml
   ```

2. **Check hit counts** - Preview before downloading:
   ```bash
   search-hub search my-review --count-only
   ```

3. **Run the search** - When counts look good:
   ```bash
   search-hub search my-review
   ```

4. **Review results** - Check titles to assess quality:
   ```bash
   search-hub results <session-id> --limit 50
   search-hub results <session-id> -q "title:diabetes year:2023-2025"
   ```

5. **Refine and re-run** - Edit the query file, then iterate:
   ```bash
   $EDITOR queries/my-review.yaml
   search-hub search my-review --count-only   # Re-check counts
   search-hub search my-review                # Execute full search
   ```

6. **Compare results with diff** - See what changed:
   ```bash
   search-hub diff <session-v1> <session-v2> --show removed
   ```
   This shows articles excluded by your refinements. Review these to ensure you're not losing relevant papers.

### Tips for Effective Refinement

- **Use `--count-only` first**: Check hit counts before downloading full results.
  ```bash
  search-hub search my-review --count-only
  ```

- **Use `--preview`** to see hit counts with sample titles:
  ```bash
  search-hub search my-review --preview
  ```

- **Use `--dry-run`** to preview translations: See exactly what query each database will receive.
  ```bash
  search-hub search my-review --dry-run
  ```

- **Compare removed articles carefully**: When narrowing a search, `--show removed` reveals what you're excluding. If important papers are removed, your refinement may be too aggressive.

- **Track iterations**: Use `query assess` and `query log` to record and review your refinement history.

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
