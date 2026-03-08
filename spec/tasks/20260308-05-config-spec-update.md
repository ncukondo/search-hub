# Task: Update Specs, ADR, and Documentation for Two-Tier Config

## Purpose

Update all specification files, ADR, and documentation to reflect the new two-tier config design. Close issue #138 after all previous tasks are merged.

## Related Specs

- [spec/models/config.md](../models/config.md) - Configuration specification
- [spec/decisions/003-config-priority.md](../decisions/003-config-priority.md) - Config priority ADR
- [spec/overview.md](../overview.md) - Project overview

## Related Source Files

- `README.md` - Project README (if config setup instructions exist)

## Implementation Steps

### Step 1: Update `spec/models/config.md`

- [x] Update "Config File Locations" table:
  - Global: `<config-dir>/config.toml` → API keys, credentials, user preferences
  - Local: `.search-hub/config.toml` → project-specific provider settings
- [x] Update "Init Command" section:
  - `search-hub init` creates `.search-hub/` in pwd
  - `search-hub init --global` creates global config
- [x] Update config merge order diagram
- [x] Update TOML schema to show which fields belong in global vs local
- [x] Add `search-hub config` subcommand documentation (flags, examples)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Spec accurately reflects the new two-tier config behavior

### Step 2: Update `spec/decisions/003-config-priority.md`

- [x] Update local config path: `./search-hub.config.toml` → `.search-hub/config.toml`
- [x] Add note about `--show-origin` for debugging config sources (addresses "Negative" consequence)
- [x] Acceptance: ADR reflects current design decisions

### Step 3: Update `spec/overview.md` (if applicable)

- [x] Review and update any config-related sections (no changes needed — overview has no config-specific content)
- [x] Acceptance: Overview is consistent with new design

### Step 4: Update README.md (if applicable)

- [x] Review and update any getting-started or configuration instructions
- [x] Acceptance: README reflects new `init` and `config` workflow

### Final Step: Close Issue #138

- [x] Verify all previous tasks (#130, #131, #132) are merged (PRs #139, #140, #141 all merged)
- [x] Close GitHub issue #138 with a summary comment (already closed)
- [x] Acceptance: Issue #138 is closed

## Notes

- This task should be done last, after all implementation tasks are merged
- No code changes — spec and documentation only (plus issue closure)
