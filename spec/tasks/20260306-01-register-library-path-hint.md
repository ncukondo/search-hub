# Task: Register command - library path display & default library import hint

## Purpose

The `register` command saves articles to a session-specific library (`<sessionDir>/references.json`) but doesn't tell the user where the library is stored or how to import it into their default `ref` library. Adding this information improves discoverability and workflow.

## Related Specs

- [spec/integration/reference-manager.md](../integration/reference-manager.md) - CLI Output section

## Related Source Files

- `src/cli/commands/register.ts`
- `src/cli/commands/register.test.ts`
- `src/cli/index.ts`

## Implementation Steps

### Step 1: Add formatLibraryPath and formatDefaultLibraryHint functions

- [x] Write test: `src/cli/commands/register.test.ts`
  - Test `formatLibraryPath(sessionDir)` returns `Library: <sessionDir>/references.json`
  - Test `formatDefaultLibraryHint(sessionDir)` returns import hint with `ref add -i json` command
- [x] Create stubs in `src/cli/commands/register.ts`
- [x] Verify tests fail (Red)
- [x] Implement functions
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed

### Step 2: Integrate into register action handler

- [x] Update `src/cli/index.ts` to import and call the new functions
- [x] Output library path and hint after registration summary
- [x] Run `npm run lint && npm run typecheck`
- [x] Run full test suite: `npm test`

## Expected Output

```
Registration complete:
  ✓ 42 added
  ⚠ 5 duplicates (already in library)

Library: <sessionDir>/references.json
Results saved to: <sessionDir>/registration.json

To also add to your default ref library:
  ref add -i json "<sessionDir>/references.json"
```

## Notes

- `references.json` is CSL-JSON format (already specified in the spec)
- `ref add -i json` can directly import CSL-JSON files
- No changes needed to `src/integration/register.ts` or `RegistrationRecord` schema
