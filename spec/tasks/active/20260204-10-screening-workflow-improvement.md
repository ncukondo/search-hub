# Task: Screening Workflow Improvement

## Purpose

AIエージェントと人間が協調してスクリーニングを行うためのワークフロー改善。extract/mark/mergeパターンを使い、AIには必要な情報のみを提供し、判断根拠（basis）を自動記録する。

### 設計原則

1. **AIエージェントはマスターを直接操作しない**
2. **basisはextract時に確定し、自動で引き継がれる**
3. **人間はマスターを直接編集可能**

## Related Specs

- [spec/models/review.md](../models/review.md) - reviewフィールド仕様（要更新）

## Related Source Files

- `src/cli/commands/review/init.ts`
- `src/cli/commands/review/extract.ts`
- `src/cli/commands/review/merge.ts`
- `src/cli/commands/review/mark.ts` (new)
- `src/cli/commands/review/status.ts`
- `src/cli/commands/review/list.ts`

## Data Structures

### マスターデータ（.internal/reviews.yaml）

```yaml
sessionId: 20260204_wbagenaiv3_ad647b
articles:
  - id: "10.2196/81718"
    title: "Automated Evaluation of Reflection..."
    abstract: "Background: Workplace-based..."
    year: "2025"
    doi: "10.2196/81718"
    reviews:
      - reviewer: ai:claude
        decision: include
        basis: title
        comment: WBA関連
        timestamp: 2026-02-04T12:34:56Z
```

### 作業ファイル（extract出力）

```yaml
# phase1.yaml（タイトルスクリーニング用）
sessionId: 20260204_wbagenaiv3_ad647b
basis: title
reviewer: ai:claude
articles:
  - id: "10.2196/81718"
    title: "Automated Evaluation of Reflection..."
    decision: null     # include / exclude / uncertain
    comment: ""
```

### reviewフィールド仕様

| フィールド | 必須 | 値 |
|-----------|------|-----|
| reviewer | Yes | `human:{name}` or `ai:{name}` |
| decision | Yes | `include` / `exclude` / `uncertain` |
| basis | Yes | `title` / `abstract` / `fulltext` |
| comment | No | 自由記述 |
| timestamp | Auto | ISO 8601形式（merge時に付与） |

## CLI Commands

### review extract

```bash
search-hub review extract --session ID \
  --basis title \              # title / abstract（必須）
  --filter pending \           # pending / uncertain / all
  --reviewer "ai:claude" \     # 作業ファイルに記録
  -o phase1.yaml
```

### review mark

```bash
# 1件マーク
search-hub review mark --file phase1.yaml \
  --id "10.2196/81718" \
  --decision include \
  --comment "WBA関連"

# 複数件一括マーク（JSON入力）
search-hub review mark --file phase1.yaml --input decisions.json
```

### review merge

```bash
search-hub review merge --session ID phase1.yaml
# → basis, reviewer, timestamp を自動付与してマスターに反映
```

### review status（ワークフロー案内）

```
Review Progress: 20260204_wbagenaiv3_ad647b
  Total:        116
  Pending:      94
  Reviewed:     22 (title: 22, abstract: 0)
  Finalized:    0  (include: 0, exclude: 0)

────────────────────────────────────────────────
AI Agent Workflow:
  Phase 1 (title screening):
    extract:  search-hub review extract --session ID --basis title --reviewer "ai:name" -o phase1.yaml
    mark:     search-hub review mark --file phase1.yaml --input decisions.json
    merge:    search-hub review merge --session ID phase1.yaml

  Phase 2 (abstract screening):
    extract:  search-hub review extract --session ID --basis abstract --filter uncertain --reviewer "ai:name" -o phase2.yaml
    mark:     search-hub review mark --file phase2.yaml --input decisions.json
    merge:    search-hub review merge --session ID phase2.yaml
────────────────────────────────────────────────
```

## Implementation Steps

### Step 1: Move reviews.yaml to .internal/

- [x] Update `review init` to create `.internal/reviews.yaml`
  - [x] Write test: `src/cli/commands/review/init.test.ts`
  - [x] Verify test fails (Red)
  - [x] Implement: create `.internal/` directory, write reviews.yaml there
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `review init` creates `sessions/{id}/.internal/reviews.yaml`

### Step 2: Add basis and timestamp to review schema

- [x] Update review type definition
  - [x] Write test for new fields
  - [x] Verify test fails (Red)
  - [x] Add `basis: 'title' | 'abstract' | 'fulltext'` field
  - [x] Add `timestamp: string` field (ISO 8601) - already existed
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Review type includes basis and timestamp

### Step 3: Implement review extract --basis --reviewer

- [x] Add `--basis` option (required: title / abstract)
  - [x] Write test: extract with --basis title outputs only id, title
  - [x] Write test: extract with --basis abstract outputs id, title, abstract
  - [x] Verify tests fail (Red)
  - [x] Implement basis filtering
  - [x] Verify tests pass (Green)

- [x] Add `--reviewer` option
  - [x] Write test: extract includes reviewer in output file
  - [x] Verify test fails (Red)
  - [x] Implement reviewer option
  - [x] Verify test passes (Green)

- [x] Output format update
  - [x] Write test: output includes sessionId, basis, reviewer, articles
  - [x] Verify test fails (Red)
  - [x] Implement new output format
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `review extract --basis title --reviewer "ai:claude" -o phase1.yaml` produces correct format

### Step 4: Implement review mark command

- [x] Create new command `review mark`
  - [x] Write test: mark single article in work file
  - [x] Write test: mark multiple articles via JSON input
  - [x] Write test: error if file doesn't have basis field
  - [x] Verify tests fail (Red)
  - [x] Implement mark command
  - [x] Verify tests pass (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `review mark --file phase1.yaml --id "..." --decision include` updates file

### Step 5: Update review merge for basis/timestamp

- [x] Auto-attach basis from work file
  - [x] Write test: merge adds basis from work file to each review
  - [x] Verify test fails (Red)
  - [x] Implement basis attachment
  - [x] Verify test passes (Green)

- [x] Auto-attach timestamp
  - [x] Write test: merge adds timestamp to each review
  - [x] Verify test fails (Red)
  - [x] Implement timestamp attachment
  - [x] Verify test passes (Green)

- [x] Auto-attach reviewer from work file
  - [x] Write test: merge uses reviewer from work file
  - [x] Verify test fails (Red)
  - [x] Implement reviewer attachment
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `review merge --session ID phase1.yaml` correctly merges with basis/timestamp/reviewer

### Step 6: Add workflow guidance to review status

- [x] Add AI Agent Workflow section to status output
  - [x] Write test: status output includes workflow commands
  - [x] Verify test fails (Red)
  - [x] Implement workflow output
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `review status` shows extract/mark/merge workflow

### Step 7: Add workflow to review list --json

- [x] Add workflow field to JSON output
  - [x] Write test: list --json includes workflow object
  - [x] Verify test fails (Red)
  - [x] Implement workflow in JSON output
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: `review list --json` includes workflow guidance

### Final Step: E2E Integration Tests (MANDATORY)

- [x] Write E2E test: full screening workflow
  - [x] Create session with articles
  - [x] `review init`
  - [x] `review extract --basis title --reviewer "ai:test" -o phase1.yaml`
  - [x] `review mark --file phase1.yaml --input decisions.json`
  - [x] `review merge --session ID phase1.yaml`
  - [x] Verify master has correct reviews with basis/timestamp
- [x] Write E2E test: two-phase screening (title then abstract)
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: Test the feature manually
- [x] Acceptance: All tests pass, workflow works end-to-end

## File Layout

```
sessions/
  {session-id}/
    .internal/
      reviews.yaml          # Master (hidden from AI)
    pubmed_results.yaml
    scopus_results.yaml
    session.json
```

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    .internal/reviews.yaml                       │
│                    マスターデータ（人間向け）                      │
└─────────────────────────────────────────────────────────────────┘
       │                                              ▲
       │ extract --basis title                        │ merge
       ▼                                              │
┌─────────────────────────────────────────────────────────────────┐
│  phase1.yaml                                                    │
│  basis: title / reviewer: ai:claude                             │
│  articles: [{id, title, decision, comment}, ...]                │
└─────────────────────────────────────────────────────────────────┘
       │                                              │
       │ mark --file phase1.yaml                      │
       │      --input decisions.json                  │
       ▼                                              │
┌─────────────────────────────────────────────────────────────────┐
│  phase1.yaml (edited)                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Notes

- Pre-release: 後方互換性は考慮不要
- 人間はマスター（.internal/reviews.yaml）を直接編集可能
- AIエージェントはextract/mark/mergeワークフローを使用
