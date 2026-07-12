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
| 88 | Review Basis Priority in Status Classification | 72, 74 | ✅ Completed | [20260207-13](completed/20260207-13-review-basis-priority-in-status.md) |
| 89 | Review Merge Output Decision Breakdown | 44 | ✅ Completed | [20260207-14](completed/20260207-14-review-merge-output-decision-breakdown.md) |
| 90 | Graceful Exit Code on Partial Search Success | 10 | ✅ Completed | [20260207-15](completed/20260207-15-search-partial-success-exit-code.md) |
| 91 | Unify Review Extract Format | 73 | ✅ Completed | [20260207-16](completed/20260207-16-unify-extract-format.md) |
| 92 | Basis Priority Override in classifyStatus | 88 | ✅ Completed | [20260207-17](completed/20260207-17-basis-priority-override.md) |
| 93 | Session Merge Command | - | ✅ Completed | [20260208-01](completed/20260208-01-session-merge-command.md) |
| 94 | Search Help Query Features | - | ✅ Completed | [20260208-02](completed/20260208-02-search-help-query-features.md) |
| 95 | Diff Merge Suggestion | 93 | ✅ Completed | [20260208-03](completed/20260208-03-diff-merge-suggestion.md) |
| 96 | Migrate Fulltext Module to `@ncukondo/academic-fulltext` Package | 59-66 | ✅ Completed | [20260210-01](completed/20260210-01-migrate-fulltext-to-package.md) |
| 97 | Validate Controlled Vocabulary Terms (MeSH) | 3 | ✅ Completed | [20260210-02](completed/20260210-02-validate-controlled-vocabulary.md) |
| 98 | Vocab Validator Improvements (Rate Limit, Timeout, Refactor) | 97 | ✅ Completed | [20260210-03](completed/20260210-03-vocab-validator-improvements.md) |
| 99 | ~~Vocab Suggestion Improvements~~ | 98 | ❌ Deleted (superseded by #100) | ~~20260210-04~~ |
| 100 | Default Vocab Validation with File-Based Cache | 98 | ✅ Completed | [20260210-05](completed/20260210-05-default-vocab-validation-with-cache.md) |
| 101 | Unify Review Schema to Local Copy Pattern | 44 | ✅ Completed | [20260210-06](completed/20260210-06-review-schema-path-local-copy.md) |
| 102 | Query YAML JSON Schema & `query init` Schema Link | 18, 100 | ✅ Completed | [20260210-07](completed/20260210-07-query-yaml-json-schema.md) |
| 103 | Improve MeSH Suggestion Accuracy for Suffix Typos | 100 | ✅ Completed | [20260210-08](completed/20260210-08-mesh-suggestion-suffix-typo.md) |
| 104 | Make `keywords` Optional in Term Block Schema | 3 | ✅ Completed | [20260210-09](completed/20260210-09-optional-keywords-in-term-block.md) |
| 105 | Wire Next Step Suggestions to `query validate` | 57 | ✅ Completed | [20260210-10](completed/20260210-10-wire-validate-suggestions.md) |
| 106 | Remove Deprecated `--vocab` Flag | 100 | ✅ Completed | [20260210-11](completed/20260210-11-remove-deprecated-vocab-flag.md) |
| 107 | Scopus Emtree Support & Unsupported Vocab Warnings | 104 | ✅ Completed | [20260211-01](completed/20260211-01-scopus-emtree-support.md) |
| 108 | Controlled Vocabulary Hit Count Validation | 107 | ✅ Completed | [20260211-02](completed/20260211-02-vocab-hit-count-validation.md) |
| 109 | MeSH Multi-word Progressive Prefix Suggestion | 103 | ✅ Completed | [20260211-03](completed/20260211-03-mesh-multiword-prefix-suggestion.md) |
| 110 | Improve $schema Absence Messaging | 105 | ✅ Completed | [20260211-04](completed/20260211-04-validate-schema-tip-messaging.md) |
| 111 | MeSH First-Word Typo Suggestion Improvement | 109 | ✅ Completed | [20260211-05](completed/20260211-05-mesh-first-word-typo-suggestion.md) |
| 112 | Results Query Filter (`-q` / `--query`) | 38 | ✅ Completed | [20260212-01](completed/20260212-01-results-query-filter.md) |
| 113 | Coverage Check Command (`check`) | 112 | ✅ Completed | [20260212-02](completed/20260212-02-check-coverage-command.md) |
| 114 | Documentation Update (Query Filter & Check) | 112, 113 | ✅ Completed | [20260212-03](completed/20260212-03-query-filter-docs.md) |
| 115 | Query DSL Provider-Aware Redesign | 3 | ✅ Completed | [20260212-04](completed/20260212-04-query-dsl-provider-aware-redesign.md) |
| 116 | Query Inspect Command | 115 | ✅ Completed | [20260212-05](completed/20260212-05-query-inspect-command.md) |
| 117 | Add `--decision` Filter to Review Finalize | 74 | ✅ Completed | [20260216-01](completed/20260216-01-review-finalize-decision-filter.md) |
| 118 | Add Comment Inline Guidance to Review Extract | 73 | ✅ Completed | [20260216-02](completed/20260216-02-review-extract-comment-guidance.md) |
| 119 | Replace Static JSON Schema with Zod-Generated Schema | 44 | ✅ Completed | [20260216-03](completed/20260216-03-review-schema-zod-generation.md) |
| 120 | Query Iteration Log | 39, 41 | ✅ Completed | [20260216-04](completed/20260216-04-query-iteration-log.md) |
| 121 | Redesign ReviewStatus (`uncertain`→`all-uncertain`, `conflicting`→`divided`) | 72, 88 | ✅ Completed | [20260216-05](completed/20260216-05-review-status-model-redesign.md) |
| 122 | Search Sort Option | 5, 6-9, 10 | ✅ Completed | [20260217-01](completed/20260217-01-search-sort-option.md) |
| 123 | PubMed ELink Related Articles Client | 6 | ✅ Completed | [20260217-02](completed/20260217-02-pubmed-related-articles.md) |
| 124 | `related` Command | 123 | ✅ Completed | [20260217-03](completed/20260217-03-related-command.md) |
| 125 | Review Picking Mode | 44, 121 | ✅ Completed | [20260217-04](completed/20260217-04-review-picking-mode.md) |
| 126 | Register Library Path & Default Library Hint | 11 | ✅ Completed | [20260306-01](completed/20260306-01-register-library-path-hint.md) |
| 127 | `query init <title>` & Default `queries/` Directory | 18 | ✅ Completed | [20260306-02](completed/20260306-02-query-init-title-arg.md) |
| 128 | Smart Query File Resolution & Documentation Update | 127 | ✅ Completed | [20260306-03](completed/20260306-03-smart-query-resolution-and-docs.md) |
| 129 | Single Binary Distribution via Bun Compile | - | ✅ Completed | [20260308-01](completed/20260308-01-single-binary-distribution.md) |
| 130 | Config Loader — `.search-hub/` Local Project Discovery | 2 | ✅ Completed | [20260308-02](completed/20260308-02-config-loader-local-discovery.md) |
| 131 | Refactor `init` — Local Default + `--global` Flag | 130 | ✅ Completed | [20260308-03](completed/20260308-03-init-local-global.md) |
| 132 | Refactor `config` — `--global`/`--local`/`--show-origin`/`--env-vars` | 130 | ✅ Completed | [20260308-04](completed/20260308-04-config-command-scope.md) |
| 133 | Update Specs, ADR, Docs + Close Issue #138 | 131, 132 | ✅ Completed | [20260308-05](completed/20260308-05-config-spec-update.md) |
| 134 | Query Path を .search-hub/queries/ に統一 (#143) | 130, 127, 128 | ✅ Completed | [20260309-01](completed/20260309-01-query-path-to-project-dir.md) |
| 135 | Register Articles with Alternative Identifiers (#151) | 11 | ✅ Completed | [20260712-01](completed/20260712-01-register-alt-identifiers.md) |
| 136 | Self-Upgrade Command + Update Notification | 129 | 🚧 In Progress | [20260712-02](20260712-02-self-upgrade.md) |

## Development Flow

1. **Create task file**: `spec/tasks/YYYYMMDD-NN-task-name.md` using `_template.md`
2. **Link in roadmap**: Update "Task File" column above
3. **Implement with TDD**: Follow the cycle in `_template.md` (Red → Green → Refactor)
4. **Update checkboxes**: Mark steps complete in task file
5. **Complete task**: Update status here, move task file to `completed/`

## Notes

- See `_template.md` for TDD cycle, step structure, and task file format
- Test files are co-located with source files (`*.test.ts`)
