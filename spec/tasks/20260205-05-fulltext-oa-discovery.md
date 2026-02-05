# Task: Fulltext OA Discovery

## Purpose

Implement OA (Open Access) discovery to check fulltext availability across multiple sources:
- Unpaywall API
- PubMed Central (PMC)
- arXiv
- CORE API

This enables `fulltext check` command and provides URLs for `fulltext fetch` and README generation.

## Related Specs

- [spec/fulltext/overview.md](../fulltext/overview.md) - Data Sources section

## Related Source Files

- `src/fulltext/types.ts` - OALocation type
- `src/fulltext/discovery/unpaywall.ts` (new)
- `src/fulltext/discovery/pmc.ts` (new)
- `src/fulltext/discovery/arxiv.ts` (new)
- `src/fulltext/discovery/core.ts` (new)
- `src/fulltext/discovery/index.ts` (new) - Aggregator
- `src/cli/commands/fulltext/check.ts` (new)

## Dependencies

- Task 59 (Fulltext Foundation) must be completed first

## Implementation Steps

### Step 1: Unpaywall Client

- [x] Write test: `src/fulltext/discovery/unpaywall.test.ts`
  - Test: Returns OALocation for OA article
  - Test: Returns null for closed access article
  - Test: Handles 404 (DOI not found)
  - Test: Respects rate limit
  - Test: Requires email configuration
- [x] Create stub: `src/fulltext/discovery/unpaywall.ts`
- [x] Verify test fails (Red)
- [x] Implement `checkUnpaywall(doi, email)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Unpaywall lookup works correctly

### Step 2: PMC Lookup

- [x] Write test: `src/fulltext/discovery/pmc.test.ts`
  - Test: Returns OALocations (PDF + XML) for PMC article
  - Test: Looks up PMCID from PMID via E-utilities
  - Test: Returns null if not in PMC
  - Test: Generates correct PDF and XML URLs
- [x] Create stub: `src/fulltext/discovery/pmc.ts`
- [x] Verify test fails (Red)
- [x] Implement `checkPmc(pmid)` and `getPmcUrls(pmcid)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: PMC lookup returns correct URLs

### Step 3: arXiv Lookup

- [x] Write test: `src/fulltext/discovery/arxiv.test.ts`
  - Test: Returns PDF URL for arXiv article
  - Test: Handles various arXiv ID formats (old: hep-ph/9901234, new: 2401.12345)
  - Test: Returns null for non-arXiv articles
- [x] Create stub: `src/fulltext/discovery/arxiv.ts`
- [x] Verify test fails (Red)
- [x] Implement `checkArxiv(arxivId)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: arXiv URL generation works

### Step 4: CORE API Client

- [x] Write test: `src/fulltext/discovery/core.test.ts`
  - Test: Returns OALocation for article in CORE
  - Test: Handles missing API key (skip gracefully)
  - Test: Handles 404 (not found)
  - Test: Respects rate limit
- [x] Create stub: `src/fulltext/discovery/core.ts`
- [x] Verify test fails (Red)
- [x] Implement `checkCore(doi, apiKey)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: CORE lookup works when configured

### Step 5: Discovery Aggregator

- [x] Write test: `src/fulltext/discovery/index.test.ts`
  - Test: Checks all configured sources in priority order
  - Test: Aggregates OALocations from multiple sources
  - Test: Determines overall oaStatus (open/closed/unknown)
  - Test: Skips unconfigured sources (no Unpaywall email, no CORE key)
- [x] Create stub: `src/fulltext/discovery/index.ts`
- [x] Verify test fails (Red)
- [x] Implement `discoverOA(article, config)`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Aggregator combines all sources correctly

### Step 6: Fulltext Check Command

- [x] Write test: `src/cli/commands/fulltext/check.test.ts`
  - Test: Checks OA for all included articles
  - Test: Updates meta.json with OA results
  - Test: Updates fulltext-index.json
  - Test: Shows summary (X open, Y closed, Z unknown)
  - Test: --format json outputs structured data
- [x] Create stub: `src/cli/commands/fulltext/check.ts`
- [x] Verify test fails (Red)
- [x] Implement `executeFulltextCheck()`
- [x] Verify test passes (Green)
- [x] Register command in CLI
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Check command works end-to-end

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/fulltext/discovery/discovery.e2e.test.ts`
  - Test: Real Unpaywall lookup (with test DOI)
  - Test: Real PMC lookup (with test PMID)
  - Test: Real arXiv lookup (with test arXiv ID)
  - Note: CORE test optional (requires API key)
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**:
  - Run `fulltext check` on real session
  - Verify OA status detected correctly
- [ ] Acceptance: All tests pass, discovery works in real usage

## API Details

### Unpaywall
```
GET https://api.unpaywall.org/v2/{doi}?email={email}
Response: { is_oa: boolean, best_oa_location: { url_for_pdf, ... }, oa_locations: [...] }
```

### PMC (E-utilities)
```
# PMID → PMCID
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pmc&id={pmid}&retmode=json

# PDF URL pattern
https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{id}/pdf/

# XML fetch
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmcid}&rettype=xml
```

### arXiv
```
# PDF URL pattern
https://arxiv.org/pdf/{id}.pdf
```

### CORE
```
GET https://api.core.ac.uk/v3/search/works?q=doi:"{doi}"
Headers: Authorization: Bearer {api_key}
```

## Configuration

```toml
[fulltext.sources]
unpaywall_email = "user@example.com"
core_api_key = ""  # Optional
prefer_sources = ["pmc", "arxiv", "unpaywall", "core"]
```

## Notes

- Unpaywall requires email (free, no registration)
- CORE requires API key (free registration at core.ac.uk)
- PMC and arXiv don't require authentication
- Rate limiting: Use existing rate limiter infrastructure
