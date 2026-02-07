# Fulltext Management

## Overview

search-hub can discover, download, and manage fulltext articles for your systematic review. It supports:

- **Open Access discovery** via Unpaywall, PubMed Central, arXiv, and CORE
- **Automatic retrieval** of freely available PDFs and XML
- **PMC XML to Markdown conversion** for text analysis
- **Manual download management** with organized directories and URL hints
- **Reference manager integration** for attaching fulltexts to library entries

Fulltext management operates on articles that have been screened and marked as `include` in the review workflow.

## Data Sources

### Unpaywall

Primary source for OA discovery. Covers 30M+ OA articles. Requires an email address in configuration (free, no registration).

### PubMed Central (PMC)

Provides both PDF and structured XML (JATS format). XML can be converted to Markdown, preserving section structure, tables, and figures. Uses the same API key as PubMed searches.

### arXiv

Direct PDF downloads for all arXiv preprints. No authentication required. Rate limited to 1 request per 3 seconds.

### CORE API

Broadest coverage (200M+ records). Includes repository copies, theses, and grey literature. Requires a free API key from CORE.

## Directory Structure

Fulltext files are stored in the session directory under `fulltext/`. Each article gets its own directory named `{citation-key}-{uuid8}`:

```
sessions/<session-id>/
└── fulltext/
    ├── smith2024-a1b2c3d4/
    │   ├── meta.json         # Metadata and retrieval status
    │   ├── README.md         # Identifiers, URLs, instructions
    │   ├── fulltext.pdf      # PDF file
    │   ├── fulltext.xml      # PMC JATS XML (if available)
    │   └── fulltext.md       # Converted Markdown
    ├── jones2023-e5f6g7h8/
    │   ├── meta.json
    │   ├── README.md
    │   └── fulltext.pdf
    └── chen2024-i9j0k1l2/
        ├── meta.json
        ├── README.md
        └── fulltext.md
```

File names within each directory are fixed: `fulltext.pdf`, `fulltext.xml`, `fulltext.md`. The `README.md` in each directory contains the article title, identifiers (DOI, PMID, PMC ID), download URLs, and instructions for manual file placement.

## Workflows

### Automated OA Retrieval

Best for reviews where most articles are OA:

```bash
# 1. After screening, check OA availability
search-hub fulltext check --session <session-id>

# 2. Download all available OA fulltexts
search-hub fulltext fetch <session-id>

# 3. Check status
search-hub fulltext status <session-id>

# 4. Register to reference-manager (fulltexts auto-attached)
search-hub register <session-id>
```

### Manual Download

For closed-access or when you prefer manual control:

```bash
# 1. Create directories with metadata and download URLs
search-hub fulltext init <session-id>

# 2. Download PDFs manually into each directory
#    e.g., copy fulltext.pdf to fulltext/smith2024-a1b2c3d4/

# 3. Sync to detect and register added files
search-hub fulltext sync <session-id>

# 4. Register to reference-manager
search-hub register <session-id>
```

Each directory's `README.md` includes publisher URLs and known download links to help locate the article.

### Mixed (OA + Manual)

Combine both approaches for maximum coverage:

```bash
# 1. Fetch available OA articles
search-hub fulltext fetch <session-id>

# 2. Create directories for remaining articles
search-hub fulltext init <session-id>

# 3. See what still needs manual download
search-hub fulltext pending <session-id>

# 4. Export URLs for batch download
search-hub fulltext pending <session-id> --export urls.txt

# 5. Manually download remaining PDFs

# 6. Sync and register
search-hub fulltext sync <session-id>
search-hub register <session-id>
```

## Configuration

Add fulltext settings to your config file (`config.toml`):

```toml
[fulltext]
enabled = true
auto_convert_markdown = true       # Convert PMC XML to Markdown on fetch
auto_attach_on_register = true     # Attach fulltexts on register

[fulltext.sources]
unpaywall_email = "you@example.com"  # Required for OA checks
core_api_key = ""                     # Optional, for broader coverage
prefer_sources = ["pmc", "arxiv", "unpaywall", "core"]

[fulltext.download]
concurrent_downloads = 3
retry_attempts = 3
```

See [Configuration Guide](./configuration.md#fulltext-settings) for full details.

## Commands Reference

| Command | Description |
|---------|-------------|
| `fulltext check --session <id>` | Check OA availability |
| `fulltext fetch <id>` | Download OA fulltexts |
| `fulltext init <id>` | Create directories for manual download |
| `fulltext sync <id>` | Detect manually added files |
| `fulltext convert <id>` | Convert PMC XML to Markdown |
| `fulltext attach <id>` | Attach fulltexts to reference-manager |
| `fulltext status <id>` | Show retrieval status |
| `fulltext pending <id>` | List articles needing manual download |

All commands support `--dry-run` where applicable. See [Command Reference](./commands.md#fulltext) for full options.

## Integration with Register

The `register` command automatically attaches fulltext files (PDF and Markdown) to reference-manager entries. This happens by default when fulltexts are available:

```bash
# Register with automatic fulltext attachment (default)
search-hub register <session-id>

# Skip fulltext attachment
search-hub register <session-id> --no-attach-fulltext
```

Both newly added and already-existing entries receive fulltext attachments when matching files are found.

## Troubleshooting

### "No articles found" on fulltext commands

Fulltext commands operate on articles with `finalDecision=include`. Ensure you have completed the review workflow and marked articles for inclusion.

### Unpaywall returns no results

- Verify `unpaywall_email` is set in your config
- Check that articles have DOIs (Unpaywall requires DOI-based lookup)
- Some articles may be closed access with no OA version available

### Fetch downloads fail

- Check your network connection
- Some sources rate-limit aggressively. The tool respects rate limits and retries automatically
- Use `--source` to fetch from specific sources if one is unreliable
- Check `fulltext status` to see what was downloaded vs. failed

### PMC XML conversion produces incomplete Markdown

- Some PMC articles use non-standard XML structures
- The converter handles standard JATS elements (sections, tables, figures, citations)
- For complex articles, the original XML is preserved alongside the Markdown

### Reference-manager attachment fails

- Ensure reference-manager (`ref`) is installed and accessible
- Articles must be registered in reference-manager before attachment
- Use `fulltext attach --dry-run` to preview what would be attached
