# Task: Add `query init` Command for YAML Template Generation

## Purpose

Currently, AI agents and users must read `spec/models/query-dsl.md` (and navigate through
`spec/README.md` → `spec/cli/commands.md` → `spec/models/query-dsl.md`) to understand the YAML
query format before they can write a query file. This friction is avoidable.

A `query init` command that generates a skeleton YAML file would allow both humans and AI agents
to start searching immediately without reading spec documentation. Additionally, the `query --help`
output currently shows only subcommand names with no information about the YAML format itself.

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - YAML query DSL grammar
- [spec/cli/commands.md](../cli/commands.md) - query subcommands

## Related Source Files

- `src/cli/commands/query.ts` - Query subcommand definitions
- `src/cli/index.ts` - CLI command registration

## Implementation Steps

### Step 1: Add `query init` subcommand

- [ ] Write test: `src/cli/commands/query.test.ts`
  - Test: `query init` generates valid YAML to stdout
  - Test: `query init -o output.yaml` writes file to specified path
  - Test: `query init -o output.yaml` refuses to overwrite existing file without `--force`
  - Test: generated YAML passes `query validate`
- [ ] Modify `src/cli/commands/query.ts`
  - Add `query init` subcommand
  - Options: `-o, --output <path>` (default: stdout), `--force` (overwrite)
  - Output a complete skeleton YAML with comments explaining each section:
    ```yaml
    name: my_search
    description: ""

    query:
      - field: title_abstract    # title, abstract, title_abstract, author, keyword, all
        terms:
          keywords:
            - "search term 1"
            - "search term 2"
          # mesh:                 # PubMed MeSH terms (optional)
          #   - "MeSH Heading"
        operator: OR             # How to combine terms within this block

      # Add more blocks — blocks are AND'd together
      # - field: title_abstract
      #   terms:
      #     keywords:
      #       - "another term"
      #   operator: OR

    # filters:                   # Optional: apply to all databases
    #   year_from: 2020
    #   year_to: 2026
    #   language:
    #     - en
    #   publication_types:
    #     exclude:
    #       - "Review"
    #       - "Comment"

    # overrides:                 # Optional: database-specific settings
    #   pubmed:
    #     filters:
    #       publication_types:
    #         exclude:
    #           - "Letter"
    ```
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `search-hub query init` outputs valid, well-commented YAML skeleton

### Step 2: Add YAML format summary to `query --help`

- [ ] Modify `src/cli/commands/query.ts`
  - Add `description` or `addHelpText` to the `query` command with a brief YAML format summary:
    ```
    Query YAML format (minimal):
      name: my_search
      query:
        - field: title_abstract
          terms:
            keywords: ["term1", "term2"]
          operator: OR

    Use "search-hub query init" to generate a template.
    ```
- [ ] Verify help output includes YAML summary
- [ ] Acceptance: `search-hub query --help` shows YAML format at a glance

### Step 3: E2E verification

- [ ] Write E2E test: `src/cli/commands/query.e2e.test.ts`
  - Test: `search-hub query init` produces valid YAML
  - Test: `search-hub query init -o /tmp/test.yaml` creates file
  - Test: `search-hub query validate` accepts the generated file
- [ ] Verify E2E test passes
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Run `search-hub query init`, save output, validate, and dry-run
- [ ] Acceptance: Full workflow from init → validate → dry-run works

## Spec Update Required

After implementation, update `spec/cli/commands.md` to add the `query init` subcommand:

```
### query init

Generate a template query YAML file.

  search-hub query init [options]

Options:
  -o, --output <path>  Write to file (default: stdout)
  --force              Overwrite existing file
```

## Notes

- The template should be self-documenting with comments, so users don't need external docs
- AI agents benefit most from the stdout default — they can read and modify in-memory
