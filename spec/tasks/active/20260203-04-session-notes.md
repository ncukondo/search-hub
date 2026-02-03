# Task: Session Notes and Assessment

## Purpose

During iterative query refinement, users make qualitative judgments about search results (e.g., "MeSH terms too broad", "precision improved but lost EPA papers", "v6 is the final version"). These judgments are currently ephemeral—lost when the terminal session ends. Users need a way to record notes and assessments per session to track their search strategy decisions over time.

This is especially important for systematic reviews where the search strategy must be documented and justified.

**Pain point observed:** Across 6 query iterations, each session's quality assessment was made verbally and lost. When comparing sessions later, the rationale for each change had to be reconstructed from memory.

## Related Specs

- [spec/cli](../cli/) - CLI command structure
- [spec/models](../models/) - Session data model

## Related Source Files

- `src/cli/index.ts` - Command registration
- `src/session/types.ts` - Session type definitions
- `src/session/manager.ts` - Session CRUD operations
- `src/cli/commands/status.ts` - Session status display (show notes here)
- `src/cli/commands/notes.ts` - New file
- `src/cli/commands/notes.test.ts` - New test file

## Design

### Command Interface

```bash
# Add a note to a session
search-hub notes <session-id> add "MeSH 'Clinical Competence' too broad, removing in next iteration"

# Add a note from a file (e.g., for longer assessments)
search-hub notes <session-id> add --file assessment.md

# List all notes for a session
search-hub notes <session-id>

# Add structured assessment
search-hub notes <session-id> assess --precision "~54%" --verdict "good" --comment "Core WBA papers captured, some OSCE noise remains"

# Compare notes across sessions (useful for documenting search strategy evolution)
search-hub notes --all
```

### Storage

Notes are stored as `notes.yaml` in the session directory. YAML is chosen over JSONL for human readability and ease of manual editing — users should be able to open the file and add/edit notes directly with a text editor.

```yaml
# Notes for session: wba-genai-v6
# Add entries manually or via: search-hub notes <session-id> add "..."

- date: 2026-02-03 10:30
  text: "MeSH 'Clinical Competence' too broad, removing in next iteration"

- date: 2026-02-03 10:45
  type: assessment
  precision: "~54%"
  verdict: good
  text: "Core WBA papers captured, some OSCE noise remains"

- date: 2026-02-03 11:00
  text: "Final version - accepted as search strategy for PubMed"
```

The root structure is a bare YAML sequence (array). Each entry is a mapping with:
- `date` (required) — timestamp, auto-populated by CLI
- `text` (required) — free text content
- `type` — `assessment` for structured assessments, omitted for plain notes
- `precision`, `verdict` — optional structured fields for assessments

This format has the following properties:
- **Human-readable** — can be read without any tooling
- **Hand-editable** — add a `- date: ...` block at the end of the file
- **Comment-friendly** — YAML `#` comments for context or scratch notes
- **Structured enough** — the CLI can parse it for aggregation and display

### Display in Status

When notes exist, `search-hub status <session-id>` should show them:

```
Session: wba-genai-v6 (20260203_wba-genai-v6_674451)
Status: completed
...

Notes:
  [2026-02-03 10:30] MeSH 'Clinical Competence' too broad, removing in next iteration
  [2026-02-03 10:45] Assessment: precision ~54%, verdict: good
                     Core WBA papers captured, some OSCE noise remains
  [2026-02-03 11:00] Final version - accepted as search strategy for PubMed
```

### Assessment Structure

The `assess` subcommand provides structured fields for systematic documentation:

- `--precision` - Estimated precision (free text, e.g., "~54%", "high", "15/28")
- `--verdict` - Overall quality judgment: `good`, `refine`, `reject`
- `--comment` - Free text explanation

These structured fields enable future features like:
- Automatic comparison of precision across iterations
- Summary of search strategy evolution for methods section

## Implementation Steps

### Step 1: Notes storage and CRUD operations

- [x] Write test: `src/cli/commands/notes.test.ts`
  - Test `addNote(sessionDir, note)` appends entry to notes.yaml
  - Test `loadNotes(sessionDir)` reads and parses notes.yaml
  - Test `addAssessment(sessionDir, assessment)` appends structured assessment entry
  - Test handling of missing notes.yaml (create new file with header comment)
  - Test handling of existing notes.yaml with manual edits / comments preserved
- [x] Create stub: `src/cli/commands/notes.ts`
- [x] Verify test fails (Red)
- [x] Implement CRUD functions for notes.yaml (parse → append → write)
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Notes are correctly stored and loaded, existing comments are preserved

### Step 2: CLI command registration

- [ ] Write test: CLI option parsing for `notes add`, `notes`, `notes assess`
- [ ] Register `notes` command in `src/cli/index.ts`
- [ ] Implement `add` subcommand with `--file` option
- [ ] Implement `assess` subcommand with `--precision`, `--verdict`, `--comment`
- [ ] Implement default list view
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: All subcommands work correctly

### Step 3: Integrate notes display into status command

- [ ] Write test: status output includes notes when present
- [ ] Modify `status` command to load and display notes
- [ ] Format notes with timestamps and types
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub status <session-id>` shows notes section when notes exist

### Step 4: Cross-session notes view

- [ ] Write test: `--all` flag lists notes across all sessions
- [ ] Implement cross-session notes aggregation
- [ ] Format output grouped by session with session name and date
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub notes --all` shows notes from all sessions chronologically

### Final Step: E2E Integration Tests

- [ ] Write E2E test:
  - Create a session, add notes, verify they persist
  - Add an assessment, verify structured fields
  - Check status command displays notes
  - Test cross-session view
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test with real sessions
- [ ] Acceptance: All tests pass, feature works in real usage

## Notes

- YAML format chosen for human readability and ease of manual editing over JSONL
- CLI uses parse-modify-write (read YAML array → append entry → write back). The file is always small so performance is not a concern
- When writing back, preserve any `#` comments the user added manually. Use a YAML library that retains comments (e.g., `yaml` package with `keepSourceTokens`), or use a simple text-append strategy for the `add` subcommand
- Notes are session-local (stored in session directory) so they travel with the session
- The `--all` view could be useful for writing the "search strategy" section of a systematic review
- Future enhancement: export notes as markdown for inclusion in papers
