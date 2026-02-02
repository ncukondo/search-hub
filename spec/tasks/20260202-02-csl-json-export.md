# Task: CSL-JSON Export Format

## Purpose

Add `--format csl-json` to the `export` command, enabling export of search results as a standard CSL-JSON array. This format is widely supported by reference managers, citation tools, and academic workflows.

Reuses the `articlesToCslJson()` conversion module from Task A (#31).

## Related Specs

- [spec/cli/output-formats.md](../cli/output-formats.md) - Export format definitions
- [spec/cli/commands.md](../cli/commands.md) - CLI command options

## Related Source Files

- `src/cli/commands/export.ts` - Export formatting logic
- `src/cli/commands/export.test.ts` - Export tests
- `src/cli/index.ts` - CLI command registration
- `src/integration/csl-json.ts` - CSL-JSON conversion (from Task A)

## Implementation Steps

### Step 1: Add `csl-json` to ExportFormat type and format function

- [x] Write test: `src/cli/commands/export.test.ts`
  - Test: `formatCslJson()` produces valid CSL-JSON array
  - Test: output is pretty-printed JSON (2-space indent)
  - Test: all article fields are correctly mapped via `articlesToCslJson()`
- [x] Verify test fails (Red)
- [x] Add `'csl-json'` to `ExportFormat` type in `src/cli/commands/export.ts`
- [x] Implement `formatCslJson()` using `articlesToCslJson()` from `src/integration/csl-json.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `formatCslJson()` produces correct CSL-JSON output

### Step 2: Wire up CLI option

- [x] Update format option description in `src/cli/index.ts` to include `csl-json`
- [x] Add `csl-json` case to format switch in export command handler
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `search-hub export <session> --format csl-json` works

### Final Step: E2E Integration Tests

- [x] Write E2E test: `src/cli/commands/export.e2e.test.ts`
  - Test: CSL-JSON export with real session data produces valid output
  - Test: output can be parsed as JSON array of CSL-JSON items
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: Export a real session as CSL-JSON and verify format
- [x] Acceptance: All tests pass, CSL-JSON export works in real usage

## Notes

- Depends on Task A (#31) for the `articlesToCslJson()` function
- CSL-JSON spec: https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html
