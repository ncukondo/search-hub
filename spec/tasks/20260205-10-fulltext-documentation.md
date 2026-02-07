# Task: Fulltext Management Documentation

## Purpose

Update user-facing documentation for the fulltext management feature:
- README.md features section
- docs/commands.md with fulltext commands
- docs/configuration.md with fulltext settings
- New docs/fulltext.md guide

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - Technical specification

## Related Source Files

- `README.md`
- `docs/commands.md`
- `docs/configuration.md`
- `docs/fulltext.md` (new)

## Dependencies

- All fulltext implementation tasks (59-65) should be completed or near completion

## Implementation Steps

### Step 1: Update README.md

- [x] Add "Fulltext management" to Features section
  - OA discovery and automatic retrieval
  - PMC XML to Markdown conversion
  - Manual PDF management
  - Auto-attach on register
- [x] Add brief example in Quick Start or new section
- [x] Acceptance: README reflects fulltext capabilities

### Step 2: Update docs/commands.md

- [x] Add `fulltext` command group section
  - `fulltext init` - Create directories for manual download
  - `fulltext sync` - Detect manually added files
  - `fulltext check` - Check OA availability
  - `fulltext fetch` - Download OA fulltexts
  - `fulltext convert` - Convert PMC XML to Markdown
  - `fulltext attach` - Attach to reference-manager
  - `fulltext status` - Show retrieval status
  - `fulltext pending` - List articles needing manual download
- [x] Document options for each command
- [x] Add examples
- [x] Acceptance: All fulltext commands documented

### Step 3: Update docs/configuration.md

- [x] Add `[fulltext]` section
  - `enabled`
  - `auto_convert_markdown`
  - `auto_attach_on_register`
- [x] Add `[fulltext.sources]` section
  - `unpaywall_email`
  - `core_api_key`
  - `prefer_sources`
- [x] Add `[fulltext.download]` section
  - `concurrent_downloads`
  - `retry_attempts`
- [x] Add environment variable alternatives (noted as not yet implemented in `env.ts`; documented the gap)
- [x] Acceptance: All fulltext config options documented

### Step 4: Create docs/fulltext.md Guide

- [x] Create comprehensive fulltext management guide
  - Overview and capabilities
  - Data sources (Unpaywall, PMC, arXiv, CORE)
  - Directory structure explanation
  - Workflow examples:
    - Automated OA retrieval
    - Manual download workflow
    - Mixed workflow
  - Integration with register command
  - Troubleshooting
- [x] Add diagrams if helpful (ASCII or Mermaid) — N/A: documentation is clear without diagrams
- [x] Acceptance: New users can understand and use fulltext features

### Step 5: Cross-link Documentation

- [x] Add links from README to docs/fulltext.md
- [x] Add links from docs/commands.md to docs/fulltext.md
- [x] Update docs index if exists
- [x] Acceptance: Documentation is well-connected

### Final Step: Review and Verify

- [x] Review all documentation for accuracy
- [x] Verify command examples work
- [x] Check for consistency with implementation
- [x] **Manual verification**: Follow guide as new user
- [x] Acceptance: Documentation is accurate and helpful

## Documentation Structure

### README.md Addition

```markdown
## Features

...
- **Fulltext management**: OA discovery, automatic retrieval, PMC→Markdown conversion
...
```

### docs/fulltext.md Outline

```markdown
# Fulltext Management

## Overview
## Data Sources
### Unpaywall
### PubMed Central
### arXiv
### CORE API
## Directory Structure
## Workflows
### Automated Retrieval
### Manual Download
### Mixed Approach
## Configuration
## Commands Reference
## Integration with Register
## Troubleshooting
```

### docs/commands.md Addition

```markdown
## fulltext

Manage fulltext retrieval for session articles.

### fulltext init

Create directories for included articles with metadata and README.

### fulltext sync

Detect and register manually added files.

### fulltext check

Check OA availability across configured sources.

...
```

## Notes

- Documentation should be concise but complete
- Include practical examples users can copy
- Explain "why" not just "how" for workflows
- Keep technical details in spec, user guide in docs
