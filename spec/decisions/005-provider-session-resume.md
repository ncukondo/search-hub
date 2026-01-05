# ADR-005: Provider Session Resume Architecture

## Status

Accepted

## Context

When searching large result sets, users may need to:
- Interrupt a search and resume later
- Handle network failures gracefully
- Continue from where they left off after application restart

Each provider API has different pagination mechanisms:
- PubMed: `usehistory` with `webenv`/`querykey` for server-side caching
- ERIC: Simple offset-based (`start` parameter)
- arXiv: Offset-based (`start` parameter), strict rate limiting
- Scopus: Offset-based (`start` parameter)

We need to decide how to implement session resume functionality across all providers.

## Decision

Use a **hybrid approach** with:

1. **Common interface in BaseProvider**: Define abstract methods and shared `SearchState` type
2. **Provider-specific state**: Each provider extends the base state with API-specific data

### Interface Design

```typescript
// Common state structure
interface SearchState {
  provider: ProviderName;
  query: TranslatedQuery;
  totalResults: number;
  retrievedCount: number;
  lastUpdated: Date;
  // Provider-specific state stored here
  providerState?: unknown;
}

// Validation result with optional reason
interface SearchResumeResult {
  valid: boolean;
  reason?: string;  // Explains why state is invalid (e.g., "Server-side history expired")
}

// BaseProvider abstract methods
abstract class BaseProvider {
  // Get current pagination state for session persistence
  abstract getSearchState(): SearchState | null;

  // Resume search from saved state
  abstract resumeSearch(state: SearchState): AsyncIterable<Article>;

  // Validate if state is still valid (e.g., PubMed webenv expires)
  abstract validateState(state: SearchState): Promise<SearchResumeResult>;
}
```

### Provider-specific State Examples

```typescript
// PubMed: Server-side history
interface PubMedProviderState {
  webenv: string;
  querykey: string;
  retstart: number;
}

// ERIC/arXiv/Scopus: Simple offset
interface OffsetProviderState {
  offset: number;
}
```

## Consequences

### Positive

- Unified interface for Session Manager integration
- Each provider can leverage API-specific features (e.g., PubMed's usehistory)
- Session Manager doesn't need provider-specific knowledge
- New providers follow established pattern
- Graceful degradation: if provider state is invalid, can restart search
- `SearchResumeResult` provides reason for invalid state, enabling better error messages

### Negative

- Slightly more complex than simple offset tracking
- PubMed server-side history has expiration (must handle)
- Need to serialize/deserialize provider-specific state

### Neutral

- Provider implementations must implement three abstract methods
- Session Manager stores opaque `providerState` blob
- State validation adds one extra API call on resume (acceptable tradeoff)