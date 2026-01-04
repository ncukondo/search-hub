# arXiv Provider

## API Overview

**API**: arXiv API (Atom feed)
**Base URL**: `http://export.arxiv.org/api/query`
**Authentication**: None required
**Rate Limit**: 1 request per 3 seconds (strictly enforced)

## Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `/api/query` | Search and retrieve results |

## Search Flow

```
1. GET /api/query: query params → Atom XML response
2. Parse Atom → Article[]
```

## Query Translation

### Field Mappings

| DSL Field | arXiv Prefix |
|-----------|--------------|
| `title` | `ti:` |
| `abstract` | `abs:` |
| `title_abstract` | `ti:` OR `abs:` |
| `author` | `au:` |
| `all` | `all:` |

### Boolean Operators

- `AND`, `OR`, `ANDNOT` (not standard NOT)
- Grouping with parentheses
- Phrases with quotes

### Example Translation

DSL:
```yaml
query:
  - field: title_abstract
    terms:
      keywords: ["machine learning", diabetes]
    operator: OR
```

arXiv:
```
(ti:"machine learning" OR ti:diabetes OR abs:"machine learning" OR abs:diabetes)
```

### Category Filter (arXiv-specific)

```yaml
overrides:
  arxiv:
    categories:
      - cs.AI
      - cs.LG
```

Translates to: `cat:cs.AI OR cat:cs.LG`

### Date Filter

arXiv uses `submittedDate` range:
```
submittedDate:[202001010000 TO 202412312359]
```

Format: `YYYYMMDDHHmm`

## API Parameters

| Parameter | Description |
|-----------|-------------|
| `search_query` | Query string |
| `start` | Offset (0-based) |
| `max_results` | Page size (max 2000 recommended) |
| `sortBy` | `relevance`, `lastUpdatedDate`, `submittedDate` |
| `sortOrder` | `ascending`, `descending` |

## Response Parsing

Atom XML response. Key elements:

```xml
<feed>
  <opensearch:totalResults>1234</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Paper Title</title>
    <summary>Abstract text...</summary>
    <author><name>John Smith</name></author>
    <arxiv:doi>10.1234/example</arxiv:doi>
    <published>2024-01-15T00:00:00Z</published>
    <arxiv:primary_category term="cs.AI"/>
  </entry>
</feed>
```

### Field Mapping to Article

| Atom Element | Article Field |
|--------------|---------------|
| `id` | `arxivId` (extract from URL) |
| `title` | `title` |
| `summary` | `abstract` |
| `author/name` | `authors` |
| `arxiv:doi` | `doi` |
| `published` | `publicationDate` |

### arXiv ID Extraction

From `<id>http://arxiv.org/abs/2401.12345v1</id>`
Extract: `2401.12345` (without version)

## Pagination

- Use `start` parameter (0-based offset)
- `max_results` for page size
- No cursor-based pagination
- Rate limit makes large searches slow

## Rate Limiting

**Critical**: arXiv enforces 1 request per 3 seconds

- Implement minimum 3-second delay between requests
- Will block IP for violations
- Consider batch size carefully

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Parse response |
| 400 | Bad query | Throw parse error |
| 503 | Rate limited / overloaded | Wait 30s, retry |

## Configuration

```toml
[providers.arxiv]
enabled = true
rate_limit = 0.33     # 1 request per 3 seconds
timeout = 60000       # arXiv can be slow
retries = 3
max_results = 10000
```

## Notes

- arXiv is preprint server (not peer-reviewed)
- Good for computer science, physics, math, quantitative biology
- No controlled vocabulary (use keywords only)
- Results may include multiple versions; track v1 by default

## References

- [arXiv API User Manual](https://info.arxiv.org/help/api/user-manual.html)
- [arXiv Category Taxonomy](https://arxiv.org/category_taxonomy)
