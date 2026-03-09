# Architecture

## Directory Structure

```
search-hub/
├── spec/                      # Specifications (this directory)
├── src/
│   ├── cli/                   # CLI entry points
│   │   ├── index.ts           # Main entry
│   │   └── commands/          # Command implementations
│   │       ├── search.ts
│   │       ├── resume.ts
│   │       ├── status.ts
│   │       ├── export.ts
│   │       ├── register.ts
│   │       ├── config.ts
│   │       ├── init.ts
│   │       └── query/
│   │           ├── validate.ts
│   │           └── translate.ts
│   │
│   ├── providers/             # Database providers
│   │   ├── base/              # Shared interfaces & utilities
│   │   │   ├── types.ts
│   │   │   ├── provider.ts    # Abstract base class
│   │   │   └── rate-limiter.ts
│   │   ├── pubmed/
│   │   │   ├── client.ts
│   │   │   ├── translator.ts  # Query DSL → PubMed syntax
│   │   │   ├── types.ts
│   │   │   └── __tests__/
│   │   ├── eric/
│   │   ├── arxiv/
│   │   └── scopus/
│   │
│   ├── query/                 # Query DSL processing
│   │   ├── parser.ts          # YAML → AST
│   │   ├── validator.ts       # Schema validation
│   │   ├── types.ts           # Query AST types
│   │   └── __tests__/
│   │
│   ├── session/               # Session management
│   │   ├── manager.ts         # Create/load/save sessions
│   │   ├── types.ts
│   │   ├── logger.ts          # Search logging
│   │   └── __tests__/
│   │
│   ├── config/                # Configuration
│   │   ├── loader.ts          # Load & merge configs
│   │   ├── schema.ts          # Zod schemas
│   │   └── __tests__/
│   │
│   ├── export/                # Output formatters
│   │   ├── ids.ts             # DOI/PMID list
│   │   ├── json.ts            # Full JSON export
│   │   └── __tests__/
│   │
│   └── utils/                 # Shared utilities
│       ├── progress.ts        # Progress bar (ora)
│       └── errors.ts          # Custom error types
│
├── tests/                     # Integration tests
│   └── e2e/
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── ...
```

## Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│                      CLI Layer                       │
│  (Commander.js commands, argument parsing, output)   │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                   Service Layer                      │
│  (Search orchestration, session management, export)  │
└───────────┬─────────────┬─────────────┬─────────────┘
            │             │             │
┌───────────▼──┐ ┌────────▼────────┐ ┌──▼───────────┐
│    Query     │ │    Session      │ │    Config    │
│   (Parser,   │ │   (Manager,     │ │   (Loader,   │
│  Translator) │ │    Logger)      │ │   Schema)    │
└───────────┬──┘ └─────────────────┘ └──────────────┘
            │
┌───────────▼─────────────────────────────────────────┐
│                  Provider Layer                      │
│  (PubMed, ERIC, arXiv, Scopus - each with client,   │
│   translator, rate limiter)                          │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Query File Resolution

Commands that accept a query file (`search`, `query validate`, `query translate`, etc.) resolve the argument as follows:

1. Exact path exists → use it
2. `<arg>.yaml` exists → use it
3. `.search-hub/queries/<arg>.yaml` exists → use it
4. Error with tried paths listed

### Project Directory Layout

```
my-research-project/
└── .search-hub/                  # Project directory (created by search-hub init)
    ├── config.toml               # Local config
    ├── queries/                  # Query files (created by query init)
    │   ├── wba-pain.yaml
    │   ├── wba-intervention.yaml
    │   ├── wba-pain.search-log.yaml  # Auto-generated iteration log
    │   └── query.schema.json    # Shared JSON Schema for editor support
    └── sessions/                 # Search results (managed by search-hub)
        ├── 20260306_wba-pain_a1b2c3/
        │   ├── session.yaml
        │   ├── query_common.yaml
        │   ├── pubmed_query.txt
        │   ├── pubmed_results.jsonl
        │   └── pubmed_results.yaml
        └── ...
```

### Search Flow

```
1. User runs: search-hub search wba-pain

2. CLI Layer
   ├── Parse arguments
   ├── Load config (merge: CLI > env > local > global)
   └── Initialize session

3. Query Processing
   ├── Parse YAML → Query AST
   ├── Validate against schema
   └── For each target DB:
       └── Translate AST → DB-native query

4. Search Execution (per DB)
   ├── Check rate limits
   ├── Execute search API
   ├── Parse response → Article[]
   ├── Log results to session
   ├── Handle pagination (with resume support)
   └── On error: log & continue others

5. Session Persistence
   ├── Save translated queries
   ├── Save results per DB
   └── Update session.yaml status

6. Output
   └── Display summary / progress
```

### Resume Flow

```
1. User runs: search-hub resume <session-id>

2. Load session from <data-dir>/sessions/<id>/

3. For each DB with status != "completed":
   ├── Load last page cursor
   ├── Continue from that point
   └── Merge new results with existing
```

## Error Handling Strategy

| Error Type | Behavior |
|------------|----------|
| Network timeout | Retry 3x with backoff, then mark DB as failed |
| Rate limit hit | Wait and retry |
| Invalid API key | Mark DB as failed, continue others |
| Parse error | Log error, skip record, continue |
| Query validation | Fail fast, show error |

Failed DBs are recorded in session.yaml and can be retried with `resume`.

## Configuration Priority

```
Highest ──► CLI arguments (--api-key)
         │  Environment variables (SEARCH_HUB_PUBMED_API_KEY)
         │  Local config (./search-hub.config.toml)
Lowest  ──► Global config (<config-dir>/config.toml)
```

See [config.md](models/config.md#platform-specific-directories) for platform-specific paths.

## Key Interfaces

See `models/common-types.md` for full type definitions.

### Provider Interface

```typescript
interface Provider {
  name: string;
  search(query: TranslatedQuery, options: SearchOptions): AsyncIterable<Article>;
  translateQuery(ast: QueryAST): TranslatedQuery;
  testConnection(): Promise<boolean>;
}
```

### Session Structure

```typescript
interface Session {
  id: string;
  name: string;
  createdAt: string;
  query: { common: string; translated: Record<string, string> };
  status: Record<string, DBStatus>;
  results: Record<string, string>; // paths to result files
}
```
