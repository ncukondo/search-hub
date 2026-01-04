# Output Formats

## Export Formats

### ids

Plain text list of identifiers, one per line.

```
--format ids --id-type doi
```

Output:
```
10.1234/example1
10.1234/example2
10.5678/example3
```

```
--format ids --id-type pmid
```

Output:
```
12345678
12345679
12345680
```

```
--format ids --id-type all
```

Output (prefixed):
```
doi:10.1234/example1
pmid:12345678
arxiv:2401.12345
```

### json

Full JSON array with all metadata.

```json
{
  "session": {
    "id": "20240115_diabetes-ai_a3f2c1",
    "name": "diabetes_ai_scoping",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "summary": {
    "totalResults": 1500,
    "databases": {
      "pubmed": 800,
      "eric": 200,
      "arxiv": 300,
      "scopus": 200
    }
  },
  "results": [
    {
      "doi": "10.1234/example",
      "pmid": "12345678",
      "title": "Example Title",
      "authors": [
        {"family": "Smith", "given": "John"}
      ],
      "abstract": "...",
      "publicationDate": "2024-01-15",
      "journal": "Example Journal",
      "source": "pubmed",
      "retrievedAt": "2024-01-15T10:05:00Z"
    }
  ]
}
```

### jsonl

JSON Lines format (one record per line). Memory-efficient for large exports.

```jsonl
{"doi":"10.1234/example1","title":"...","source":"pubmed",...}
{"doi":"10.1234/example2","title":"...","source":"eric",...}
```

## Progress Display

Using ora/cli-progress for visual feedback:

```
⠋ PubMed    [████████████░░░░░░░░] 600/1200
✓ ERIC      [████████████████████]  200/200  completed
⠋ arXiv     [██░░░░░░░░░░░░░░░░░░]  50/500
◼ Scopus    waiting...
```

### States

| Icon | Meaning |
|------|---------|
| ⠋ (spinner) | In progress |
| ✓ | Completed |
| ✗ | Failed |
| ◼ | Pending |
| ⚠ | Partial |

## Status Output

### List View (default)

```
Sessions:
  20240115_diabetes-ai_a3f2c1  partial   1500 results
  20240110_cancer-ml_b4e3d2    completed 2300 results
  20240105_test_c5f4e3         failed    0 results
```

### Detail View

```
Session: 20240115_diabetes-ai_a3f2c1
Name: diabetes_ai_scoping
Created: 2024-01-15 10:00:00
Status: partial

Databases:
  PubMed:  ✓ completed  800/800
  ERIC:    ✓ completed  200/200
  arXiv:   ⚠ partial    150/300
  Scopus:  ✗ failed     0 (API key invalid)

Total: 1150 retrieved / 1500 expected

Resume with: search-hub resume 20240115_diabetes-ai_a3f2c1
```

### JSON Status

```bash
search-hub status 20240115_diabetes-ai_a3f2c1 --json
```

```json
{
  "id": "20240115_diabetes-ai_a3f2c1",
  "name": "diabetes_ai_scoping",
  "status": "partial",
  "databases": {
    "pubmed": {"status": "completed", "retrieved": 800, "total": 800},
    "eric": {"status": "completed", "retrieved": 200, "total": 200},
    "arxiv": {"status": "partial", "retrieved": 150, "total": 300},
    "scopus": {"status": "failed", "error": "API key invalid"}
  }
}
```

## Query Translation Output

```bash
search-hub query translate ./diabetes-ai.yaml
```

```
Query: diabetes_ai_scoping

PubMed:
  (diabetes[tiab] OR "type 2 diabetes"[tiab] OR "Diabetes Mellitus, Type 2"[mh])
  AND (AI[tiab] OR "machine learning"[tiab] OR "Artificial Intelligence"[mh])
  AND 2020:2024[dp] AND english[la]

ERIC:
  (title:diabetes OR title:"type 2 diabetes" OR abstract:diabetes OR abstract:"type 2 diabetes")
  AND (title:AI OR title:"machine learning" OR abstract:AI OR abstract:"machine learning")
  AND publicationdateyear:[2020 TO 2024]

arXiv:
  (ti:diabetes OR ti:"type 2 diabetes" OR abs:diabetes OR abs:"type 2 diabetes")
  AND (ti:AI OR ti:"machine learning" OR abs:AI OR abs:"machine learning")
  AND (cat:cs.AI OR cat:cs.LG)

Scopus:
  TITLE-ABS-KEY(diabetes OR "type 2 diabetes")
  AND TITLE-ABS-KEY(AI OR "machine learning")
  AND PUBYEAR > 2019 AND PUBYEAR < 2025 AND LANGUAGE(english)
```
