# Task: Export to stdout by Default

## Purpose

The `export` command currently requires `-o <path>` to specify an output file. When no `-o` is given, the command should write to stdout, enabling piping and quick inspection without creating intermediate files.

**Pain point observed:** During query refinement, users frequently wanted to quickly inspect results without creating files. The export command's filter options (`--filter-year`, `--filter-title`) are useful for post-hoc analysis but require a file output step.

## Related Specs

- [spec/cli](../cli/) - CLI command structure

## Related Source Files

- `src/cli/index.ts` - Export command implementation (~line 707-898)
- `src/cli/commands/export.ts` - Export formatting functions

## Design

### Behavior Change

```bash
# Currently: requires -o
search-hub export <session-id> --format json -o results.json

# After: stdout by default
search-hub export <session-id> --format json          # → stdout
search-hub export <session-id> --format json -o out.json  # → file (unchanged)

# Enables piping
search-hub export <session-id> --format jsonl | jq '.title'
search-hub export <session-id> --format ids --id-type doi | wc -l
```

### Considerations

- When writing to stdout, suppress progress bars and informational messages (write those to stderr)
- The "Exported N articles to ..." message should go to stderr when outputting to stdout
- `--format jsonl` is the default and works well with stdout (line-oriented)
- `--format json` outputs a single JSON object (also fine for stdout)
- `--format ids` outputs one ID per line (natural for stdout)

## Implementation Steps

### Step 1: Enable stdout output when -o is omitted

- [x] Write test: export without `-o` writes to stdout
- [x] Modify export command to write to `process.stdout` when no `-o` is specified
- [x] Move informational messages to stderr
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `search-hub export <session-id>` outputs results to stdout

### Step 2: Suppress progress/info messages for stdout mode

- [x] Write test: no informational messages mixed into stdout output
- [x] Ensure "Exported N articles" message goes to stderr
- [x] Ensure any progress indicators are suppressed or redirected
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: stdout output is clean and pipeable

### Final Step: E2E Integration Tests

- [x] Write E2E test: capture stdout output and verify it's valid JSON/JSONL/IDs
- [x] Test piping: `search-hub export <session-id> --format jsonl | head -5`
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [ ] **Manual verification**: Test piping with jq, wc, grep
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- This is a small but high-impact quality-of-life improvement
- Follows Unix convention: data to stdout, messages to stderr
- Should be backward compatible: `-o` flag behavior is unchanged
