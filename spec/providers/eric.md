# ERIC Provider

## API Overview

**API**: ERIC REST API
**Base URL**: `https://api.ies.ed.gov/eric/`
**Authentication**: None required
**Rate Limit**: Generally permissive, recommend 5 req/s

## Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `/` | Search with query parameters |

## Search Flow

```
1. GET /: query params → JSON response with results
```

Single endpoint returns both search results and metadata.

## Query Translation

### Field Mappings

| DSL Field | ERIC Parameter |
|-----------|----------------|
| `title` | `title:` |
| `abstract` | `abstract:` |
| `title_abstract` | `title:` OR `abstract:` |
| `author` | `author:` |
| `keyword` | `descriptor:` |
| `all` | (no prefix) |

### Example Translation

DSL:
```yaml
query:
  - field: title_abstract
    terms:
      keywords: [diabetes, education]
    operator: OR
```

ERIC:
```
(title:diabetes OR title:education OR abstract:diabetes OR abstract:education)
```

### Boolean Operators

ERIC uses standard boolean: `AND`, `OR`, `NOT`

Phrases: Use quotes `"special education"`

### Filter Mappings

| DSL Filter | ERIC Parameter |
|------------|----------------|
| `year_from: 2020` | `publicationdateyear:[2020 TO *]` |
| `year_to: 2024` | `publicationdateyear:[* TO 2024]` |

## API Parameters

| Parameter | Description |
|-----------|-------------|
| `search` | Query string |
| `format` | `json` |
| `rows` | Page size (default 20, max 2000) |
| `start` | Offset for pagination |
| `fields` | Fields to return |

### Requested Fields

```
id,title,author,description,publicationdateyear,
publicationtype,source,issn,peerreviewed,
url,identifiersgov,subject
```

## Response Parsing

JSON response structure:

```json
{
  "response": {
    "numFound": 1234,
    "start": 0,
    "docs": [
      {
        "id": "EJ123456",
        "title": "...",
        "author": ["Smith, John", "Doe, Jane"],
        "description": "...",
        "publicationdateyear": 2023,
        "source": "Journal Name",
        "url": "https://..."
      }
    ]
  }
}
```

### Field Mapping to Article

| ERIC Field | Article Field |
|------------|---------------|
| `id` | `ericId` |
| `title` | `title` |
| `author` | `authors` (parse "Last, First" format) |
| `description` | `abstract` |
| `publicationdateyear` | `publicationDate` |
| `source` | `journal` |
| `url` | Use to extract DOI if present |

## Pagination

- Use `start` parameter (0-based offset)
- `rows` parameter for page size (max 2000)
- No cursor-based pagination

## Rate Limiting

- No official limit documented
- Recommend 5 requests/second to be respectful
- Implement backoff on slow responses

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Parse response |
| 400 | Bad query | Throw parse error |
| 5xx | Server error | Retry with backoff |

## Configuration

```toml
[providers.eric]
enabled = true
rate_limit = 5
timeout = 30000
retries = 3
max_results = 10000
```

## Notes

- ERIC focuses on education research
- Controlled vocabulary: ERIC Thesaurus (descriptors)
- No MeSH support (education domain, not medical)

## References

- [ERIC API Documentation](https://eric.ed.gov/?api)
