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

- [ ] Write test: `src/fulltext/discovery/unpaywall.test.ts`
  - Test: Returns OALocation for OA article
  - Test: Returns null for closed access article
  - Test: Handles 404 (DOI not found)
  - Test: Respects rate limit
  - Test: Requires email configuration
- [ ] Create stub: `src/fulltext/discovery/unpaywall.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `checkUnpaywall(doi, email)`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Unpaywall lookup works correctly

### Step 2: PMC Lookup

- [ ] Write test: `src/fulltext/discovery/pmc.test.ts`
  - Test: Returns OALocations (PDF + XML) for PMC article
  - Test: Looks up PMCID from PMID via E-utilities
  - Test: Returns null if not in PMC
  - Test: Generates correct PDF and XML URLs
- [ ] Create stub: `src/fulltext/discovery/pmc.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `checkPmc(pmid)` and `getPmcUrls(pmcid)`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: PMC lookup returns correct URLs

### Step 3: arXiv Lookup

- [ ] Write test: `src/fulltext/discovery/arxiv.test.ts`
  - Test: Returns PDF URL for arXiv article
  - Test: Handles various arXiv ID formats (old: hep-ph/9901234, new: 2401.12345)
  - Test: Returns null for non-arXiv articles
- [ ] Create stub: `src/fulltext/discovery/arxiv.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `checkArxiv(arxivId)`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: arXiv URL generation works

### Step 4: CORE API Client

- [ ] Write test: `src/fulltext/discovery/core.test.ts`
  - Test: Returns OALocation for article in CORE
  - Test: Handles missing API key (skip gracefully)
  - Test: Handles 404 (not found)
  - Test: Respects rate limit
- [ ] Create stub: `src/fulltext/discovery/core.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `checkCore(doi, apiKey)`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: CORE lookup works when configured

### Step 5: Discovery Aggregator

- [ ] Write test: `src/fulltext/discovery/index.test.ts`
  - Test: Checks all configured sources in priority order
  - Test: Aggregates OALocations from multiple sources
  - Test: Determines overall oaStatus (open/closed/unknown)
  - Test: Skips unconfigured sources (no Unpaywall email, no CORE key)
- [ ] Create stub: `src/fulltext/discovery/index.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `discoverOA(article, config)`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Aggregator combines all sources correctly

### Step 6: Fulltext Check Command

- [ ] Write test: `src/cli/commands/fulltext/check.test.ts`
  - Test: Checks OA for all included articles
  - Test: Updates meta.json with OA results
  - Test: Shows summary (X open, Y closed, Z unknown)
  - Test: --format json outputs structured data
- [ ] Create stub: `src/cli/commands/fulltext/check.ts`
- [ ] Verify test fails (Red)
- [ ] Implement `executeFulltextCheck()`
- [ ] Verify test passes (Green)
- [ ] Register command in CLI
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Check command works end-to-end

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
