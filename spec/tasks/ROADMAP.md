# Implementation Roadmap

This file tracks high-level progress. For implementation details, see individual task files in `spec/tasks/`.

## Progress

| # | Task | Deps | Status | Task File |
|---|------|------|--------|-----------|
| 1 | Project Setup | - | ✅ Completed | - |
| 2 | Config System | 1 | ✅ Completed | [20260104-01](completed/20260104-01-config-system.md) |
| 3 | Query Parser & Validator | 1 | ✅ Completed | [20260105-01](completed/20260105-01-query-parser-validator.md) |
| 4 | Session Manager | 2 | ✅ Completed | [20260105-02](completed/20260105-02-session-manager.md) |
| 5 | Provider Base & Rate Limiter | 1 | ✅ Completed | [20260105-03](completed/20260105-03-provider-base-rate-limiter.md) |
| 5a | Provider Session Resume | 4, 5 | ✅ Completed | [20260105-08](completed/20260105-08-provider-session-resume.md) |
| 6 | PubMed Provider | 3, 5a | ✅ Completed | [20260105-04](completed/20260105-04-pubmed-provider.md) |
| 7 | ERIC Provider | 3, 5a | ✅ Completed | [20260105-05](completed/20260105-05-eric-provider.md) |
| 8 | arXiv Provider | 3, 5a | ✅ Completed | [20260105-06](completed/20260105-06-arxiv-provider.md) |
| 9 | Scopus Provider | 3, 5a | ✅ Completed | [20260105-07](completed/20260105-07-scopus-provider.md) |
| 10 | CLI Commands | 2-4, 6-9 | ✅ Completed | [20260107-01](completed/20260107-01-cli-commands.md) |
| 11 | Reference Manager Integration | 10 | ✅ Completed | [20260109-01](completed/20260109-01-reference-manager-integration.md) |
| 12 | XDG-Compliant Platform Paths | 2 | ✅ Completed | [20260110-01](completed/20260110-01-xdg-paths.md) |
| 13 | E2E Tests & Polish | All | ✅ Completed | [20260109-02](completed/20260109-02-e2e-tests-polish.md) |
| 14 | Fix PubMed NOT Operator Syntax | 6 | ✅ Completed | [20260129-01](completed/20260129-01-fix-pubmed-not-operator.md) |
| 15 | Distinguish Zero Results from Provider Failure | 10 | 🔲 Pending | [20260129-02](active/20260129-02-search-executor-zero-results-handling.md) |
| 16 | Show Detailed Error Information on Search Failure | 15 | 🔲 Pending | [20260129-03](active/20260129-03-search-error-detail-reporting.md) |
| 17 | Support Optional Config Keys in CLI | 2 | 🔲 Pending | [20260129-04](active/20260129-04-config-optional-keys.md) |
| 18 | Add `query init` Command for YAML Template Generation | 10 | 🔲 Pending | [20260129-05](active/20260129-05-query-init-template.md) |
| 19 | Show Actionable Error Messages with Suggested Next Steps | 16 | 🔲 Pending | [20260129-06](active/20260129-06-actionable-error-messages.md) |
| 20 | Enhance `--dry-run` with Provider Readiness and Query Diagnostics | 10 | 🔲 Pending | [20260129-07](active/20260129-07-dry-run-diagnostics.md) |
| 21 | Fix ProviderError Serialization to `[object Object]` | 5 | ✅ Completed | [20260129-08](completed/20260129-08-fix-provider-error-serialization.md) |
| 22 | Add Preflight Check for Scopus API Key Requirement | 9 | 🔲 Pending | [20260129-09](active/20260129-09-scopus-api-key-preflight-check.md) |
| 23 | Load .env with dotenv and Unify Env Var Naming | 2 | ✅ Completed | [20260129-10](completed/20260129-10-dotenv-loading-and-env-var-naming.md) |

## Development Flow

1. **Create task file**: `spec/tasks/YYYYMMDD-NN-task-name.md` using `_template.md`
2. **Link in roadmap**: Update "Task File" column above
3. **Implement with TDD**: Follow the cycle in `_template.md` (Red → Green → Refactor)
4. **Update checkboxes**: Mark steps complete in task file
5. **Complete task**: Update status here, move task file to `completed/`

## Notes

- See `_template.md` for TDD cycle, step structure, and task file format
- Test files are co-located with source files (`*.test.ts`)
