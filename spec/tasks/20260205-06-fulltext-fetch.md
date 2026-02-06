# Task: Fulltext Fetch Command

## Purpose

Implement `fulltext fetch` command to automatically download OA fulltexts:
- Download PDFs from Unpaywall, PMC, arXiv
- Download PMC XML for Markdown conversion
- Handle rate limiting and retries
- Track download progress

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - fulltext fetch section

## Related Source Files

- `src/fulltext/discovery/*.ts` - From Task 60
- `src/fulltext/download/downloader.ts` (new)
- `src/fulltext/download/pmc-xml.ts` (new)
- `src/cli/commands/fulltext/fetch.ts` (new)

## Dependencies

- Task 59 (Fulltext Foundation)
- Task 60 (OA Discovery)

## Implementation Steps

### Step 1: PDF Downloader

- [x] Write test: `src/fulltext/download/downloader.test.ts`
  - Test: Downloads PDF from URL to specified path
  - Test: Validates response is PDF (Content-Type check)
  - Test: Handles redirects
  - Test: Handles 403/404 errors gracefully
  - Test: Retries on network errors (3x with backoff)
  - Test: Respects rate limit per source
- [x] Create stub: `src/fulltext/download/downloader.ts`
- [x] Verify test fails (Red)
- [x] Implement `downloadPdf(url, destPath, options)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: PDF download with error handling

### Step 2: PMC XML Downloader

- [x] Write test: `src/fulltext/download/pmc-xml.test.ts`
  - Test: Downloads XML from PMC E-utilities
  - Test: Validates response is XML
  - Test: Handles PMCID correctly
  - Test: Handles errors gracefully
- [x] Create stub: `src/fulltext/download/pmc-xml.ts`
- [x] Verify test fails (Red)
- [x] Implement `downloadPmcXml(pmcid, destPath)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: PMC XML download works

### Step 3: Fetch Orchestrator

- [x] Write test: `src/fulltext/download/orchestrator.test.ts`
  - Test: Fetches from best available source (by priority)
  - Test: Creates directory if not exists
  - Test: Updates meta.json after download
  - Test: Updates reviews.yaml fulltext.hasFiles
  - Test: Concurrent downloads with limit (default 3)
  - Test: Progress callback for UI
- [x] Create stub: `src/fulltext/download/orchestrator.ts`
- [x] Verify test fails (Red)
- [x] Implement `fetchFulltext(article, sessionDir, options)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Orchestrator coordinates downloads

### Step 4: Fulltext Fetch Command

- [x] Write test: `src/cli/commands/fulltext/fetch.test.ts`
  - Test: Fetches all articles with OA locations
  - Test: --source filters by source (pmc, arxiv, unpaywall)
  - Test: --convert-markdown triggers XML→MD conversion
  - Test: --dry-run shows what would be downloaded
  - Test: Progress display during download
  - Test: Summary output (downloaded, failed, skipped)
- [x] Create stub: `src/cli/commands/fulltext/fetch.ts`
- [x] Verify test fails (Red)
- [x] Implement `executeFulltextFetch()`
- [x] Verify test passes (Green)
- [x] Register command in CLI
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Fetch command works end-to-end

### Step 5: Reviews.yaml Update

- [x] Write test for reviews.yaml integration
  - Test: After fetch, reviews.yaml fulltext.hasFiles updated
  - Test: Only updates articles that were fetched
- [x] Implement reviews.yaml update in orchestrator
- [x] Verify test passes
- [x] Acceptance: reviews.yaml stays in sync

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/cli/commands/fulltext/fetch.e2e.test.ts`
  - Test: Fetch real arXiv PDF (stable test article)
  - Test: Verify file downloaded and meta.json updated
  - Test: --dry-run doesn't download
- [x] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - Run `fulltext check` then `fulltext fetch` on real session
  - Verify PDFs downloaded to correct directories
- [ ] Acceptance: All tests pass, feature works in real usage

## CLI Interface

```bash
# Fetch all OA articles
search-hub fulltext fetch <session-id>

# Fetch from specific sources
search-hub fulltext fetch <session-id> --source pmc,arxiv

# With Markdown conversion
search-hub fulltext fetch <session-id> --convert-markdown

# Dry run
search-hub fulltext fetch <session-id> --dry-run
```

## Rate Limits

| Source | Limit | Implementation |
|--------|-------|----------------|
| PMC | 3 req/sec | Leaky bucket |
| arXiv | 1 req/3sec | Fixed delay |
| Unpaywall | 100k/day | Token bucket |
| CORE | 10 req/sec | Token bucket |

## Notes

- Source priority: pmc > arxiv > unpaywall > core (configurable)
- PMC preferred for XML availability (Markdown conversion)
- arXiv always has PDF available
- Unpaywall may have repository versions (preprint, accepted manuscript)
