# Task: Documentation Update for Query Filter and Check Commands

## Purpose

Update all documentation to reflect the new `-q` / `--query` filter on `results`/`export` and the new `check` command. This includes spec files, user-facing docs, and README. The documentation should clearly communicate the query refinement workflow including coverage verification.

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - command definitions
- [spec/README.md](../README.md) - spec directory index

## Related Source Files

- `README.md` - project README
- `docs/commands.md` - command reference
- `spec/cli/commands.md` - CLI spec

## Implementation Steps

### Step 1: Update `spec/cli/commands.md`

- [x] Add `-q, --query <expr>` to `results` command options table
- [x] Add query expression syntax section under `results`
- [x] Add deprecation note to `--filter-year`, `--filter-title`, `--filter-abstract` in `results`
- [x] Add `-q, --query <expr>` to `export` command options table
- [x] Add deprecation note to `--filter-*` in `export`
- [x] Add new `## check` section with full syntax, options, examples
- [x] Add `check` to Command Overview list at top
- [x] Acceptance: spec accurately reflects implementation

### Step 2: Update `docs/commands.md`

- [x] Add `-q` / `--query` to `results` section with examples
- [x] Add query syntax reference (field names, matching rules, AND/OR behavior)
- [x] Mark `--filter-year`, `--filter-title`, `--filter-abstract` as deprecated
- [x] Add `-q` to `export` section
- [x] Add new `## check` section with full documentation
- [x] Add `check` to Overview command list at top
- [x] Acceptance: user docs cover all new functionality with clear examples

### Step 3: Update `README.md`

- [x] Add "Result filtering" or "Query quality verification" to Features list
- [x] Update "Query Development → Workflow" section:
  - Step 2 "Review initial results": add `-q` example
  - Add new step for coverage checking with `check`
- [x] Add `check` to workflow example sequence
- [x] Acceptance: README reflects the complete query refinement workflow

### Step 4: Verify cross-references and consistency

- [ ] Verify `spec/README.md` Reading Order table includes `check` command context
- [ ] Verify all `-q` examples are consistent across README, docs, and spec
- [ ] Verify `check` input format documentation is consistent
- [ ] Run any link checkers or verify manual navigation
- [ ] Acceptance: no inconsistencies between documentation files

## Notes

- All spec files are written in English
- Keep documentation concise — avoid duplicating implementation details
- Focus on user-facing examples that show the query refinement workflow
- The docs update should happen after #112 and #113 are implemented, but the task file is created now for tracking
