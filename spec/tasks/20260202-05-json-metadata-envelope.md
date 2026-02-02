# Task: JSON Export Metadata Envelope

## Purpose

The `--format json` export currently outputs a bare JSON array of articles, missing the metadata envelope defined in `spec/cli/output-formats.md`. The spec defines a structure with `session`, `summary`, and `results` fields, but only `results` is currently output.

This task adds the full metadata envelope including session information and database breakdown.

## Related Specs

- [spec/cli/output-formats.md](../cli/output-formats.md) - JSON format definition (lines 42-78)
- [spec/cli/commands.md](../cli/commands.md) - Export command

## Related Source Files

- `src/cli/commands/export.ts` - `formatJson()` function
- `src/cli/commands/export.test.ts` - Export tests
- `src/cli/index.ts` - Export command handler (session data already loaded)

## Design Details

### Metadata Interface

```typescript
interface JsonExportMetadata {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  databases: Record<string, number>;
}
```

### Output Structure

```json
{
  "session": {
    "id": "20240115_diabetes-ai_a3f2c1",
    "name": "diabetes_ai_scoping",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "summary": {
    "totalResults": 1500,
    "databases": {
      "pubmed": 800,
      "eric": 200
    }
  },
  "results": [...]
}
```

### Backward Compatibility

When `metadata` is not provided to `formatJson()`, the function produces the bare array (backward compatible). This allows internal/programmatic usage to continue working without changes.

## Implementation Steps

### Step 1: Extend `formatJson()` with metadata parameter

- [x] Write test: `src/cli/commands/export.test.ts`
  - Test: `formatJson(articles)` without metadata produces bare array (backward compatible)
  - Test: `formatJson(articles, metadata)` produces envelope with `session`, `summary`, `results`
  - Test: `summary.totalResults` matches article count
  - Test: `summary.databases` matches per-database counts
- [x] Verify test fails (Red)
- [x] Modify `formatJson()` signature in `src/cli/commands/export.ts`
- [x] Implement metadata envelope generation
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: JSON export produces correct metadata envelope

### Step 2: Pass session metadata from CLI handler

- [ ] Modify export command handler in `src/cli/index.ts` to pass session metadata to `formatJson()`
  - Session data is already loaded at lines 726-737
  - Extract `sessionId`, `sessionName`, `createdAt`, and database counts
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: CLI export produces envelope by default

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/export.e2e.test.ts`
  - Test: JSON export with real session data includes metadata envelope
  - Test: `session.id` matches the session directory name
  - Test: `summary.databases` counts match actual results
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Export a real session as JSON and verify envelope
- [ ] Acceptance: All tests pass, JSON export conforms to spec

## Notes

- The session data needed for the envelope is already loaded in the export command handler
- The `year` field added by Task #30 should still appear in `results[]` items
