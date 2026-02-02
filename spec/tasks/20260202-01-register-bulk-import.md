# Task: Article-to-CSL-JSON Conversion and Register Bulk Import

## Purpose

The current `register` command adds articles one-by-one via `ref add <id>`, which is extremely slow for large result sets (860 articles takes tens of minutes). By converting articles to CSL-JSON and using `ref add -i json` for bulk import, registration can complete in seconds.

This task implements:
1. An `Article → CSL-JSON` conversion module
2. A `refAddBulk()` function for bulk import via `ref add -i json`
3. Rewriting `registerArticles()` to use bulk import

## Related Specs

- [spec/integration/reference-manager.md](../integration/reference-manager.md) - Registration flow and ref CLI interface
- [spec/models/common-types.md](../models/common-types.md) - Article type definition

## Related Source Files

- `src/integration/csl-json.ts` (new) - CSL-JSON conversion logic
- `src/integration/csl-json.test.ts` (new) - Conversion unit tests
- `src/integration/ref-cli.ts` - Add `refAddBulk()` function
- `src/integration/ref-cli.test.ts` - Add bulk import tests
- `src/integration/register.ts` - Rewrite to use bulk import
- `src/integration/register.test.ts` - Update mock tests
- `src/integration/register.e2e.test.ts` - Update E2E tests

## Design Details

### CSL-JSON ID Generation (`generateCslId`)

Human-readable `author-year` format:
- First author's family name (lowercased) + `-` + publication year
- Examples: `smith-2024`, `tanaka-2023`
- No author: `anon-2024`
- No year: `smith-nd` (no date)
- Duplicates within batch: `smith-2024`, `smith-2024a`, `smith-2024b`, ...
- `ref add` also auto-resolves ID conflicts (`idChanged: true`), providing a safety net

### Article → CSL-JSON Field Mapping

| Article | CSL-JSON | Notes |
|---|---|---|
| `title` | `title` | Direct |
| `authors[].family/given` | `author[].family/given` | Direct |
| `doi` | `DOI` | Uppercase key |
| `pmid` | `PMID` | CSL standard variable |
| `abstract` | `abstract` | Always included |
| `publicationDate` | `issued.date-parts` | `"2024-01-15"` → `[[2024,1,15]]` |
| `journal` | `container-title` | CSL name |
| `volume` | `volume` | Direct |
| `issue` | `issue` | Direct |
| `pages` | `page` | CSL name |
| (always) | `type` | `"article-journal"` |
| (generated) | `id` | Author-year format (see above) |

### Bulk Import Flow

1. Convert all articles to CSL-JSON array via `articlesToCslJson()`
2. Write to temporary file `sessionDir/_bulk_import.json`
3. Call `refAddBulk(tempFile, { libraryPath })` once
4. Map `RefAddOutput` to `RegistrationRecord`
5. Delete temporary file in `finally` block

### `--with-abstracts` Handling

Since CSL-JSON always includes the `abstract` field, abstracts are automatically registered during bulk import. The `--with-abstracts` flag becomes a no-op. Display a deprecation notice:
> "Note: abstracts are now always included in bulk import. --with-abstracts flag is no longer needed."

## Implementation Steps

### Step 1: CSL-JSON conversion — date parsing and ID generation

- [x] Write test: `src/integration/csl-json.test.ts`
  - Test `generateCslId`: `smith-2024`, `anon-2024`, `smith-nd`
  - Test date parsing: `"2024-01-15"` → `[[2024,1,15]]`, `"2024-01"` → `[[2024,1]]`, `"2024"` → `[[2024]]`, `undefined` → omitted
- [x] Create stub: `src/integration/csl-json.ts` (empty exports)
- [x] Verify test fails (Red)
- [x] Implement `generateCslId()` and date parsing helper
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: ID generation and date parsing work for all edge cases

### Step 2: CSL-JSON conversion — full article mapping

- [x] Write test: `src/integration/csl-json.test.ts`
  - Test `articleToCslJson`: fully populated article maps all fields correctly
  - Test `articleToCslJson`: minimal article (only title) produces valid CSL-JSON
  - Test `articlesToCslJson`: batch conversion with duplicate ID resolution (`smith-2024`, `smith-2024a`, `smith-2024b`)
- [x] Verify test fails (Red)
- [x] Implement `articleToCslJson()` and `articlesToCslJson()`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All article fields correctly mapped to CSL-JSON

### Step 3: `refAddBulk()` function

- [x] Write test: `src/integration/ref-cli.test.ts`
  - Test `refAddBulk()` calls `ref add -i json "<path>" -o json` with correct arguments
  - Test library path option is passed correctly
  - Test output is parsed via `RefAddOutputSchema`
- [x] Verify test fails (Red)
- [x] Implement `refAddBulk()` in `src/integration/ref-cli.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: `refAddBulk()` correctly invokes ref CLI with JSON input

### Step 4: Rewrite `registerArticles()` for bulk import

- [x] Write test: `src/integration/register.test.ts`
  - Test: articles are converted to CSL-JSON, written to temp file, and bulk imported
  - Test: `RefAddOutput` is correctly mapped to `RegistrationRecord`
  - Test: temporary file is cleaned up in finally block
  - Test: `--with-abstracts` displays deprecation notice
- [x] Verify test fails (Red)
- [x] Rewrite `registerArticles()` in `src/integration/register.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Registration uses single bulk import call instead of per-article calls

### Final Step: E2E Integration Tests

- [ ] Write/update E2E test: `src/integration/register.e2e.test.ts`
  - Test: bulk registration with real ref CLI produces correct results
  - Test: duplicate detection works in bulk mode
  - Test: articles without DOI/PMID are included in CSL-JSON (registered via metadata)
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Register a real session and verify results
- [ ] Acceptance: All tests pass, bulk registration works in real usage

## Notes

- `RefAddOutput` format is identical for bulk and single-item operations (confirmed)
- Duplicate detection in `ref add -i json` works via DOI/PMID matching (confirmed)
- The conversion module (`csl-json.ts`) will be reused by Task B (CSL-JSON export)
