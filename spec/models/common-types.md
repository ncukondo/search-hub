# Common Types

Core data models shared across the application. Full TypeScript definitions are in `src/` - this documents design intent only.

## Article

Represents a single search result from any database.

**Required fields:**
- At least one identifier (doi, pmid, arxivId, scopusId, ericId)
- `title`
- `authors` (array)
- `source` (which DB it came from)
- `retrievedAt` (timestamp)

**Optional fields:**
- `abstract`
- `publicationDate`
- `journal`, `volume`, `issue`, `pages`
- `rawResponse` (for debugging)

## Author

- `family` (last name) - required
- `given` (first name) - optional
- `affiliation`, `orcid` - optional

## Provider Types

**ProviderName**: `'pubmed' | 'eric' | 'arxiv' | 'scopus' | 'wos' | 'embase'`

**ProviderConfig**: Per-provider settings (enabled, apiKey, rateLimit, timeout, retries)

## Search Types

**SearchOptions**: Query parameters (maxResults, pageSize, dateRange, AbortSignal)

**SearchResult**: Result container with articles, totalHits, status, cursor for pagination

**TranslatedQuery**: DB-native query string with reference to original AST

## Error Codes

| Code | Description |
|------|-------------|
| `CONFIG_NOT_FOUND` | Config file missing |
| `CONFIG_INVALID` | Config validation failed |
| `QUERY_PARSE_ERROR` | YAML parse failed |
| `QUERY_VALIDATION_ERROR` | Query schema invalid |
| `PROVIDER_NOT_AVAILABLE` | Provider disabled or not implemented |
| `API_KEY_MISSING` | Required API key not configured |
| `API_KEY_INVALID` | API key rejected |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `NETWORK_ERROR` | Connection failed |
| `SESSION_NOT_FOUND` | Session ID doesn't exist |
| `SESSION_CORRUPTED` | Session data unreadable |

## Pagination

Each provider tracks:
- `totalHits` - matches found
- `retrievedCount` - records fetched
- `cursor` - DB-specific position marker
- `isComplete` - whether all results retrieved

## Design Notes

- Use `Result<T, E>` pattern for fallible operations
- Use `AsyncIterable<Article>` for streaming large result sets
- All timestamps are ISO 8601 format
