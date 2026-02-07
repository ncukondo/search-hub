# Review Workflow

## Overview

The review workflow implements systematic screening through progressive phases:
title screening, abstract screening, and fulltext screening. Each phase uses the
extract → mark/edit → merge → finalize cycle.

## Workflow Phases

```
Phase 1: Title Screening       Screen all articles by title only
    ↓ finalize (agreed)
Phase 2: Abstract Screening    Screen uncertain/conflicting by abstract
    ↓ finalize (agreed)
Phase 3: Fulltext Screening    Screen uncertain/conflicting + finalized-include by fulltext
    ↓ finalize (agreed)
Export / Register               Output final included articles
```

## Status Model

Each article is classified into one of 7 statuses, computed on-the-fly by
`classifyStatus(article, registeredReviewers)`:

| Status | Condition | Meaning |
|---|---|---|
| `pending` | No reviews | Not yet reviewed |
| `incomplete` | Some registered reviewers have not reviewed | Missing reviewer coverage |
| `uncertain` | All registered reviewers reviewed; at least one said `uncertain` (no include/exclude conflict) | Needs more information |
| `agreed-include` | All registered reviewers agree: `include` | Consensus: include |
| `agreed-exclude` | All registered reviewers agree: `exclude` | Consensus: exclude |
| `conflicting` | Both `include` and `exclude` decisions present | Reviewer disagreement |
| `finalized` | `finalDecision` is set | Decision confirmed |

### Classification Logic

```
1. finalDecision set?           → finalized
2. No reviews?                  → pending
3. Registered reviewer missing? → incomplete
4. include AND exclude present? → conflicting
5. Any uncertain?               → uncertain
6. All include?                 → agreed-include
7. All exclude?                 → agreed-exclude
```

The `incomplete` status requires the reviewer registry (Task 71). When no reviewers
are registered, step 3 is skipped (backward-compatible behavior).

### Type Definition

```typescript
type ReviewStatus =
  | 'pending'
  | 'incomplete'
  | 'uncertain'
  | 'agreed-include'
  | 'agreed-exclude'
  | 'conflicting'
  | 'finalized';
```

Replaces the previous `'pending' | 'needs-final' | 'conflicting' | 'finalized'`.

## File Formats

### Master File (`.internal/reviews.yaml`)

The single source of truth. Never edited directly by users.

```yaml
sessionId: my-session
reviewers:                          # Reviewer registry (Task 71)
  - name: "ai:claude"
    basis: title
  - name: "ai:gpt-4o"
    basis: title
articles:
  - doi: "10.1234/example1"
    title: "Machine learning in healthcare"
    authors: "Smith et al."
    year: "2024"
    abstract: "This paper reviews..."
    reviews:
      - reviewer: "ai:claude"
        decision: exclude
        basis: title
        comment: "off topic"
        timestamp: "2026-02-06T10:00:00Z"
      - reviewer: "ai:gpt-4o"
        decision: exclude
        basis: title
        timestamp: "2026-02-06T11:00:00Z"
    # No finalDecision → classifyStatus() computes "agreed-exclude"
```

### Extracted File (unified format)

All extracted files use the ReviewFile format. The mode determines what content is
included and what fields are available for editing.

#### Screening Mode (`--basis`)

For reviewers performing screening at a specific basis level.

```yaml
# yaml-language-server: $schema=../../schemas/review.schema.json
# Screening file: mark each article's decision in reviews[0].decision
# Valid decisions: include / exclude / uncertain
sessionId: my-session
basis: title                        # What information is shown
reviewer: "ai:claude"               # Top-level reviewer (applied to all decisions)
articles:
  - doi: "10.1234/example1"
    pmid: "12345678"
    title: "Machine learning in healthcare"
    reviews:
      - decision: uncertain          # exclude / uncertain
        comment: ""
  - doi: "10.1234/example2"
    title: "Cooking recipes for beginners"
    reviews:
      - decision: exclude            # exclude / uncertain
        comment: "off topic"
```

##### Basis-Dependent Content

| `--basis` | Fields Included |
|---|---|
| `title` | identifiers, `title` |
| `abstract` | identifiers, `title`, `abstract` |
| `fulltext` | identifiers, `title`, `abstract`, `fulltext` (dirName reference) |

##### Decision Inline Comments

| `--basis` | Comment on decision line |
|---|---|
| `title` | `# exclude / uncertain` |
| `abstract` | `# include / exclude / uncertain` |
| `fulltext` | `# include / exclude / uncertain` |

#### Final Decision Mode (`--finalize`)

For responsible person's confirmation. Includes review history and final decision field.

```yaml
# yaml-language-server: $schema=../../schemas/review.schema.json
# Final decision file: set finalDecision on each article
# Valid decisions: include / exclude / null
sessionId: my-session
reviewer: "human:tanaka"            # Top-level reviewer (pre-filled by extract)
articles:
  - doi: "10.1234/example1"
    pmid: "12345678"
    title: "Machine learning in healthcare"
    abstract: "This paper reviews..."
    reviewHistory:                  # Existing reviews (read-only, for context)
      - reviewer: "ai:claude"
        decision: exclude
        basis: title
        comment: "off topic"
        timestamp: "2026-02-06T10:00:00Z"
      - reviewer: "ai:gpt-4o"
        decision: exclude
        basis: title
        timestamp: "2026-02-06T11:00:00Z"
    reviews: []                     # New reviews only (write here)
    finalDecision: null             # include / exclude / null
```

##### Content Scoping with `--basis`

| Flags | Content Included |
|---|---|
| `--finalize` | identifiers, title, abstract, fulltext + reviewHistory + finalDecision |
| `--finalize --basis title` | identifiers, title + reviewHistory + finalDecision |
| `--finalize --basis abstract` | identifiers, title, abstract + reviewHistory + finalDecision |

##### Backward Compatibility

Extract without `--basis` and without `--finalize` behaves the same as `--finalize`
(all content + reviewHistory + finalDecision).

#### Merge Behavior for Extracted Files

- `reviewHistory`: **Ignored** (read-only reference for the reviewer)
- `reviews[]`: All entries are new. Each gets:
  - `reviewer` from top-level `reviewer` field
  - `basis` from top-level `basis` field if present, otherwise auto-detected from article data (fulltext > abstract > title)
  - `timestamp` auto-assigned if not provided
- `finalDecision`: Applied to master file if non-null
- **No duplicate detection needed**: History is separated from new reviews

## Commands

### `review init`

Initialize review file from search results.

```bash
search-hub review init --session <id>
```

### `review status`

Show review progress with dynamic next steps.

```bash
search-hub review status --session <id>
```

Output:
```
Review Progress: my-session
  Total:         100
  Pending:         0
  Incomplete:      8
  Uncertain:      12
  Agreed:         45  (include: 30, exclude: 15)
  Conflicting:     3
  Finalized:      32  (include: 20, exclude: 12)

Reviewers:
  ai:claude  (title)
  ai:gpt-4o  (title)

Next:
  45 articles have consensus — finalize them:
  $ search-hub review finalize --session my-session
```

### `review list`

List articles filtered by status.

```bash
search-hub review list --session <id> [--filter <statuses>] [--json]
```

`--filter` accepts comma-separated status values:
`pending`, `incomplete`, `uncertain`, `agreed-include`, `agreed-exclude`,
`conflicting`, `finalized`, `all` (default).

### `review extract`

Extract articles for review. All modes produce the unified ReviewFile format.

```bash
# Screening (with basis)
search-hub review extract --session <id> --name <name> \
  --basis <title|abstract|fulltext> --reviewer <id> \
  [--filter <statuses>] [--limit <n>] [--offset <n>] [--sort <method>] [--seed <n>]

# Final decision (all content)
search-hub review extract --session <id> --name <name> \
  --reviewer <id> --finalize \
  [--filter <statuses>] [--limit <n>] [--offset <n>] [--sort <method>] [--seed <n>]

# Final decision (scoped to specific content level)
search-hub review extract --session <id> --name <name> \
  --reviewer <id> --finalize --basis <title|abstract> \
  [--filter <statuses>] [--limit <n>] [--offset <n>] [--sort <method>] [--seed <n>]
```

`--reviewer` is **required** in all modes.

When `--limit` is specified and articles remain, Next Steps suggests the next batch
with correct `--offset` and incremented `--name`.

### `review mark`

Mark a single article's decision in a work file.

```bash
search-hub review mark --file <path> --id <id> --decision <include|exclude|uncertain> [--comment <text>]
```

For bulk marking, edit the YAML file directly. The `--input` JSON option is removed.

### `review merge`

Merge reviewed file back into master.

```bash
search-hub review merge --session <id> --name <name> [--dry-run]
```

### `review finalize` (NEW)

Auto-set `finalDecision` for articles with reviewer consensus.

```bash
search-hub review finalize --session <id> [--dry-run] [--min-reviewers <n>]
```

| Option | Description | Default |
|---|---|---|
| `--dry-run` | Preview without changes | false |
| `--min-reviewers <n>` | Minimum agreeing reviewers needed | 1 |

Behavior:
- `agreed-include` → `finalDecision: include`
- `agreed-exclude` → `finalDecision: exclude`
- All other statuses → skipped

Output:
```
Finalized 42 articles (30 include, 12 exclude)
Skipped: 5 pending, 8 incomplete, 12 uncertain, 3 conflicting

Next:
  20 articles need further review. Extract for abstract screening:
  $ search-hub review extract --session S --filter uncertain,conflicting,incomplete \
      --basis abstract --reviewer "name" --name abstract-screening
```

### `review export`

Export finalized articles.

```bash
search-hub review export --session <id> [--only included|excluded] [-o <path>] [--format yaml|csl-json]
```

## Example Workflow

```bash
# ========== Phase 1: Title Screening ==========

# Extract all for title review
search-hub review extract --session S --filter pending \
  --basis title --reviewer "ai:claude" --name title-claude
# AI/reviewer edits YAML: marks clear excludes, leaves rest as uncertain
search-hub review merge --session S --name title-claude
# Repeat for additional reviewers if needed

# Auto-finalize where all reviewers agree
search-hub review finalize --session S --dry-run   # Preview
search-hub review finalize --session S             # Execute

# ========== Responsible Person Check (optional) ==========

# Extract finalize candidates with review history for confirmation
search-hub review extract --session S \
  --filter agreed-include,agreed-exclude \
  --reviewer "human:tanaka" --finalize --name finalize-check
# Responsible person reviews history, sets finalDecision
search-hub review merge --session S --name finalize-check

# ========== Phase 2: Abstract Screening ==========

search-hub review extract --session S --filter uncertain,conflicting,incomplete \
  --basis abstract --reviewer "ai:claude" --name abstract-claude
search-hub review merge --session S --name abstract-claude
search-hub review finalize --session S

# ========== Phase 3: Fulltext Screening ==========

search-hub review extract --session S --filter uncertain,conflicting,finalized \
  --only-decision include \
  --basis fulltext --reviewer "ai:claude" --name fulltext-claude
search-hub review merge --session S --name fulltext-claude
search-hub review finalize --session S

# ========== Output ==========

search-hub review export --session S --only included -o final.yaml
search-hub register S --reviewed
```

## Dynamic Next Steps

Each mutating review command outputs context-aware next steps based on the current
article status distribution. See `spec/cli/suggestions.md` Phase 4 for the complete
suggestion rules.

### Next Steps Logic (simplified)

```
After any command:
  1. Run status to get current counts
  2. If agreed > 0:
       → "N articles have consensus — finalize them"
       → $ review finalize ...
  3. Else if (uncertain + conflicting + incomplete) > 0:
       → Detect next basis from reviewer registry
       → "N articles need {next_basis}-level review"
       → $ review extract --filter ... --basis {next_basis} ...
  4. Else if all finalized:
       → "All articles finalized"
       → $ review export ...
  5. If --limit was used and remaining > 0:
       → "N articles remaining. Extract next batch:"
       → $ review extract ... --offset X --limit Y --name next-batch
```

The static `WorkflowGuidance` / `WorkflowPhase` types, `generateWorkflow()` function,
and the hardcoded "AI Agent Workflow" section in `formatStatusOutput()` are all
**removed** and replaced by this dynamic system.

## Breaking Changes from Previous Design

| Item | Before | After |
|---|---|---|
| `ReviewStatus` | `pending \| needs-final \| conflicting \| finalized` | 7-value enum (see Status Model) |
| `classifyStatus()` | Takes only article | Takes article + registered reviewers |
| Work file default `decision` | `null` | `uncertain` |
| Extract `--reviewer` | Required only with `--basis` | Always required |
| Extract without `--basis` | ReviewFile with reviews[] | ReviewFile with reviewHistory[] + reviews[] |
| `review mark --input` | Batch JSON input | Removed (use direct YAML editing) |
| Merge duplicate detection | `isDuplicateReview` (reviewer+timestamp) | Not needed (reviewHistory separation) |
| `WorkflowGuidance` types | Static template in list.ts | Removed (dynamic Next Steps) |
| Static AI Agent Workflow | Hardcoded in formatStatusOutput | Removed (dynamic Next Steps) |
| Extracted file format | Work File (flat decision/comment) + Review File (reviews[]) | Unified ReviewFile (reviews[]) for both screening and final decision |
