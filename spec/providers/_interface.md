# Provider Interface

Common contract that all database providers must implement.

## Required Capabilities

### 1. Query Translation
Convert QueryAST to database-native syntax.

### 2. Search Execution
Execute search and return results as async iterable (streaming).

### 3. Connection Test
Verify API access and credentials.

### 4. Rate Limiting
Respect per-provider rate limits.

### 5. Sort Support

The `SearchOptions` interface includes an optional `sort` field:

```typescript
type SortField = 'relevance' | 'date';

interface SearchOptions {
  sort?: SortField;  // default: undefined (provider default)
}
```

Each provider maps `SortField` to its native sort parameter:

| SortField   | PubMed           | Scopus            | arXiv                  | ERIC        |
|-------------|------------------|-------------------|------------------------|-------------|
| `relevance` | `sort=relevance` | `sort=-relevancy` | `sortBy=relevance`     | unsupported |
| `date`      | `sort=pub_date`  | (default)         | `sortBy=submittedDate` | unsupported |

Providers that do not support sorting emit a warning and use their default order.

## Provider Contract

Each provider must:

1. **Implement core interface** (search, translateQuery, testConnection)
2. **Handle pagination** internally, yielding articles as stream
3. **Respect rate limits** using shared rate limiter utility
4. **Map responses** to common Article type
5. **Report errors** with appropriate error codes

## Method Responsibilities

### `translateQuery(ast: QueryAST): TranslatedQuery`

- Convert common DSL to DB-native syntax
- Apply controlled vocabulary mappings (MeSH for PubMed, etc.)
- Apply DB-specific overrides from AST
- Return both native string and reference to original AST

### `search(query, options): AsyncIterable<Article>`

- Execute paginated search
- Yield articles one at a time (memory efficient)
- Handle retries internally
- Update pagination state for resume support
- Throw on unrecoverable errors

### `testConnection(): Promise<boolean>`

- Verify API endpoint reachable
- Validate API key if required
- Return false on failure (don't throw)

## Rate Limiting Strategy

- Use token bucket algorithm
- Configurable per provider
- Shared rate limiter instance per provider type
- Automatic backoff on 429 responses

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Network timeout | Retry up to N times with exponential backoff |
| 429 Rate Limited | Wait specified time, retry |
| 401/403 Auth error | Throw immediately (not retryable) |
| 5xx Server error | Retry up to N times |
| Parse error | Log warning, skip record, continue |

## Provider Registration

Providers register themselves at startup:
- Name (e.g., 'pubmed')
- Default config values
- Factory function

Search orchestrator discovers available providers from registry.
