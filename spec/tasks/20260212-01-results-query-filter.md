# Task: Results Query Filter (`-q` / `--query`)

## Purpose

Add a unified query expression to the `results` command that replaces the fragmented `--filter-year`, `--filter-title`, `--filter-abstract`, and `--db` flags with a single `-q` / `--query` option. This enables quick, expressive filtering of session results during query refinement — the primary use case is verifying that a search query captures expected articles and identifying noise.

The `-q` flag is self-documenting in `--help` output (unlike a positional argument), making it discoverable for both human users and AI agents.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - `results` and `export` command definitions
- [spec/models/common-types.md](../models/common-types.md) - Article type definition

## Related Source Files

- `src/cli/commands/results.ts` - results command implementation
- `src/cli/commands/export.ts` - `ExportFilter` and `filterArticles()` (to be replaced)
- `src/cli/commands/session-utils.ts` - article loading
- `src/cli/index.ts` - CLI command registration

## Design

### Query Syntax

```
query       = term ( SP term )*          # multiple terms joined by AND (across fields) / OR (same field)
term        = field_term | text_term
field_term  = field_name ":" value
text_term   = quoted_phrase | word        # searches title + abstract (OR)

field_name  = "title" | "abstract" | "author" | "journal"
            | "year" | "doi" | "pmid" | "arxiv" | "scopus" | "eric"
            | "source"                    # provider name (pubmed, eric, etc.)

value       = quoted_phrase | range | word
range       = NUMBER "-" NUMBER           # year:2020-2024
quoted_phrase = '"' ... '"'               # title:"deep learning"
```

### Matching Rules

| Field | Matching | Example |
|---|---|---|
| (free text) | title OR abstract substring | `"diabetes"` |
| `title:` | title substring | `title:learning` |
| `abstract:` | abstract substring | `abstract:randomized` |
| `author:` | author family/given substring | `author:tanaka` |
| `journal:` | journal name substring | `journal:lancet` |
| `year:` | exact or range | `year:2023`, `year:2020-2024` |
| `doi:`, `pmid:`, etc. | case-insensitive exact match | `doi:10.1234/xxx` |
| `source:` | provider name exact match | `source:pubmed` |

- Different fields: AND logic
- Same field repeated: OR logic (`title:diabetes title:obesity` → title contains diabetes OR obesity)
- All string matching is case-insensitive

### CLI Interface

```bash
search-hub results SESSION -q "author:smith year:2023"
search-hub results SESSION --query "title:diabetes author:tanaka year:2020-2024"
search-hub results SESSION -q "doi:10.1001/jama.2023.12345"
search-hub results SESSION -q "diabetes"                    # free text
```

### Backward Compatibility

The old `--filter-year`, `--filter-title`, `--filter-abstract`, `--db` flags remain functional but are deprecated. If both `-q` and legacy flags are used, emit an error.

The `export` command also gains the `-q` flag (same engine). Legacy flags are deprecated there too.

## Implementation Steps

### Step 1: Query tokenizer

- [ ] Write test: `src/cli/commands/query-filter.test.ts`
  - Tokenizes `"diabetes"` → `[{type: 'text', value: 'diabetes'}]`
  - Tokenizes `"author:smith year:2023"` → `[{type: 'field', field: 'author', value: 'smith'}, {type: 'field', field: 'year', value: '2023'}]`
  - Tokenizes `title:"deep learning"` → `[{type: 'field', field: 'title', value: 'deep learning'}]`
  - Tokenizes `year:2020-2024` → `[{type: 'field', field: 'year', value: '2020-2024'}]`
  - Handles edge cases: empty string, only whitespace, unclosed quotes
- [ ] Create stub: `src/cli/commands/query-filter.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `tokenizeQuery()` function
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: all tokenizer tests pass

### Step 2: Query matcher

- [ ] Write test: `src/cli/commands/query-filter.test.ts` (add matcher tests)
  - Free text matches title or abstract
  - `title:` matches only title
  - `abstract:` matches only abstract
  - `author:` matches author family or given name
  - `journal:` matches journal name
  - `year:` single year exact match
  - `year:` range match (2020-2024)
  - `doi:` exact match (case-insensitive)
  - `pmid:` exact match
  - `source:` exact match against provider name
  - AND logic between different fields
  - OR logic for repeated same field
  - Case-insensitive matching
  - Missing fields (no abstract, no journal) don't crash
- [ ] Implement `matchArticle(article, tokens)` and `filterByQuery(articles, query)` functions
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: all matcher tests pass

### Step 3: Wire `-q` to `results` command

- [ ] Write test: update `src/cli/commands/results.test.ts`
  - `-q "diabetes"` filters results by title/abstract
  - `-q "author:smith year:2023"` applies combined filter
  - `-q` and `--filter-title` used together → error
  - Empty `-q ""` → no filtering (show all)
- [ ] Add `-q, --query <expr>` option to `results` command in `src/cli/index.ts`
- [ ] Integrate `filterByQuery()` into results pipeline
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `results -q` works end-to-end

### Step 4: Wire `-q` to `export` command

- [ ] Write test: update `src/cli/commands/export.test.ts`
  - `-q "year:2023"` filters exported articles
  - `-q` and `--filter-year` used together → error
- [ ] Add `-q, --query <expr>` option to `export` command in `src/cli/index.ts`
- [ ] Integrate `filterByQuery()` into export pipeline
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `export -q` works end-to-end

### Step 5: Help text with query syntax documentation

- [ ] Add query syntax examples to `results --help` afterText
- [ ] Add query syntax examples to `export --help` afterText
- [ ] Add deprecation note to `--filter-*` flag descriptions
- [ ] Add hint to `results` output footer: `Tip: Use -q to filter: results SESSION -q "author:smith year:2023"`
- [ ] Acceptance: `results --help` clearly shows query syntax and examples

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] Write E2E test: `src/cli/commands/query-filter.e2e.test.ts`
  - Create a session with known articles
  - Run `results -q "known-title"` → finds the article
  - Run `results -q "doi:10.xxxx"` → finds exact match
  - Run `results -q "nonexistent"` → returns 0 results
  - Run `results -q "author:smith year:2023"` → combined filter
  - Run `export -q "year:2023" --format ids` → filtered export
  - Run `results -q "x" --filter-title "y"` → error
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test the feature manually
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- The query filter module (`query-filter.ts`) should be a standalone module usable by both `results` and `export`
- The `--count` option on `results` (show match count only) is deferred to a separate task if needed
- Test files are co-located with source files (`*.test.ts`)
