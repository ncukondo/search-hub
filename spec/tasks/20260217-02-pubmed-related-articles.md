# Task: PubMed ELink Related Articles Client

## Purpose

Add PubMed ELink API support to discover related/similar articles from seed PMIDs. This is the foundation for the `related` command, enabling citation-based literature exploration for narrative reviews.

## Related Specs

- [spec/providers/pubmed.md](../providers/pubmed.md) - PubMed provider (ELink endpoint to be added)

## Related Source Files

- `src/providers/pubmed/client.ts` - `PubMedClient` (add `findRelated()`)
- `src/providers/pubmed/parser.ts` - XML parsing (add ELink response parser)
- `src/providers/pubmed/types.ts` - Types (add ELink types)

## Design

### PubMed ELink API

```
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi
  ?dbfrom=pubmed
  &db=pubmed
  &id={PMID}[&id={PMID}...]
  &cmd=neighbor_score
  &retmode=xml
  &api_key={key}
  &email={email}
```

- `cmd=neighbor_score` returns related articles with computed similarity scores
- Optional `term` parameter filters results (e.g., `review[filter]+AND+2024[pdat]`)
- Returns `<LinkSetDb>` with `<Link>` elements containing `<Id>` and `<Score>`

### Types

```typescript
// src/providers/pubmed/types.ts
interface ELinkOptions {
  ids: string[];
  term?: string;
  maxResults?: number;  // limit returned related IDs (post-fetch truncation by score)
}

interface RelatedArticle {
  id: string;
  score: number;
}

interface ELinkResponse {
  seedId: string;
  relatedIds: RelatedArticle[];
}
```

### Client Method

```typescript
class PubMedClient {
  async findRelated(options: ELinkOptions): Promise<ELinkResponse[]>;
}
```

- Calls ELink API with `cmd=neighbor_score`
- Parses XML response into `ELinkResponse[]`
- Sorts by score descending, truncates to `maxResults`
- Respects rate limiter
- Deduplicates across multiple seeds

## Implementation Steps

### Step 1: Add ELink types

- [ ] Write test: `src/providers/pubmed/types.test.ts` — validate ELink types
- [ ] Add `ELinkOptions`, `RelatedArticle`, `ELinkResponse` to types
- [ ] Verify test passes
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Types compile and are exported

### Step 2: ELink XML parser

- [ ] Write test: `src/providers/pubmed/parser.test.ts` — parse ELink XML response
- [ ] Add `parseELinkResponse()` function to parser
- [ ] Test with sample XML containing multiple seeds and scores
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Parser correctly extracts seed-to-related mappings with scores

### Step 3: `PubMedClient.findRelated()` method

- [ ] Write test: `src/providers/pubmed/client.test.ts` — verify URL construction and response handling
- [ ] Implement `findRelated()` in `PubMedClient`
- [ ] Include rate limiting, error handling, maxResults truncation
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: `findRelated({ ids: ['12345678'] })` returns parsed related articles

### Step 4: Deduplication across seeds

- [ ] Write test: `src/providers/pubmed/client.test.ts` — multi-seed dedup
- [ ] When multiple seeds are provided, merge related IDs and keep highest score
- [ ] Exclude seed PMIDs from results
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Duplicate PMIDs across seeds are merged; seeds excluded from output

### Final Step: API Integration Test

- [ ] Write API test: `src/providers/pubmed/pubmed.api.test.ts` — real ELink call
- [ ] Test with known PMID (e.g., a well-cited article)
- [ ] Verify response structure and score ordering
- [ ] Run full test suite: `npm test`
- [ ] Acceptance: Real API returns valid related articles with scores

## Notes

- ELink API has the same rate limits as other E-utilities endpoints
- The `term` filter is applied server-side by PubMed, reducing response size
- Scores are relative (not normalized), useful only for ranking within a result set
- [E-utilities ELink documentation](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
