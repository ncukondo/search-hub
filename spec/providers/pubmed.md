# PubMed Provider

## API Overview

**API**: NCBI E-utilities
**Base URL**: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`
**Authentication**: API key optional but recommended
**Rate Limit**: 3 req/s without key, 10 req/s with key

## Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `esearch.fcgi` | Search and get PMIDs |
| `efetch.fcgi` | Fetch full records by PMID |

## Search Flow

```
1. esearch: query → PMID list + total count
2. efetch: PMID list → full records (XML)
3. Parse XML → Article[]
```

## Query Translation

### Field Mappings

| DSL Field | PubMed Syntax |
|-----------|---------------|
| `title` | `[ti]` |
| `abstract` | `[ab]` |
| `title_abstract` | `[tiab]` |
| `author` | `[au]` |
| `keyword` / MeSH | `[mh]` |
| `all` | (no qualifier) |

### Example Translation

DSL:
```yaml
query:
  - field: title_abstract
    terms:
      keywords: [diabetes, "type 2 diabetes"]
      mesh: ["Diabetes Mellitus, Type 2"]
    operator: OR
```

PubMed:
```
(diabetes[tiab] OR "type 2 diabetes"[tiab] OR "Diabetes Mellitus, Type 2"[mh])
```

### Filter Mappings

| DSL Filter | PubMed Syntax |
|------------|---------------|
| `year_from: 2020` | `2020:3000[dp]` |
| `year_to: 2024` | `1900:2024[dp]` |
| `language: [en]` | `english[la]` |
| `exclude: [Review, Comment]` | `NOT (review[pt] OR comment[pt])` |

## API Parameters

### esearch

| Parameter | Value |
|-----------|-------|
| `db` | `pubmed` |
| `term` | Translated query |
| `retmax` | Page size (max 10000) |
| `retstart` | Offset for pagination |
| `usehistory` | `y` (for large result sets) |
| `api_key` | From config |

### efetch

| Parameter | Value |
|-----------|-------|
| `db` | `pubmed` |
| `id` | Comma-separated PMIDs |
| `rettype` | `xml` |
| `retmode` | `xml` |
| `api_key` | From config |

## Response Parsing

efetch returns PubMed XML format. Key elements:

- `//PubmedArticle/MedlineCitation/PMID` → pmid
- `//ArticleTitle` → title
- `//Abstract/AbstractText` → abstract
- `//AuthorList/Author` → authors
- `//ArticleId[@IdType="doi"]` → doi
- `//PubDate` → publicationDate

## Pagination

- Use `retstart` + `retmax` for offset pagination
- `usehistory=y` for server-side result caching (large searches)
- Max 10,000 results per search; use date slicing for more

## Rate Limiting

- Without API key: 3 requests/second
- With API key: 10 requests/second
- Include `email` parameter (NCBI requirement)

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Parse response |
| 400 | Bad query | Throw parse error |
| 429 | Rate limited | Wait, retry |
| 500+ | Server error | Retry with backoff |

## Configuration

```toml
[providers.pubmed]
enabled = true
api_key = "your-key"
email = "your@email.com"    # Required by NCBI
rate_limit = 10             # With API key
timeout = 30000
retries = 3
max_results = 10000
```

## References

- [E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25500/)
- [PubMed Search Field Tags](https://pubmed.ncbi.nlm.nih.gov/help/#search-tags)
