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
| 60 | Fulltext Init and Sync Commands | 59 | ✅ Completed | [20260205-04](completed/20260205-04-fulltext-init-sync.md) |
| 61 | Fulltext OA Discovery | 59 | ✅ Completed | [20260205-05](completed/20260205-05-fulltext-oa-discovery.md) |
| 62 | Fulltext Fetch Command | 59, 61 | ✅ Completed | [20260205-06](completed/20260205-06-fulltext-fetch.md) |
| 63 | PMC XML to Markdown Conversion | 59 | ✅ Completed | [20260205-07](completed/20260205-07-fulltext-pmc-markdown.md) |
| 64 | Fulltext Register Integration | 59, 11 | ✅ Completed | [20260205-08](completed/20260205-08-fulltext-register-integration.md) |
| 65 | Fulltext Status and Pending Commands | 59, 61 | ✅ Completed | [20260205-09](completed/20260205-09-fulltext-status-pending.md) |
| 66 | Fulltext Documentation | 59-65 | ✅ Completed | [20260205-10](completed/20260205-10-fulltext-documentation.md) |
| 67 | Remove fulltext-index.json | 60, 61 | ✅ Completed | [20260206-01](completed/20260206-01-remove-fulltext-index-json.md) |
| 68 | JATS Parser `preserveOrder` Refactor | 63 | ✅ Completed | [20260206-02](completed/20260206-02-jats-preserve-order.md) |
| 69 | JATS `<disp-quote>` & Nested Block Elements | 68 | ✅ Completed | [20260206-03](completed/20260206-03-jats-block-elements.md) |
| 70 | JATS Minor Fixes (Entities, Refs, PMCID) | 68 | ✅ Completed | [20260206-04](completed/20260206-04-jats-minor-fixes.md) |
| 71 | Reviewer Registration in Review Merge | 44 | ✅ Completed | [20260206-05](completed/20260206-05-reviewer-registration.md) |
| 72 | Review Status Model Expansion | 71 | ✅ Completed | [20260206-06](completed/20260206-06-review-status-model.md) |
| 73 | Review Extract Format Enhancement | 72 | ✅ Completed | [20260206-07](completed/20260206-07-review-extract-format.md) |
| 74 | Review Finalize Command | 72 | ✅ Completed | [20260206-08](completed/20260206-08-review-finalize.md) |
| 75 | Dynamic Review Next Steps | 72, 73, 74 | ✅ Completed | [20260206-09](completed/20260206-09-review-dynamic-next-steps.md) |
| 76 | Fix JATS Reference Parsing Quality | 70 | ✅ Completed | [20260207-01](completed/20260207-01-jats-reference-quality.md) |
| 77 | Fix JATS PMCID Extraction for `pmcid` | 70 | ✅ Completed | [20260207-02](completed/20260207-02-jats-pmcid-extraction.md) |
| 78 | Improve JATS Table and Figure Rendering | 70 | ✅ Completed | [20260207-03](completed/20260207-03-jats-table-figure-rendering.md) |
| 79 | Support Additional JATS Block Elements | 78 | ✅ Completed | [20260207-04](completed/20260207-04-jats-additional-block-elements.md) |
| 80 | Support Additional JATS Inline Elements | 78 | ✅ Completed | [20260207-05](completed/20260207-05-jats-inline-elements.md) |
| 81 | Support JATS Back Matter and Floats Group | 78 | ✅ Completed | [20260207-06](completed/20260207-06-jats-back-matter-floats.md) |
| 82 | Extract Extended JATS Metadata | 77 | ✅ Completed | [20260207-07](completed/20260207-07-jats-extended-metadata.md) |
| 83 | Fix JATS Reference pub-id Formatting | 76 | ✅ Completed | [20260207-08](completed/20260207-08-jats-reference-pubid-formatting.md) |
| 84 | Fix JATS Headerless Table Rendering | 78 | ✅ Completed | [20260207-09](completed/20260207-09-jats-headerless-table-rendering.md) |
| 85 | Extract JATS Back Matter Notes Sections | 81 | ✅ Completed | [20260207-10](completed/20260207-10-jats-back-matter-notes.md) |
| 86 | Fix JATS Nested `<notes>` in Declarations | 85 | ✅ Completed | [20260207-11](completed/20260207-11-jats-nested-notes-in-declarations.md) |
| 87 | Support JATS `<glossary>` (Abbreviations) | 85 | ✅ Completed | [20260207-12](completed/20260207-12-jats-glossary-support.md) |
| 88 | Review Basis Priority in Status Classification | 72, 74 | 📋 Todo | [20260207-13](20260207-13-review-basis-priority-in-status.md) |
| 89 | Review Merge Output Decision Breakdown | 44 | 📋 Todo | [20260207-14](20260207-14-review-merge-output-decision-breakdown.md) |
| 90 | Graceful Exit Code on Partial Search Success | 10 | 📋 Todo | [20260207-15](20260207-15-search-partial-success-exit-code.md) |

## Development Flow

1. **Create task file**: `spec/tasks/YYYYMMDD-NN-task-name.md` using `_template.md`
2. **Link in roadmap**: Update "Task File" column above
3. **Implement with TDD**: Follow the cycle in `_template.md` (Red → Green → Refactor)
4. **Update checkboxes**: Mark steps complete in task file
5. **Complete task**: Update status here, move task file to `completed/`

## Notes

- See `_template.md` for TDD cycle, step structure, and task file format
- Test files are co-located with source files (`*.test.ts`)
