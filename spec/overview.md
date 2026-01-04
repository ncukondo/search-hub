# Project Overview

## Purpose

`search-hub` is a CLI tool for systematic literature searching across multiple academic databases. It is designed for scoping reviews and systematic reviews, providing:

- Unified query syntax across databases
- Reproducible search sessions with full logging
- Integration with `reference-manager` for citation management

## Target Users

- Researchers conducting scoping/systematic reviews
- Academic writers needing comprehensive literature searches
- Anyone requiring reproducible, documented searches

## Supported Databases

### Phase 1 (Initial Release)

| Database | API | Auth | Status |
|----------|-----|------|--------|
| PubMed | E-utilities | API key (optional, recommended) | Planned |
| ERIC | Free API | None | Planned |
| arXiv | OAI-PMH / Atom | None | Planned |
| Scopus | Elsevier API | API key (institutional) | Planned |

### Phase 2 (Future)

| Database | API | Auth | Status |
|----------|-----|------|--------|
| Web of Science | Starter/Expanded API | API key | Pending API access |
| Embase | N/A | Institutional | No API access |

## Core Features

### 1. Unified Query DSL
- YAML-based query definition
- Automatic translation to database-native syntax
- Support for controlled vocabularies (MeSH, etc.)

### 2. Search Session Management
- Persistent session folders with all artifacts
- Resume interrupted searches (DB-level and page-level)
- Full audit trail for PRISMA reporting

### 3. Reference Manager Integration
- Export DOI/PMID lists for `ref add`
- Direct invocation of `ref` commands
- Batch update of abstracts/metadata

### 4. Rate Limiting & Reliability
- Automatic rate limiting per database
- Retry with exponential backoff
- Graceful error handling (continue other DBs on failure)

## Non-Goals

- Full-text PDF retrieval
- Citation network analysis
- Deduplication (handled by reference-manager)
- GUI interface

## Technical Stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js 22+ |
| Language | TypeScript (ESM only) |
| CLI Framework | Commander.js |
| Config | TOML (@iarna/toml) |
| Validation | Zod v4 |
| HTTP | Native fetch |
| Testing | Vitest |
| Lint/Format | oxlint |

## Related Projects

- [reference-manager](https://github.com/ncukondo/reference-manager) - Citation management CLI using CSL-JSON
