# Task: `related` Command

## Purpose

Add a `related` CLI command that finds related articles from seed PMIDs using PubMed ELink, saves results as a standard session, and integrates with the existing review workflow. This enables citation-chasing for narrative/quick literature reviews.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - CLI commands (add `related`)
- [spec/models/session.md](../models/session.md) - Session schema (add `type: related`)
- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed ELink

## Related Source Files

- `src/cli/commands/related.ts` - New command (to create)
- `src/session/types.ts` - `SessionFile` type extension
- `src/session/manager.ts` - Session creation for related type
- `src/providers/pubmed/client.ts` - `findRelated()` (from task #123)
- `src/providers/pubmed/provider.ts` - `PubMedProvider`
- `src/cli/commands/register.ts` - Register command (verify compatibility)

## Design

### CLI Interface

```
search-hub related <pmids...> [options]
search-hub related --from-session <session-id> --pmid <pmid>... [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `pmids...` | One or more seed PMIDs |

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--name` | `-n` | Session name | `related-{date}` |
| `--max-results` | `-m` | Max related articles to retrieve | 20 |
| `--db` | | Database to use | `pubmed` |
| `--from-session` | `-s` | Load seed PMIDs from existing session | - |
| `--pmid` | | Seed PMIDs (alternative to positional args, required with --from-session) | - |
| `--term` | `-t` | Additional PubMed filter (e.g., `"review[filter]"`) | - |

### Session Schema Extension

```typescript
interface SessionFile {
  // ... existing fields ...
  type?: 'search' | 'merge' | 'related';
  seeds?: {
    ids: string[];           // seed PMIDs
    sourceSession?: string;  // source session ID (when --from-session used)
  };
}
```

### Session Directory Structure

```
<data-dir>/sessions/
└── {session-id}/
    ├── session.yaml              # type: related, seeds
    ├── results_pubmed.jsonl      # Related articles (standard Article format)
    ├── results_pubmed.yaml
    └── log.jsonl
```

### Workflow

1. Resolve seed PMIDs (from args or from-session)
2. Call `PubMedClient.findRelated()` to get related PMIDs with scores
3. Call `PubMedClient.fetch()` to get full article records for top results
4. Create session with `type: related` and `seeds` metadata
5. Save results in standard JSONL format
6. Display summary (seed count, related found, top matches)

### Compatibility

- `export`, `register`, `summary`, `results` commands work unchanged (standard session format)
- `review init` works unchanged (can screen related articles)
- `resume` is not applicable (emit error if attempted)
- `merge` can merge related sessions with search sessions

## Implementation Steps

### Step 1: Extend `SessionFile` type

- [ ] Write test: `src/session/types.test.ts` — validate `type: 'related'` and `seeds` field
- [ ] Add `'related'` to session type union
- [ ] Add `seeds` field to `SessionFile`
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `SessionFile` accepts `type: 'related'` with `seeds`

### Step 2: Related command — argument parsing

- [ ] Write test: `src/cli/commands/related.test.ts` — parse options
- [ ] Create `src/cli/commands/related.ts` with Commander.js command
- [ ] Parse positional PMIDs and all options
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Command parses `related 12345678 23456789 --name my-related -m 50`

### Step 3: Seed resolution from session

- [ ] Write test: `src/cli/commands/related.test.ts` — load PMIDs from session
- [ ] Implement `--from-session` logic: load session, extract PMIDs from results
- [ ] Validate that specified `--pmid` values exist in the session
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: PMIDs correctly resolved from existing session

### Step 4: Related search execution

- [ ] Write test: `src/cli/commands/related.test.ts` — mock findRelated + fetch flow
- [ ] Implement: call `findRelated()` → get related PMIDs → `fetch()` full records
- [ ] Create session directory with `type: related` and `seeds` metadata
- [ ] Save results in JSONL format
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Related articles fetched and saved as standard session

### Step 5: Output and summary

- [ ] Write test: `src/cli/commands/related.test.ts` — summary output
- [ ] Display: seed count, total related found, articles retrieved
- [ ] Show top results with titles
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: User sees clear summary after command completes

### Step 6: Register command in CLI

- [ ] Add `related` command to CLI registration (`src/cli/commands/register.ts`)
- [ ] Verify `search-hub related --help` works
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Command appears in help and is executable

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/related.e2e.test.ts`
  - Test with mock/fixture data: PMIDs → related session created
  - Test `--from-session` flow
  - Test compatibility with `export`, `summary`, `results` commands
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test with real PMIDs against PubMed
- [ ] Acceptance: All tests pass, full workflow works

## Notes

- Initially PubMed-only (`--db pubmed` is default and only supported value)
- Future: Scopus citation tracking can be added as another `--db` option
- The `seeds` field in session.yaml provides full traceability
- Related sessions are fully compatible with the review workflow for screening
