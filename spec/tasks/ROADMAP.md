# Implementation Roadmap

This file tracks high-level progress. For implementation details, see individual task files in `spec/tasks/active/`.

## Progress

| # | Task | Deps | Status | Task File |
|---|------|------|--------|-----------|
| 1 | Project Setup | - | ✅ Completed | - |
| 2 | Config System | 1 | Pending | [20260104-01](active/20260104-01-config-system.md) |
| 3 | Query Parser & Validator | 1 | Pending | - |
| 4 | Session Manager | 2 | Pending | - |
| 5 | Provider Base & Rate Limiter | 1 | Pending | - |
| 6 | PubMed Provider | 3, 5 | Pending | - |
| 7 | ERIC Provider | 3, 5 | Pending | - |
| 8 | arXiv Provider | 3, 5 | Pending | - |
| 9 | Scopus Provider | 3, 5 | Pending | - |
| 10 | CLI Commands | 2-4, 6-9 | Pending | - |
| 11 | Reference Manager Integration | 10 | Pending | - |
| 12 | E2E Tests & Polish | All | Pending | - |

## Development Flow

1. **Create task file**: `spec/tasks/active/YYYYMMDD-NN-task-name.md` using `_template.md`
2. **Link in roadmap**: Update "Task File" column above
3. **Implement with TDD**: Follow the cycle in `_template.md` (Red → Green → Refactor)
4. **Update checkboxes**: Mark steps complete in task file
5. **Complete task**: Update status here, move task file to `completed/`

## Notes

- See `_template.md` for TDD cycle, step structure, and task file format
- Test files are co-located with source files (`*.test.ts`)
