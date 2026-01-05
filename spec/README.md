# Spec Directory

This directory contains specifications for the `search-hub` CLI tool. It is designed for AI agents and developers to understand the project structure and implementation details.

## Directory Structure

```
spec/
├── README.md              # This file - how to navigate specs
├── overview.md            # Project scope, goals, supported databases
├── architecture.md        # System design, directory structure, layers
│
├── models/                # Data model definitions
│   ├── query-dsl.md       # YAML query DSL grammar
│   ├── session.md         # Session folder structure
│   ├── config.md          # Configuration schema
│   └── common-types.md    # Shared TypeScript types
│
├── providers/             # Database provider specs
│   ├── _interface.md      # Common provider interface
│   ├── pubmed.md          # PubMed E-utilities
│   ├── eric.md            # ERIC API
│   ├── arxiv.md           # arXiv API
│   ├── scopus.md          # Scopus API
│   └── _future/           # Planned (not yet implemented)
│       ├── wos.md         # Web of Science
│       └── embase.md      # Embase
│
├── cli/                   # CLI specifications
│   ├── commands.md        # Command definitions
│   └── output-formats.md  # Export formats
│
├── integration/           # External tool integration
│   └── reference-manager.md
│
├── tasks/                 # Implementation tasks
│   ├── ROADMAP.md         # Progress tracking & task dependencies
│   ├── _template.md       # Task file template
│   ├── active/            # Current/pending tasks
│   └── completed/         # Archived tasks
│
└── decisions/             # Architecture Decision Records
    └── *.md               # Individual ADRs
```

## How to Use This Directory

### For New Features/Tasks

1. Check `tasks/ROADMAP.md` for overall progress and next available task
2. Read `overview.md` for project context (if unfamiliar)
3. Read `architecture.md` for system design (if unfamiliar)
4. Read relevant model/provider specs for the task
5. Follow task file in `tasks/active/` or create one using `tasks/_template.md`

### Reading Order by Task Type

| Task Type | Read First |
|-----------|------------|
| New provider | `providers/_interface.md` → `providers/{example}.md` |
| Query DSL changes | `models/query-dsl.md` |
| CLI changes | `cli/commands.md` |
| Config changes | `models/config.md` |
| ref integration | `integration/reference-manager.md` |

### File Dependency Graph

```
overview.md
    └── architecture.md
            ├── models/common-types.md
            │       ├── models/query-dsl.md
            │       ├── models/session.md
            │       └── models/config.md
            ├── providers/_interface.md
            │       ├── providers/pubmed.md
            │       ├── providers/eric.md
            │       ├── providers/arxiv.md
            │       └── providers/scopus.md
            ├── cli/commands.md
            │       └── cli/output-formats.md
            └── integration/reference-manager.md
```

## Conventions

### Language
All specs are written in English to save tokens for AI agents.

### Spec vs Code
- Specs define **purpose, interfaces, and constraints**
- Implementation details live in **code and comments**
- Avoid duplicating code in specs to prevent drift

### Task File Naming
`YYYYMMDD(number)-feature-name.md`

Example: `20240115-01-pubmed-provider.md`

### Updating Specs
When implementation changes affect specs:
1. Update relevant spec files
2. Note changes in commit message
3. Review for consistency with other specs
