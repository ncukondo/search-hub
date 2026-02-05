# Fulltext Management Specification

This document specifies the fulltext retrieval and management features for search-hub.

## Overview

Extend search-hub with capabilities to:
1. **Discover** fulltext availability (OA status, URLs)
2. **Retrieve** fulltext automatically where legally available (OA)
3. **Convert** PMC XML to Markdown for text analysis
4. **Manage** manually downloaded files (PDF)
5. **Integrate** with reference-manager (`ref fulltext attach`)

## Scope

### In Scope

| Feature | Description |
|---------|-------------|
| OA Discovery | Check OA status via Unpaywall, PMC, CORE |
| OA Auto-Retrieval | Download legally available OA PDFs and XMLs |
| PMC XML to Markdown | Convert PMC JATS XML to readable Markdown |
| arXiv PDF | Direct PDF download from arXiv |
| Manual PDF Management | Init directories, sync manually added files |
| Download URL Hints | Show URLs for manual download in README |
| ref Integration | Auto-attach on `register`, standalone `fulltext attach` |
| Independent Storage | Session-local fulltext storage |

### Out of Scope

| Feature | Reason |
|---------|--------|
| Paywall bypass | Legal/ethical concerns |
| Institutional proxy | Complex authentication, institution-specific |
| OCR for scanned PDFs | Separate concern, use external tools |
| PDF text extraction | Use reference-manager or external tools |

## Data Sources

### 1. Unpaywall (Primary)

- **API**: `https://api.unpaywall.org/v2/{doi}?email={email}`
- **Auth**: Email required (free)
- **Coverage**: 30M+ OA articles
- **Returns**: OA locations (publisher, repository, PMC, etc.)
- **Rate Limit**: 100,000 requests/day

### 2. PubMed Central (PMC)

- **API**: E-utilities (same as PubMed search)
- **Auth**: API key (optional, recommended)
- **Coverage**: 8M+ free articles
- **Formats**:
  - PDF: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{id}/pdf/`
  - XML (JATS): `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmcid}`
- **Advantage**: Structured XML for Markdown conversion

### 3. arXiv (Direct)

- **URL Pattern**: `https://arxiv.org/pdf/{id}.pdf`
- **Auth**: None
- **Coverage**: All arXiv preprints
- **Rate Limit**: Respect robots.txt (3 seconds between requests)

### 4. CORE API

- **API**: `https://api.core.ac.uk/v3/`
- **Auth**: API key (free registration)
- **Coverage**: 200M+ records, 25M+ fulltext
- **Returns**: Download URLs for repository copies
- **Advantage**: Broader coverage than Unpaywall (includes thesis, grey literature)

## Architecture

### Directory Structure

Each article has its own directory named `{citation-key}-{uuid8}`:
- `citation-key`: Auto-generated (e.g., `smith2024`), with suffix on collision
- `uuid8`: First 8 characters of UUID for uniqueness

```
sessions/<session-id>/
├── session.json
├── .internal/
│   └── reviews.yaml          # Contains fulltext references
└── fulltext/
    ├── fulltext-index.json   # Central index for lookup
    ├── smith2024-a1b2c3d4/
    │   ├── meta.json         # Article metadata & retrieval info
    │   ├── README.md         # Human-readable info with URLs
    │   ├── fulltext.pdf      # Downloaded or imported PDF
    │   ├── fulltext.xml      # PMC JATS XML (if available)
    │   └── fulltext.md       # Converted Markdown
    ├── jones2023-e5f6g7h8/
    │   ├── meta.json
    │   ├── README.md
    │   └── fulltext.pdf
    └── chen2024-i9j0k1l2/
        ├── meta.json
        ├── README.md
        └── fulltext.md       # Markdown only (no PDF)
```

### File Naming Convention

Files within each article directory use fixed names:
- `meta.json` - Metadata and retrieval status
- `README.md` - Human-readable info (title, DOI, URLs, instructions)
- `fulltext.pdf` - PDF file
- `fulltext.xml` - PMC XML file
- `fulltext.md` - Markdown conversion

### meta.json Schema

```typescript
interface FulltextMeta {
  // Directory identity
  dirName: string;           // "smith2024-a1b2c3d4"
  citationKey: string;       // "smith2024"
  uuid: string;              // Full UUID

  // Article identifiers (for matching)
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;

  // Bibliographic info (for reference)
  title: string;
  authors?: string;
  year?: string;

  // OA Discovery results
  oaStatus: 'open' | 'closed' | 'unknown' | 'unchecked';
  oaLocations?: OALocation[];
  checkedAt?: string;        // ISO 8601

  // Retrieved files
  files: {
    pdf?: FileInfo;
    xml?: FileInfo;
    markdown?: FileInfo;
  };

  // Manual download info
  pendingDownload?: {
    suggestedUrls: string[];
    addedAt: string;
  };
}

interface OALocation {
  source: 'unpaywall' | 'pmc' | 'arxiv' | 'core' | 'publisher';
  url: string;
  urlType: 'pdf' | 'xml' | 'html' | 'repository';
  version: 'published' | 'accepted' | 'submitted';
  license?: string;
}

interface FileInfo {
  filename: string;          // "fulltext.pdf"
  source: string;            // "pmc", "arxiv", "unpaywall", "manual"
  retrievedAt: string;       // ISO 8601
  size?: number;             // bytes
  convertedFrom?: string;    // For markdown: "fulltext.xml"
}
```

### README.md Template

Generated by `fulltext init`:

```markdown
# smith2024

**Title**: Machine Learning in Healthcare: A Systematic Review

## Identifiers

- DOI: 10.1234/example
- PMID: 12345678
- PMC: PMC1234567

## Download URLs

- Publisher: https://publisher.com/doi/10.1234/example
- PMC PDF: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/
- PMC XML: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=1234567

## Instructions

Place fulltext files in this directory:
- `fulltext.pdf` - PDF version
- `fulltext.md` - Markdown version (optional)

After adding files, run:
```
search-hub fulltext sync <session-id>
```
```

### fulltext-index.json Schema

Central index for fast lookup by identifier:

```typescript
interface FulltextIndex {
  sessionId: string;
  updatedAt: string;
  entries: Record<string, FulltextIndexEntry>;  // key: dirName
}

interface FulltextIndexEntry {
  dirName: string;
  citationKey: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
  hasFiles: {
    pdf: boolean;
    xml: boolean;
    markdown: boolean;
  };
}
```

### ArticleEntry Extension (reviews.yaml)

Add fulltext reference to existing `ArticleEntry`:

```typescript
interface ArticleEntry {
  // Existing fields...
  doi?: string;
  pmid?: string;
  title: string;
  // ...

  // NEW: Fulltext reference
  fulltext?: {
    dirName: string;         // "smith2024-a1b2c3d4" - links to fulltext/<dirName>/
    hasFiles: {
      pdf: boolean;
      xml: boolean;
      markdown: boolean;
    };
  };
}
```

## Citation Key Generation

### Algorithm

1. Extract first author's family name (lowercase, ASCII-only)
2. Append publication year
3. If collision, append suffix: `a`, `b`, `c`, ...
4. Append `-{uuid8}` for directory name

### Examples

| Authors | Year | Citation Key | Dir Name |
|---------|------|--------------|----------|
| Smith, J. | 2024 | smith2024 | smith2024-a1b2c3d4 |
| Smith, J. (2nd) | 2024 | smith2024a | smith2024a-e5f6g7h8 |
| Müller, K. | 2023 | muller2023 | muller2023-i9j0k1l2 |
| 田中, 太郎 | 2024 | tanaka2024 | tanaka2024-m3n4o5p6 |

### Edge Cases

- No author: Use "unknown"
- No year: Use "0000"
- Non-ASCII: Transliterate to ASCII (romaji for Japanese)

## CLI Commands

### `fulltext init`

Create directories for included articles with meta.json and README.

```bash
# Create directories for all included articles
search-hub fulltext init <session-id>

# Dry run (show what would be created)
search-hub fulltext init <session-id> --dry-run
```

**Target**: Only articles with `finalDecision=include` in reviews.yaml

**Creates for each article**:
- `fulltext/<citation-key>-<uuid8>/meta.json`
- `fulltext/<citation-key>-<uuid8>/README.md`

**Output Example**:
```
Initializing fulltext directories for 45 included articles...

Created:
  ✓ 45 directories created

  Sessions/<id>/fulltext/
    smith2024-a1b2c3d4/   (DOI: 10.1234/example)
    jones2023-e5f6g7h8/   (PMID: 12345678)
    chen2024-i9j0k1l2/    (arXiv: 2401.12345)
    ...

Next steps:
  1. Add fulltext.pdf or fulltext.md to each directory
  2. Run `fulltext sync <session-id>` to register added files
```

### `fulltext sync`

Detect and register manually added files.

```bash
# Sync all directories
search-hub fulltext sync <session-id>

# Dry run (show what would be synced)
search-hub fulltext sync <session-id> --dry-run
```

**Behavior**:
1. Scan all directories in `fulltext/`
2. Detect new files: `fulltext.pdf`, `fulltext.md`, `fulltext.xml`
3. Update `meta.json` with file info
4. Update `fulltext-index.json`
5. Update `reviews.yaml` fulltext references

**Output Example**:
```
Syncing fulltext directories...

Found new files:
  ✓ smith2024-a1b2c3d4/fulltext.pdf (2.3 MB)
  ✓ jones2023-e5f6g7h8/fulltext.pdf (1.8 MB)
  ✓ jones2023-e5f6g7h8/fulltext.md (45 KB)
  ✓ chen2024-i9j0k1l2/fulltext.md (38 KB)

Summary:
  4 files synced (3 PDFs, 2 Markdowns)
  3 articles updated

Reviews updated: .internal/reviews.yaml
```

### `fulltext check`

Check OA availability for session articles.

```bash
# Check OA status for included articles
search-hub fulltext check <session-id>

# Output options
search-hub fulltext check <session-id> --format table   # Default
search-hub fulltext check <session-id> --format json
```

**Output Example**:
```
Checking fulltext availability for 45 articles...

OA Status Summary:
  Open Access:    20  (downloadable)
     - PMC:       12
     - Unpaywall:  5
     - arXiv:      3
  Partial OA:     10  (repository version, etc.)
  Closed Access:  15

Run `fulltext fetch` to download available OA articles.
Run `fulltext init` to create directories for manual download.
```

### `fulltext fetch`

Download available OA fulltexts.

```bash
# Fetch all available OA articles
search-hub fulltext fetch <session-id>

# Fetch specific sources only
search-hub fulltext fetch <session-id> --source pmc,arxiv

# Include PMC XML -> Markdown conversion
search-hub fulltext fetch <session-id> --convert-markdown

# Dry run
search-hub fulltext fetch <session-id> --dry-run
```

**Output Example**:
```
Fetching fulltext for 20 OA articles...

Progress: [=================>          ] 15/20

Downloaded:
  PDF:      15  (PMC: 10, arXiv: 3, Unpaywall: 2)
  XML:      10  (PMC)
  Markdown: 10  (converted from XML)

Failed:
  2 articles (rate limited, will retry)

Saved to: sessions/<id>/fulltext/
```

### `fulltext pending`

Show articles needing manual download.

```bash
# List articles without fulltext
search-hub fulltext pending <session-id>

# Export URLs for manual download
search-hub fulltext pending <session-id> --export urls.txt
```

### `fulltext import`

Import PDFs from external directory (batch).

```bash
# Import from directory (auto-match by DOI in filename)
search-hub fulltext import <session-id> --dir ./downloads/

# Import single PDF with explicit DOI
search-hub fulltext import <session-id> --file paper.pdf --doi 10.1234/example
```

**Note**: For placing files directly into fulltext directories, use `fulltext init` + manual copy + `fulltext sync` instead.

### `fulltext convert`

Convert PMC XML to Markdown.

```bash
# Convert all XML files in session
search-hub fulltext convert <session-id>

# Convert specific article
search-hub fulltext convert <session-id> --article smith2024-a1b2c3d4
```

### `fulltext attach`

Standalone command to export fulltexts to reference-manager.

```bash
# Attach all fulltexts to ref entries
search-hub fulltext attach <session-id>

# Dry run
search-hub fulltext attach <session-id> --dry-run
```

### `fulltext status`

Show fulltext retrieval status.

```bash
search-hub fulltext status <session-id>
```

**Output**:
```
Fulltext Status: my-session

  Included articles: 45
  With fulltext:     30
    - PDF only:      15
    - Markdown only:  5
    - Both:          10
  Pending:           10  (directories created, no files)
  Not initialized:    5  (no directory)
```

## Register Command Integration

### Extended `register` Flow

The `register` command is extended to automatically attach fulltexts:

```
1. Convert articles to CSL-JSON
2. Bulk import via `ref add -i json`
3. For each successfully registered article with fulltext:
   - Attach PDF via `ref fulltext attach <ref-id> <path>`
   - Attach Markdown via `ref fulltext attach <ref-id> <path>`
4. Save RegistrationRecord (including fulltext attach results)
```

### CLI Options

```bash
# Default: attach fulltexts automatically
search-hub register <session-id>

# Disable fulltext attach
search-hub register <session-id> --no-attach-fulltext

# Dry run
search-hub register <session-id> --dry-run
```

### Attach Behavior

- **Both formats**: If both PDF and Markdown exist, both are attached
- **Matching**: Uses DOI/PMID to match fulltext directory to registered ref entry
- **Idempotent**: Re-running register skips already-attached files

### Extended RegistrationRecord

```typescript
interface RegistrationRecord {
  // Existing fields...
  sessionId: string;
  timestamp: string;
  summary: {
    total: number;
    added: number;
    skipped: number;
    failed: number;
    noId: number;
  };
  added: Array<{ source: string; id: string; title: string }>;
  duplicates: Array<{ source: string; existingId: string; duplicateType: string }>;
  failed: Array<{ source: string; reason: string; error?: string }>;

  // NEW: Fulltext attach results
  fulltext: {
    summary: {
      total: number;        // Articles with fulltext
      attached: number;     // Successfully attached
      skipped: number;      // Already attached or not in ref
      failed: number;       // Attach failed
    };
    attached: Array<{
      refId: string;        // ref citation key
      files: string[];      // ["fulltext.pdf", "fulltext.md"]
    }>;
    failed: Array<{
      dirName: string;
      reason: string;
      error?: string;
    }>;
  };
}
```

### Output Example

```
Registering 45 references to reference-manager...

Registration complete:
  ✓ 43 added
  ⚠ 2 duplicates (already in library)

Attaching fulltexts...
  ✓ 30 articles attached (45 files)
     - 25 PDFs
     - 20 Markdowns
  ⚠ 5 skipped (not in ref library)

Results saved to: sessions/<id>/registration.json
```

## PMC XML to Markdown Conversion

### JATS XML Structure

PMC uses JATS (Journal Article Tag Suite) XML:

```xml
<article>
  <front>
    <article-meta>
      <title-group><article-title>...</article-title></title-group>
      <abstract>...</abstract>
    </article-meta>
  </front>
  <body>
    <sec><title>Introduction</title><p>...</p></sec>
    <sec><title>Methods</title><p>...</p></sec>
    ...
  </body>
  <back>
    <ref-list>...</ref-list>
  </back>
</article>
```

### Markdown Output Format

```markdown
# Article Title

**Authors**: Smith J, Jones A, et al.
**DOI**: 10.1234/example
**PMC**: PMC1234567

## Abstract

Abstract text...

## Introduction

Introduction text...

## Methods

Methods text...

## Results

Results text...

## Discussion

Discussion text...

## References

1. Reference 1
2. Reference 2
```

### Conversion Features

- Preserve section hierarchy (h2, h3, h4)
- Convert tables to Markdown tables
- Convert figures to `![Figure N](caption)`
- Convert inline citations to `[N]` format
- Handle special characters and basic math
- Strip non-essential markup (styling)

## Configuration

```toml
[fulltext]
enabled = true
auto_convert_markdown = true    # Auto-convert PMC XML to Markdown
auto_attach_on_register = true  # Auto-attach fulltext on register

[fulltext.sources]
unpaywall_email = "user@example.com"   # Required for Unpaywall
core_api_key = ""                       # Optional, for CORE API
prefer_sources = ["pmc", "arxiv", "unpaywall", "core"]

[fulltext.download]
concurrent_downloads = 3
retry_attempts = 3

[fulltext.naming]
transliterate_authors = true    # Convert non-ASCII to ASCII
```

## Rate Limiting

| Source | Rate Limit | Implementation |
|--------|------------|----------------|
| Unpaywall | 100k/day | Token bucket |
| PMC | 3 req/sec (with key) | Leaky bucket |
| arXiv | 1 req/3sec | Fixed delay |
| CORE | 10 req/sec | Token bucket |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| 403 Forbidden | Skip, mark as closed |
| 429 Rate Limited | Backoff and retry |
| 404 Not Found | Skip, mark as unavailable |
| Network Error | Retry 3x, then skip |
| PDF Corrupt | Log warning, keep for inspection |
| XML Parse Error | Log error, skip conversion |

## Workflow Examples

### Workflow A: Automated OA Retrieval

```bash
# 1. Search and screen articles
search-hub search query.yaml
search-hub review init --session <id>
# ... review articles ...

# 2. Check and fetch OA fulltexts
search-hub fulltext check <id>
search-hub fulltext fetch <id> --convert-markdown

# 3. Register to ref (auto-attaches fulltexts)
search-hub register <id>
```

### Workflow B: Manual Download

```bash
# 1. After screening, create directories for manual download
search-hub fulltext init <id>

# 2. User manually downloads PDFs into each directory
#    fulltext/smith2024-a1b2c3d4/fulltext.pdf
#    fulltext/jones2023-e5f6g7h8/fulltext.pdf

# 3. Sync to register the files
search-hub fulltext sync <id>

# 4. Register to ref
search-hub register <id>
```

### Workflow C: Mixed (OA + Manual)

```bash
# 1. Fetch available OA articles
search-hub fulltext fetch <id> --convert-markdown

# 2. Create directories for remaining articles
search-hub fulltext init <id>

# 3. Check what still needs manual download
search-hub fulltext pending <id>

# 4. User manually downloads remaining PDFs

# 5. Sync and register
search-hub fulltext sync <id>
search-hub register <id>
```

## Future Considerations

### Institutional Access

Future version may support:
- Proxy configuration
- EZproxy integration

### Text Extraction

Integration with:
- `pdftotext` for searchable PDFs
- OCR tools for scanned documents

### AI-Assisted Analysis

- Summarization of fulltext
- Key findings extraction
- Method comparison across papers
