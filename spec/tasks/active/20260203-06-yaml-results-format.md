# Task: YAML Results Format

## Purpose

Search results are stored as JSONL (`pubmed_results.jsonl`), which is optimized for streaming writes but not human-readable. Users frequently need to browse results directly in an editor to inspect titles, abstracts, and metadata during query refinement.

This task converts results to YAML format after search completion, making session directories fully browsable without CLI tooling.

## Design

### Dual-format approach

JSONL and YAML serve different purposes and both are retained:

```
Search in progress:
  pubmed_results.jsonl   ← streaming appendFile writes

Search completed:
  pubmed_results.jsonl   ← raw data archive (rawResponse含む完全な記録)
  pubmed_results.yaml    ← human-readable view (rawResponse除外、整形済み)
```

JSONL is the source of truth with complete data including `rawResponse`. YAML is a derived human-readable view generated from it.

### Lifecycle

1. **During search**: articles stream into `{provider}_results.jsonl` (unchanged)
2. **On search completion**: generate YAML from JSONL (JSONL is retained as raw data archive)
3. **Normal read operations** (export, summary, results): read from YAML when available, fall back to JSONL for in-progress/legacy sessions
4. **Full-fidelity reads** (re-export with rawResponse, debugging): read from JSONL directly
5. **On resume**: read JSONL to load existing articles (authoritative source), stream new articles, regenerate YAML on completion

### YAML Format

```yaml
# Results: pubmed (28 articles)
# Query: wba-genai-v6

- title: "Leveraging Large Language Models to Evaluate the Quality of Narrative
    Feedback for Surgery Residents in Competency-Based Medical Education"
  authors:
    - family: Smith
      given: John
    - family: Doe
      given: Jane
      orcid: "0000-0001-2345-6789"
  publicationDate: "2025-03-15"
  journal: "Annals of surgery open"
  doi: "10.1097/AS9.0000000000000001"
  pmid: "12345678"
  abstract: |
    OBJECTIVE: This study aimed to investigate large language model (LLM)
    performance in evaluating narrative feedback quality in the entrustable
    professional activities (EPAs) assessment framework used in surgical
    residency programs.
  source: pubmed
  retrievedAt: "2026-02-03T10:30:00Z"

- title: "Fine-Tuning Large Language Models to Enhance Programmatic Assessment"
  ...
```

Rules:
- Omit fields with null/undefined values (no `volume: null` clutter)
- Exclude `rawResponse` field (provider-internal data, not useful for browsing)
- Use YAML `|` block scalar for multi-line abstracts
- Header comment with provider name, article count, and query name
- Blank line between articles for visual separation

### session.json update

The `files` field in `DatabaseStatus` gains a `resultsYaml` entry alongside the existing `results` (JSONL):

```json
"files": {
  "query": "pubmed_query.txt",
  "results": "pubmed_results.jsonl",
  "resultsYaml": "pubmed_results.yaml"
}
```

The presence of `resultsYaml` indicates that the human-readable view has been generated. In-progress sessions will only have `results` (JSONL).

### Backward compatibility

- **Legacy sessions** (no `resultsYaml`): read from JSONL as before
- **In-progress sessions**: JSONL only, YAML not yet generated
- **Completed sessions**: both files present; normal reads use YAML, full-fidelity reads use JSONL

## Related Source Files

- `src/cli/commands/search-executor.ts` — streaming write + post-completion conversion
- `src/cli/commands/resume-executor.ts` — resume reads existing results
- `src/cli/commands/export.ts` — reads results for export (primary read path)
- `src/cli/commands/summary.ts` — reads results for statistics
- `src/session/manager.ts` — session file templates, `DatabaseStatus.files`
- `src/session/types.ts` — type definitions

## Implementation Steps

### Step 1: JSONL → YAML conversion function

- [x] Write test: `src/session/results-io.test.ts`
  - Test `convertResultsToYaml(jsonlPath, yamlPath, metadata)` produces valid YAML
  - Test YAML output omits null fields and `rawResponse`
  - Test YAML output uses block scalar for abstracts
  - Test header comment includes provider name and count
  - Test round-trip: articles loaded from YAML match original JSONL
- [x] Create: `src/session/results-io.ts`
- [x] Verify test fails (Red)
- [x] Implement conversion function using `yaml` package
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: YAML output is human-readable and parseable

### Step 2: Unified results reader with fallback

- [x] Write test: `loadResults(sessionDir, provider)` reads YAML, falls back to JSONL
  - Test reads YAML when present
  - Test falls back to JSONL when YAML absent
  - Test returns Article[] in both cases
- [x] Implement `loadResults()` in `src/session/results-io.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: single function handles both formats transparently

### Step 3: Post-completion conversion in search executor

- [x] Write test: after search completes, both JSONL and YAML files exist
- [x] Modify `executeSearch()` to call conversion after each provider completes
- [x] Add `resultsYaml` to `DatabaseStatus.files`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: completed sessions have both JSONL (raw archive) and YAML (readable view)

### Step 4: Update all read sites to use unified reader

- [x] Write test: export, summary, and status commands work with YAML results
- [x] Replace direct JSONL reading in export.ts, summary.ts with `loadResults()`
- [x] Update resume-executor.ts to read YAML when loading existing results
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: all commands work with both YAML and legacy JSONL sessions

### Step 5: Update resume flow

- [ ] Write test: resume reads JSONL (authoritative source), appends new results, regenerates YAML
  - Test resume of completed session (JSONL still present as archive)
  - Test resume of interrupted session (JSONL only, no YAML yet)
- [ ] Implement: resume reads existing JSONL, streams new articles to JSONL, regenerates YAML on completion
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: resumed sessions have correct JSONL and regenerated YAML

### Final Step: E2E Integration Tests

- [ ] Write E2E test:
  - Run a search, verify both JSONL and YAML files are created
  - Verify YAML is valid, parseable, and excludes `rawResponse`
  - Verify JSONL is complete and includes `rawResponse`
  - Verify export/summary commands work with YAML results
  - Test with a legacy JSONL-only session (backward compatibility)
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: run real search, open YAML in editor
- [ ] Acceptance: All tests pass, YAML files are readable in editor

## Notes

- The `yaml` package (already a dependency) supports block scalars and custom formatting
- For large result sets (1000+), YAML parse/write may be slower than JSONL, but still under 1s for typical sizes
- JSONL is the raw data archive: complete Article objects including `rawResponse`
- YAML is the human-readable view: `rawResponse` excluded, null fields omitted, abstracts as block scalars
- This change pairs well with task #38 (results listing) — the `results` command reads from the same `loadResults()` function
