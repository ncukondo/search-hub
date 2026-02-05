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
| 15 | Distinguish Zero Results from Provider Failure | 10 | ✅ Completed | [20260129-02](completed/20260129-02-search-executor-zero-results-handling.md) |
| 16 | Show Detailed Error Information on Search Failure | 15 | ✅ Completed | [20260129-03](completed/20260129-03-search-error-detail-reporting.md) |
| 17 | Support Optional Config Keys in CLI | 2 | ✅ Completed | [20260129-04](completed/20260129-04-config-optional-keys.md) |
| 18 | Add `query init` Command for YAML Template Generation | 10 | ✅ Completed | [20260129-05](completed/20260129-05-query-init-template.md) |
| 19 | Show Actionable Error Messages with Suggested Next Steps | 16 | ✅ Completed | [20260129-06](completed/20260129-06-actionable-error-messages.md) |
| 20 | Enhance `--dry-run` with Provider Readiness and Query Diagnostics | 10 | ✅ Completed | [20260129-07](completed/20260129-07-dry-run-diagnostics.md) |
| 21 | Fix ProviderError Serialization to `[object Object]` | 5 | ✅ Completed | [20260129-08](completed/20260129-08-fix-provider-error-serialization.md) |
| 22 | Add Preflight Check for Scopus API Key Requirement | 9 | ✅ Completed | [20260129-09](completed/20260129-09-scopus-api-key-preflight-check.md) |
| 23 | Load .env with dotenv and Unify Env Var Naming | 2 | ✅ Completed | [20260129-10](completed/20260129-10-dotenv-loading-and-env-var-naming.md) |
| 24 | Fix PR Review Issues (PR #25 and PR #26) | 19, 20, 22 | ✅ Completed | [20260130-01](completed/20260130-01-pr-review-fixups.md) |
| 25 | Separate Real-API Tests into Dedicated Vitest Project | 13 | ✅ Completed | [20260130-02](completed/20260130-02-separate-api-tests.md) |
| 26 | Add Retry Logic to PubMedProvider and Consolidate Rate Limiters | 5, 6 | ✅ Completed | [20260130-03](completed/20260130-03-pubmed-retry-ratelimiter.md) |
| 27 | Flatten Inline XML Elements in PubMed Article Titles | 6 | ✅ Completed | [20260131-01](completed/20260131-01-flatten-pubmed-inline-xml.md) |
| 28 | Deduplicate Search Results by Identifier | 10 | ✅ Completed | [20260131-02](completed/20260131-02-deduplicate-search-results.md) |
| 29 | Improve Scopus Authentication Error Diagnostics | 9, 20 | ✅ Completed | [20260131-03](completed/20260131-03-scopus-auth-diagnostics.md) |
| 30 | Improve IDs Export Format and Add Year Field | 10 | ✅ Completed | [20260131-04](completed/20260131-04-export-ids-format-improvement.md) |
| 31 | Article→CSL-JSON Conversion & Register Bulk Import | 11 | ✅ Completed | [20260202-01](completed/20260202-01-register-bulk-import.md) |
| 32 | CSL-JSON Export Format | 31 | ✅ Completed | [20260202-02](completed/20260202-02-csl-json-export.md) |
| 33 | Skip Unconfigured Providers | 10 | ✅ Completed | [20260202-03](completed/20260202-03-skip-unconfigured-providers.md) |
| 34 | Dry-Run No-ID Article Details | 11 | ✅ Completed | [20260202-04](completed/20260202-04-dryrun-noid-details.md) |
| 35 | JSON Export Metadata Envelope | 10 | ✅ Completed | [20260202-05](completed/20260202-05-json-metadata-envelope.md) |
| 36 | Export Filter Options | 10 | ✅ Completed | [20260202-06](completed/20260202-06-export-filter.md) |
| 37 | Summary Command | 10 | ✅ Completed | [20260202-07](completed/20260202-07-summary-command.md) |
| 38 | Results Listing Command | 10, 37 | ✅ Completed | [20260203-01](completed/20260203-01-results-list-command.md) |
| 39 | Search Count-Only Mode | 6-9, 10 | ✅ Completed | [20260203-02](completed/20260203-02-search-count-only.md) |
| 40 | Session Diff Command | 10, 28 | ✅ Completed | [20260203-03](completed/20260203-03-session-diff.md) |
| 41 | Session Notes and Assessment | 4, 10 | ✅ Completed | [20260203-04](completed/20260203-04-session-notes.md) |
| 42 | Export to stdout by Default | 10 | ✅ Completed | [20260203-05](completed/20260203-05-export-stdout.md) |
| 43 | YAML Results Format | 10 | ✅ Completed | [20260203-06](completed/20260203-06-yaml-results-format.md) |
| 44 | Article Review Workflow | 28, 43 | ✅ Completed | [20260203-07](completed/20260203-07-review-workflow.md) |
| 45 | Register Command Review Integration | 44 | ✅ Completed | [20260203-08](completed/20260203-08-register-review-integration.md) |
| 46 | Fix Review Source Tracking | 44 | ✅ Completed | [20260203-09](completed/20260203-09-fix-review-source-tracking.md) |
| 47 | Improve CLI Discoverability | 10 | ✅ Completed | [20260204-01](completed/20260204-01-improve-cli-discoverability.md) |
| 48 | Document Query Refinement Workflow with Diff | 40, 47 | ✅ Completed | [20260204-02](completed/20260204-02-query-refinement-workflow-docs.md) |
| 49 | Improve ERIC API Error Handling | 7 | ✅ Completed | [20260204-03](completed/20260204-03-eric-error-handling.md) |
| 50 | Add Exclude Keywords (NOT Operator) to Query DSL | 3 | ✅ Completed | [20260204-04](completed/20260204-04-exclude-keywords.md) |
| 51 | Add Abstract Preview to Results Command | 38 | ✅ Completed | [20260204-05](completed/20260204-05-results-abstract-preview.md) |
| 52 | ERIC Phrase Query Error Handling | 49 | ✅ Completed | [20260204-06](completed/20260204-06-eric-phrase-query-error.md) |
| 53 | Query Refinement UX Improvements | 10, 39 | ✅ Completed | [20260204-07](completed/20260204-07-query-refinement-ux.md) |
| 54 | ERIC Thesaurus (Descriptors) Support | 7 | ✅ Completed | [20260204-08](completed/20260204-08-eric-thesaurus.md) |
| 55 | Query Diff Enhancement | 40 | ✅ Completed | [20260204-09](completed/20260204-09-query-diff-enhancement.md) |
| 56 | Screening Workflow Improvement | 44 | ✅ Completed | [20260204-10](completed/20260204-10-screening-workflow-improvement.md) |
| 57 | Next Step Suggestions | 10, 58 | ✅ Completed | [20260205-01](completed/20260205-01-next-step-suggestions.md) |
| 58 | Review Extract Session-Internal Management | 56 | ✅ Completed | [20260205-02](completed/20260205-02-review-extract-session-internal.md) |
| 59 | Fulltext Management Foundation | 4 | ✅ Completed | [20260205-03](completed/20260205-03-fulltext-foundation.md) |
| 60 | Fulltext Init and Sync Commands | 59 | 🔲 Planned | [20260205-04](20260205-04-fulltext-init-sync.md) |
| 61 | Fulltext OA Discovery | 59 | 🔲 Planned | [20260205-05](20260205-05-fulltext-oa-discovery.md) |
| 62 | Fulltext Fetch Command | 59, 61 | 🔲 Planned | [20260205-06](20260205-06-fulltext-fetch.md) |
| 63 | PMC XML to Markdown Conversion | 59 | 🔲 Planned | [20260205-07](20260205-07-fulltext-pmc-markdown.md) |
| 64 | Fulltext Register Integration | 59, 11 | 🔲 Planned | [20260205-08](20260205-08-fulltext-register-integration.md) |
| 65 | Fulltext Status and Pending Commands | 59, 61 | 🔲 Planned | [20260205-09](20260205-09-fulltext-status-pending.md) |
| 66 | Fulltext Documentation | 59-65 | 🔲 Planned | [20260205-10](20260205-10-fulltext-documentation.md) |

## Development Flow

1. **Create task file**: `spec/tasks/YYYYMMDD-NN-task-name.md` using `_template.md`
2. **Link in roadmap**: Update "Task File" column above
3. **Implement with TDD**: Follow the cycle in `_template.md` (Red → Green → Refactor)
4. **Update checkboxes**: Mark steps complete in task file
5. **Complete task**: Update status here, move task file to `completed/`

## Notes

- See `_template.md` for TDD cycle, step structure, and task file format
- Test files are co-located with source files (`*.test.ts`)
