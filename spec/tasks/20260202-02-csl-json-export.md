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

- [ ] Write test: `src/cli/commands/export.test.ts`
  - Test: `formatCslJson()` produces valid CSL-JSON array
  - Test: output is pretty-printed JSON (2-space indent)
  - Test: all article fields are correctly mapped via `articlesToCslJson()`
- [ ] Verify test fails (Red)
- [ ] Add `'csl-json'` to `ExportFormat` type in `src/cli/commands/export.ts`
- [ ] Implement `formatCslJson()` using `articlesToCslJson()` from `src/integration/csl-json.ts`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `formatCslJson()` produces correct CSL-JSON output

### Step 2: Wire up CLI option

- [ ] Update format option description in `src/cli/index.ts` to include `csl-json`
- [ ] Add `csl-json` case to format switch in export command handler
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub export <session> --format csl-json` works

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/export.e2e.test.ts`
  - Test: CSL-JSON export with real session data produces valid output
  - Test: output can be parsed as JSON array of CSL-JSON items
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Export a real session as CSL-JSON and verify format
- [ ] Acceptance: All tests pass, CSL-JSON export works in real usage

## Notes

- Depends on Task A (#31) for the `articlesToCslJson()` function
- CSL-JSON spec: https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html
