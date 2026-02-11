# Supported Databases

## Overview

| Database | API Key | Status | Notes |
|----------|---------|--------|-------|
| PubMed | Optional (recommended) | Supported | Higher rate limits with key |
| ERIC | Not required | Supported | Education research |
| arXiv | Not required | Supported | Preprints |
| Scopus | Required | Supported | Institutional access needed |
| Web of Science | - | Planned | API access pending |
| Embase | - | Planned | No API available |

## PubMed

Biomedical literature from MEDLINE and life science journals.

**Features:**
- MeSH (Medical Subject Headings) support
- Publication type filtering
- Language filtering

**API:**
- Uses NCBI E-utilities
- Rate limit: 3 req/sec (10 with API key)
- API key: Optional but recommended

**Get API Key:**
1. Create NCBI account at https://www.ncbi.nlm.nih.gov/account/
2. Go to Settings > API Key Management
3. Generate new key

## ERIC

Education Resources Information Center - education research database.

**Features:**
- Descriptor (controlled vocabulary) support
- Publication type filtering

**API:**
- Free public API
- Rate limit: 5 req/sec
- No authentication required

## arXiv

Open-access preprint repository for physics, mathematics, computer science, and more.

**Features:**
- Category filtering (cs.AI, cs.LG, etc.)
- No publication type filtering

**API:**
- OAI-PMH / Atom API
- Rate limit: 1 req/3 sec
- No authentication required

**Note:** arXiv has strict rate limits. Large searches may take longer.

## Scopus

Elsevier's abstract and citation database.

**Features:**
- Broad multidisciplinary coverage
- Emtree (controlled vocabulary) support
- Citation data
- Source type filtering

**API:**
- Requires API key (institutional access)
- Rate limit: 2 req/sec

**Get API Key:**
1. Check if your institution has Scopus API access
2. Register at https://dev.elsevier.com/
3. Create an application to get API key

## Database Comparison

| Feature | PubMed | ERIC | arXiv | Scopus |
|---------|--------|------|-------|--------|
| Biomedical | Strong | - | Some | Good |
| Education | - | Strong | - | Good |
| CS/AI | Some | - | Strong | Good |
| Controlled vocab | MeSH | Descriptors | - | Emtree |
| Full text | Via PMC | Some | Yes | - |
| Citations | - | - | - | Yes |

## Search Tips

### PubMed
- Use MeSH terms for comprehensive results
- Combine with keywords for recent articles (MeSH indexing takes time)

### ERIC
- Use ERIC descriptors for education topics
- Good for K-12 and higher education research

### arXiv
- Best for cutting-edge research
- Preprints may not be peer-reviewed
- Use category filters to narrow results

### Scopus
- Use Emtree terms for Scopus-specific controlled vocabulary
- Good for cross-disciplinary searches
- Useful for citation analysis
- Requires institutional access
