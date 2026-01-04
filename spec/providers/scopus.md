# Scopus Provider

## API Overview

**API**: Elsevier Scopus Search API
**Base URL**: `https://api.elsevier.com/content/search/scopus`
**Authentication**: API key required (institutional subscription)
**Rate Limit**: Varies by subscription, typically 2-9 req/s

## Prerequisites

1. Institutional Scopus subscription
2. Elsevier Developer Portal account
3. API key from developer portal
4. Optional: Institutional token for higher limits

## Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `/content/search/scopus` | Search |
| `/content/abstract/scopus_id/{id}` | Full abstract (if needed) |

## Search Flow

```
1. GET /search/scopus: query → results with abstracts
```

Scopus returns abstracts in search results (unlike PubMed).

## Query Translation

### Field Mappings

| DSL Field | Scopus Syntax |
|-----------|---------------|
| `title` | `TITLE()` |
| `abstract` | `ABS()` |
| `title_abstract` | `TITLE-ABS-KEY()` |
| `author` | `AUTH()` |
| `keyword` | `KEY()` |
| `all` | `ALL()` |

### Boolean Operators

- `AND`, `OR`, `AND NOT`
- Parentheses for grouping
- Phrases with `{...}` or `"..."`

### Example Translation

DSL:
```yaml
query:
  - field: title_abstract
    terms:
      keywords: [diabetes, "machine learning"]
    operator: OR
```

Scopus:
```
TITLE-ABS-KEY(diabetes OR "machine learning")
```

### Filter Mappings

| DSL Filter | Scopus Syntax |
|------------|---------------|
| `year_from: 2020` | `PUBYEAR > 2019` |
| `year_to: 2024` | `PUBYEAR < 2025` |
| `language: [en]` | `LANGUAGE(english)` |

### Source Type Filter (Scopus-specific)

```yaml
overrides:
  scopus:
    source_types:
      - journal
      - conference
```

Translates to: `SRCTYPE(j OR p)`

## API Parameters

| Parameter | Description |
|-----------|-------------|
| `query` | Scopus query string |
| `count` | Page size (max 25 for full view) |
| `start` | Offset (0-based) |
| `view` | `STANDARD` or `COMPLETE` |
| `field` | Fields to return |

### Request Headers

| Header | Value |
|--------|-------|
| `X-ELS-APIKey` | API key |
| `X-ELS-Insttoken` | Institutional token (optional) |
| `Accept` | `application/json` |

### Requested Fields

```
dc:identifier,dc:title,dc:creator,prism:coverDate,
prism:publicationName,prism:doi,dc:description,
citedby-count,prism:volume,prism:issueIdentifier,
prism:pageRange,author
```

## Response Parsing

JSON response structure:

```json
{
  "search-results": {
    "opensearch:totalResults": "1234",
    "opensearch:startIndex": "0",
    "entry": [
      {
        "dc:identifier": "SCOPUS_ID:12345678",
        "dc:title": "...",
        "dc:creator": "Smith J.",
        "dc:description": "Abstract...",
        "prism:doi": "10.1234/example",
        "prism:coverDate": "2024-01-15",
        "prism:publicationName": "Journal Name",
        "author": [
          {"authname": "Smith, John", "authid": "123"}
        ]
      }
    ]
  }
}
```

### Field Mapping to Article

| Scopus Field | Article Field |
|--------------|---------------|
| `dc:identifier` | `scopusId` |
| `dc:title` | `title` |
| `author` | `authors` |
| `dc:description` | `abstract` |
| `prism:doi` | `doi` |
| `prism:coverDate` | `publicationDate` |
| `prism:publicationName` | `journal` |

## Pagination

- Use `start` parameter (0-based)
- `count` for page size (max 25 with COMPLETE view)
- Large result sets: consider cursor if available

## Rate Limiting

- Varies by subscription tier
- Default: 2-9 requests/second
- Check `X-RateLimit-*` headers
- 429 response includes retry-after

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Parse response |
| 400 | Bad query | Throw parse error |
| 401 | Invalid API key | Throw auth error |
| 403 | Forbidden (quota/IP) | Check subscription |
| 429 | Rate limited | Wait, retry |
| 5xx | Server error | Retry with backoff |

## Configuration

```toml
[providers.scopus]
enabled = true
api_key = "your-api-key"      # Required
inst_token = ""                # Optional, for higher limits
rate_limit = 2
timeout = 30000
retries = 3
max_results = 10000
```

## Notes

- Institutional subscription required
- API quotas vary by subscription level
- COMPLETE view gives abstracts but limits page size to 25
- Consider caching API key validation

## References

- [Scopus Search API](https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl)
- [Elsevier Developer Portal](https://dev.elsevier.com/)
