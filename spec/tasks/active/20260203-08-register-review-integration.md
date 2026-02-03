# Task: Register Command Review Integration

## Purpose

Extend the `register` command to integrate with the review workflow, providing:

1. **Automatic detection**: Detect when a session has a reviews.yaml file
2. **Explicit selection**: Require `--reviewed` or `--all` when reviews exist
3. **Guidance**: Suggest the review workflow to users who haven't used it
4. **Safety**: Prevent accidental registration of excluded articles

### User Story

As a researcher, I want the `register` command to:
- Guide me toward the review workflow if I haven't used it
- Require explicit choice when reviews exist (avoid mistakes)
- Show review progress when relevant

## Related Specs

- [spec/tasks/active/20260203-07-review-workflow.md](./20260203-07-review-workflow.md) - Review workflow (dependency)
- [spec/integration/reference-manager.md](../integration/reference-manager.md) - Reference manager integration

## Related Source Files

- `src/cli/index.ts` - CLI command registration (register command at line 1226)
- `src/integration/register.ts` - `registerArticles()` function
- `src/cli/commands/review/types.ts` - Review types (from task 44)

## Behavior Specification

### Case 1: No reviews.yaml exists

```bash
$ search-hub register my-session

Registering 150 articles...
✓ 145 added, 3 duplicates, 2 failed

Tip: For systematic reviews, consider using the review workflow:
  1. search-hub review init my-session
  2. (AI/human review in reviews.yaml)
  3. search-hub register my-session --reviewed
```

- Behaves as before (backward compatible)
- Shows tip about review workflow after completion

### Case 2: reviews.yaml exists, no flag specified

```bash
$ search-hub register my-session

This session has a review file.
  Status: 32 include / 108 exclude / 10 pending

Please specify which articles to register:
  --reviewed   Register 32 included articles
  --all        Register all 150 articles (ignore reviews)

Example:
  search-hub register my-session --reviewed
```

- Does NOT proceed automatically
- Shows review status summary
- Requires explicit flag

### Case 3: --reviewed with pending articles

```bash
$ search-hub register my-session --reviewed

Warning: 10 articles still pending review (will be skipped).
Registering 32 included articles...

Proceed? [Y/n]
```

- Warns about pending articles
- Asks for confirmation (skip with `--force`)

### Case 4: --reviewed with no included articles

```bash
$ search-hub register my-session --reviewed

Error: No articles marked as 'include' in reviews.
  Status: 0 include / 140 exclude / 10 pending

Run 'search-hub review status my-session' for details.
```

### Case 5: --all with reviews.yaml

```bash
$ search-hub register my-session --all

Note: Ignoring review decisions. Registering all 150 articles.
✓ 145 added, 3 duplicates, 2 failed
```

- Proceeds but notes that reviews are being ignored

## CLI Options

```
search-hub register <session-id> [options]

Options:
  --reviewed      Register only articles with finalDecision='include'
  --all           Register all search results (ignore reviews)
  --dry-run       Preview without executing
  --force         Skip confirmation prompts
  --quiet         Suppress tips and suggestions
```

## Implementation Steps

### Step 1: Add review detection utility

- [x] Write test: `src/cli/commands/register.test.ts`
  - Test: `hasReviewFile(sessionId)` returns true/false
  - Test: `getReviewSummary(sessionId)` returns counts
- [x] Implement utilities in `src/cli/commands/register.ts`
- [x] Verify tests pass
- [x] Acceptance: Can detect and summarize review status

### Step 2: Add --reviewed and --all flags

- [x] Write test: `src/cli/commands/register.test.ts`
  - Test: --reviewed filters to finalDecision='include' only
  - Test: --all registers all articles
  - Test: error when reviews exist but no flag specified
- [x] Modify CLI option parsing in `src/cli/index.ts`
- [x] Verify tests pass
- [x] Acceptance: Flags work as specified

### Step 3: Add confirmation for pending articles

- [x] Write test: `src/cli/commands/register.test.ts`
  - Test: warns when pending > 0 with --reviewed
  - Test: --force skips confirmation
- [x] Implement confirmation prompt
- [x] Verify tests pass
- [x] Acceptance: User is warned about pending articles

### Step 4: Add workflow tip for non-review users

- [x] Write test: `src/cli/commands/register.test.ts`
  - Test: tip is shown after registration when no reviews.yaml
  - Test: --quiet suppresses tip
- [x] Implement tip display
- [x] Verify tests pass
- [x] Acceptance: Tip guides users to review workflow

### Step 5: Update help text

- [x] Update `--help` output with workflow examples
- [x] Acceptance: Help clearly explains both workflows

### Final Step: E2E Integration Tests

- [x] Write unit tests for all review integration utilities
- [x] Run full test suite: `npm test`
- [x] Acceptance: All tests pass, UX is intuitive

## Notes

- This task depends on Task 44 (Review Workflow) being completed first
- The `registerArticles()` function is reused; only input filtering changes
- Consider adding `--reviewed` summary to `register --dry-run` output
- Tip display can be disabled via config in future if users find it noisy
