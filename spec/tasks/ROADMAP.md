# Implementation Roadmap

## Task Order

Tasks ordered by dependency (least dependent first).

| Order | Task | Dependencies | Status |
|-------|------|--------------|--------|
| 1 | Project Setup | - | Pending |
| 2 | Config System | 1 | Pending |
| 3 | Query Parser & Validator | 1 | Pending |
| 4 | Session Manager | 2 | Pending |
| 5 | Provider Base & Rate Limiter | 1 | Pending |
| 6 | PubMed Provider | 3, 5 | Pending |
| 7 | ERIC Provider | 3, 5 | Pending |
| 8 | arXiv Provider | 3, 5 | Pending |
| 9 | Scopus Provider | 3, 5 | Pending |
| 10 | CLI Commands | 2, 3, 4, 6-9 | Pending |
| 11 | Reference Manager Integration | 10 | Pending |
| 12 | E2E Tests & Polish | All | Pending |

## Task Descriptions

### 1. Project Setup
- Initialize package.json with ESM
- Configure TypeScript (tsconfig.json)
- Set up Vitest
- Configure oxlint
- Create directory structure
- Add .gitignore, LICENSE, README.md

### 2. Config System
- TOML parser integration (@iarna/toml)
- Zod schemas for config validation
- Config loader with priority merging
- Environment variable handling
- `init` command skeleton

### 3. Query Parser & Validator
- YAML parser for query DSL
- Zod schemas for query validation
- Query AST types
- `query validate` command

### 4. Session Manager
- Session directory structure creation
- session.json read/write
- JSONL result file handling
- Event logging
- Resume state management

### 5. Provider Base & Rate Limiter
- Provider interface definition
- Abstract base class
- Rate limiter (token bucket)
- Retry logic with backoff
- Error types

### 6. PubMed Provider
- E-utilities client (esearch, efetch)
- Query translator (DSL → PubMed syntax)
- XML response parser
- MeSH term handling
- Tests with mocked API

### 7. ERIC Provider
- ERIC API client
- Query translator
- JSON response parser
- Tests with mocked API

### 8. arXiv Provider
- arXiv API client
- Query translator
- Atom XML parser
- Category handling
- Tests with mocked API

### 9. Scopus Provider
- Scopus API client
- Query translator
- JSON response parser
- API key validation
- Tests with mocked API

### 10. CLI Commands
- Commander.js setup
- `search` command (full + direct query)
- `resume` command
- `status` command
- `export` command
- `config` command
- `query translate` command
- Progress bar (ora)

### 11. Reference Manager Integration
- `register` command
- ref CLI invocation
- Abstract update flow
- Error handling

### 12. E2E Tests & Polish
- Integration tests with real APIs (optional)
- README documentation
- npm publish preparation

## Development Flow

For each task:
1. Create task file: `spec/tasks/active/YYYYMMDD-NN-task-name.md`
2. Create feature branch
3. Write tests first (TDD)
4. Implement
5. Update task checkboxes
6. PR and merge
7. Move task to `completed/`
