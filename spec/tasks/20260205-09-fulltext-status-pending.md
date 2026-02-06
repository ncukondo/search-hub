# Task: Fulltext Status and Pending Commands

## Purpose

Implement utility commands for fulltext management:
- `fulltext status`: Show overall fulltext retrieval status
- `fulltext pending`: List articles needing manual download with URLs

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - CLI commands section

## Related Source Files

- `src/fulltext/types.ts` - From Task 59
- `src/fulltext/meta.ts` - From Task 59
- `src/cli/commands/fulltext/status.ts` (new)
- `src/cli/commands/fulltext/pending.ts` (new)

## Dependencies

- Task 59 (Fulltext Foundation)
- Task 60 (OA Discovery) - for pending URLs

## Implementation Steps

### Step 1: Fulltext Status Command

- [ ] Write test: `src/cli/commands/fulltext/status.test.ts`
  - Test: Shows total included articles count
  - Test: Shows articles with fulltext (PDF only, MD only, both)
  - Test: Shows pending count (directory exists, no files)
  - Test: Shows not initialized count (no directory)
  - Test: --format json outputs structured data
- [ ] Create stub: `src/cli/commands/fulltext/status.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `executeFulltextStatus()`
- [ ] Verify test passes (Green)
- [ ] Register command in CLI
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Status command shows accurate counts

### Step 2: Fulltext Pending Command

- [ ] Write test: `src/cli/commands/fulltext/pending.test.ts`
  - Test: Lists articles without fulltext
  - Test: Shows DOI and suggested URLs (from OA check)
  - Test: Shows publisher URL (doi.org link)
  - Test: --export writes URLs to file
  - Test: --format json outputs structured data
- [ ] Create stub: `src/cli/commands/fulltext/pending.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `executeFulltextPending()`
- [ ] Verify test passes (Green)
- [ ] Register command in CLI
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Pending command lists articles with URLs

### Step 3: URL Export Formatting

- [ ] Write test for URL export
  - Test: --export urls.txt creates file with URLs
  - Test: Format: one URL per line with article identifier
  - Test: Includes DOI link for all articles
- [ ] Implement URL export
- [ ] Verify test passes
- [ ] Acceptance: Export file usable for batch download

### Final Step: Integration Tests

- [ ] Write integration test
  - Test: Status reflects actual fulltext state
  - Test: Pending excludes articles with fulltext
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - Run status on session with mixed fulltext state
  - Run pending and verify URLs work
- [ ] Acceptance: Commands work in real usage

## CLI Interface

```bash
# Status
search-hub fulltext status <session-id>
search-hub fulltext status <session-id> --format json

# Pending
search-hub fulltext pending <session-id>
search-hub fulltext pending <session-id> --export urls.txt
search-hub fulltext pending <session-id> --format json
```

## Output Examples

### Status Output
```
Fulltext Status: my-session

  Included articles: 45
  With fulltext:     30
    - PDF only:      15
    - Markdown only:  5
    - Both:          10
  Pending:           10  (directories created, no files)
  Not initialized:    5  (no directory)
```

### Pending Output
```
15 articles need fulltext:

1. smith2024-a1b2c3d4 - "Machine Learning in Healthcare"
   DOI: 10.1234/example
   Publisher: https://doi.org/10.1234/example

2. jones2023-e5f6g7h8 - "Deep Learning Review"
   DOI: 10.5678/another
   Publisher: https://doi.org/10.5678/another
   Repository: https://repository.edu/paper.pdf  (from Unpaywall)

Export URLs: fulltext pending <session> --export urls.txt
```

### Export File Format (urls.txt)
```
# smith2024-a1b2c3d4 - Machine Learning in Healthcare
https://doi.org/10.1234/example

# jones2023-e5f6g7h8 - Deep Learning Review
https://doi.org/10.5678/another
https://repository.edu/paper.pdf
```

## Notes

- Status counts based on meta.json scanning and reviews.yaml
- Pending shows DOI link as fallback when no OA URL available
- Export format designed for easy manual batch download
