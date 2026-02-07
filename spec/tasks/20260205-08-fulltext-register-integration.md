# Task: Fulltext Register Integration

## Purpose

Extend the `register` command to automatically attach fulltexts to reference-manager entries:
- After bulk import, attach PDF and Markdown files via `ref fulltext attach`
- Record attach results in registration.json
- Provide `--no-attach-fulltext` option to disable

Also implement standalone `fulltext attach` command for manual use.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - Register Command Integration section
- [spec/integration/reference-manager.md](../integration/reference-manager.md)

## Related Source Files

- `src/integration/register.ts` - Existing register implementation
- `src/integration/register.test.ts`
- `src/integration/ref-cli.ts` - ref CLI wrapper
- `src/cli/commands/fulltext/attach.ts` (new)

## Dependencies

- Task 59 (Fulltext Foundation)

## Implementation Steps

### Step 1: ref fulltext attach Wrapper

- [x] Write test: `src/integration/ref-cli.test.ts` (extend)
  - Test: `refFulltextAttach(refId, filePath)` calls correct command
  - Test: Handles success response
  - Test: Handles "file already attached" (idempotent)
  - Test: Handles "ref not found" error
  - Test: Handles file not found error
- [x] Implement `refFulltextAttach()` in `src/integration/ref-cli.ts`
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: ref fulltext attach wrapper works

### Step 2: Fulltext Attach Logic

- [x] Write test: `src/integration/fulltext-attach.test.ts`
  - Test: Attaches PDF when available
  - Test: Attaches Markdown when available
  - Test: Attaches both when both available
  - Test: Matches fulltext directory to ref entry by DOI/PMID
  - Test: Skips articles not in ref library
  - Test: Records results (attached, skipped, failed)
- [x] Create `src/integration/fulltext-attach.ts`
- [x] Verify test fails (Red)
- [x] Implement `attachFulltexts(sessionDir, registrationRecord, options)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Fulltext attach logic works

### Step 3: Extend RegistrationRecord

- [x] Update `src/integration/types.ts`
  - Add `fulltext` field to `RegistrationRecord`
  - Define `FulltextAttachResult` type
- [x] Update `saveRegistrationRecord()` to include fulltext results
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Extended record type compiles

### Step 4: Integrate into Register Command

- [x] Write test: `src/integration/register.test.ts` (extend)
  - Test: After bulk import, fulltexts are attached
  - Test: --no-attach-fulltext skips attach step
  - Test: Registration record includes fulltext results
  - Test: Progress shows attach step
- [x] Modify `registerArticles()` to call `attachFulltexts()`
- [x] Add `--no-attach-fulltext` option to CLI
- [x] Verify test passes
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Register command attaches fulltexts

### Step 5: Standalone Fulltext Attach Command

- [x] Write test: `src/cli/commands/fulltext/attach.test.ts`
  - Test: Attaches fulltexts to existing ref entries
  - Test: --dry-run shows what would be attached
  - Test: Shows summary (attached, skipped, failed)
  - Test: Works without running register first
- [x] Create `src/cli/commands/fulltext/attach.ts`
- [x] Verify test fails (Red)
- [x] Implement `executeFulltextAttach()`
- [x] Verify test passes (Green)
- [x] Register command in CLI
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Standalone attach command works

### Step 6: Output Formatting

- [x] Write test for output formatting
  - Test: Register shows attach progress and summary
  - Test: Attach command shows detailed results
- [x] Implement output formatting
- [x] Verify test passes
- [x] Acceptance: User-friendly output

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/integration/register-fulltext.e2e.test.ts`
  - Test: Full flow: fetch → register (with attach)
  - Test: Verify files attached in ref library
  - Test: --no-attach-fulltext skips correctly
- [x] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - Fetch fulltexts for test session
  - Run `register`
  - Verify files attached via `ref export <id>`
- [ ] Acceptance: All tests pass, feature works in real usage

## CLI Interface

```bash
# Register with fulltext attach (default)
search-hub register <session-id>

# Register without fulltext attach
search-hub register <session-id> --no-attach-fulltext

# Standalone attach (after register)
search-hub fulltext attach <session-id>
search-hub fulltext attach <session-id> --dry-run
```

## Extended RegistrationRecord

```typescript
interface RegistrationRecord {
  // ... existing fields ...

  fulltext: {
    summary: {
      total: number;      // Articles with fulltext
      attached: number;   // Successfully attached
      skipped: number;    // Not in ref / already attached
      failed: number;     // Attach failed
    };
    attached: Array<{
      refId: string;
      files: string[];    // ["fulltext.pdf", "fulltext.md"]
    }>;
    skipped: Array<{
      dirName: string;
      reason: 'not_in_ref' | 'already_attached' | 'no_files';
    }>;
    failed: Array<{
      dirName: string;
      reason: string;
      error?: string;
    }>;
  };
}
```

## Notes

- Match fulltext to ref entry by DOI (preferred) or PMID
- Both PDF and Markdown attached if available
- Idempotent: re-running is safe (skips already attached)
- Standalone `fulltext attach` useful after manual PDF import
