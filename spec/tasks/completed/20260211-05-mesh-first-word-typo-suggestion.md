# Task: MeSH First-Word Typo Suggestion Improvement

## Purpose

`lookupTerm` の現在のフォールバック戦略は、第2語以降のタイポには強力だが、
第1語にタイポがある場合にサジェスチョンが出ない、または不適切な候補を返す。

### 現状の問題

フォールバック戦略 (`src/query/mesh-lookup.ts`) で第1語にタイポがある場合:

| 入力 | 期待 | 実際の結果 |
|------|------|-----------|
| `Brest Neoplasms` | "Breast Neoplasms" | "Brestan"（不適切） |
| `Breat Neoplasms` | "Breast Neoplasms" | "Breath Tests"（不適切） |
| `Diabetse Mellitus` | "Diabetes Mellitus" | サジェスチョンなし |
| `Dibetes Mellitus` | "Diabetes Mellitus" | サジェスチョンなし |
| `Neurl Networks` | "Neural Networks, Computer" | "NEURL1 protein, rat"（不適切） |

原因: step 4 の `startsWith(firstWord)` は第1語のプレフィックスが正しいことを前提としている。
第1語にタイポがあると、プレフィックスマッチが無関係な用語を返すか、ヒットしない。

### 改善方針

2つのフォールバックステップを step 4 の後に追加する:

**A) Step 4b: 第1語の切り詰め startsWith + 第2語フィルタ**
第1語を末尾から段階的に短縮し、startsWith で検索。結果を第2語（またはその先頭部分）で
フィルタリングし、Levenshtein 距離で再ランキングする。

例: `Brest Neoplasms` → `Bres` + startsWith → 多数ヒット → "Neoplasm" 含むものをフィルタ
→ "Breast Neoplasms" が残る

**B) Step 4c: 第2語の contains + Levenshtein 再ランキング**
第2語で contains 検索し、結果を元の入力全体との Levenshtein 距離で再ランキングする。

例: `Diabetse Mellitus` → contains("Mellitus") → "Diabetes Mellitus" 等がヒット
→ Levenshtein で再ランキング

## Related Specs

- [spec/tasks/completed/20260211-03-mesh-multiword-prefix-suggestion.md](completed/20260211-03-mesh-multiword-prefix-suggestion.md) — Task #109（multi-word progressive prefix）
- [spec/tasks/completed/20260210-08-mesh-suggestion-suffix-typo.md](completed/20260210-08-mesh-suggestion-suffix-typo.md) — Task #103（suffix typo 改善）

## Related Source Files

- `src/query/mesh-lookup.ts` — `MeSHLookupClient.lookupTerm()` のフォールバック戦略
- `src/query/mesh-lookup.test.ts` — 単体テスト
- `src/utils/levenshtein.ts` — Levenshtein 距離ユーティリティ（既存）
- `src/cli/commands/query/validate.e2e.test.ts` — E2E テスト

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: 第1語切り詰め startsWith + 第2語フィルタ (Step 4b)

`lookupTerm()` の step 4（第1語 startsWith + Levenshtein 再ランキング）の後に新ステップを追加。
多語用語で step 4 が不適切な候補を返した場合、または候補がなかった場合のフォールバック。

アルゴリズム:
```
if (words.length > 1) {
  const firstWord = words[0]!;
  const restWords = words.slice(1).join(' ').toLowerCase();
  for (let len = firstWord.length - 1; len >= 3; len--) {
    const truncated = firstWord.slice(0, len);
    const results = await this.fetchLookup(truncated, 'startswith', 25);
    const filtered = results.filter(r =>
      r.label.toLowerCase().includes(restWords.slice(0, 4))
    );
    if (filtered.length > 0) {
      const ranked = filtered
        .map(s => ({ label: s.label, distance: levenshteinDistance(...) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5)
        .map(s => s.label);
      return { term, found: false, suggestions: ranked };
    }
  }
}
```

注意: 最大反復回数は3回に制限（API コール数制約）。
`len` の開始は `firstWord.length - 1`、終了条件は `>= 3` かつ最大3回。

- [x] Write test: `src/query/mesh-lookup.test.ts`
  - "Brest Neoplasms" で step 4b により "Breast Neoplasms" がサジェスチョンに含まれること
  - "Breat Neoplasms" で同様に "Breast Neoplasms" が得られること
  - step 4 で正しい候補が得られる場合は step 4b に到達しないこと
  - 単語が1語の場合は step 4b がスキップされること
- [x] Verify test fails (Red)
- [x] Implement: `lookupTerm` に step 4b を追加（step 4 の後）
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 第1語タイポの多語用語で正しいサジェスチョンが得られる

### Step 2: 第2語 contains + Levenshtein 再ランキング (Step 4c)

step 4b でもヒットしなかった場合の最終フォールバック。
第2語以降で contains 検索し、Levenshtein で再ランキング。

アルゴリズム:
```
if (words.length > 1) {
  const lastWord = words[words.length - 1]!;
  const containsResults = await this.fetchLookup(lastWord, 'contains', 25);
  if (containsResults.length > 0) {
    const ranked = containsResults
      .map(s => ({ label: s.label, distance: levenshteinDistance(...) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(s => s.label);
    return { term, found: false, suggestions: ranked };
  }
}
```

- [x] Write test: `src/query/mesh-lookup.test.ts`
  - "Diabetse Mellitus" で step 4c により "Diabetes Mellitus" がサジェスチョンに含まれること
  - step 4b でヒットする場合は step 4c に到達しないこと
- [x] Verify test fails (Red)
- [x] Implement: `lookupTerm` に step 4c を追加（step 4b の後）
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 第1語が大幅に崩れた場合でも第2語から正しい候補が得られる

### Step 3: 既存テストの mock 更新

step 4b/4c の追加により、多語用語の既存テストで mock シーケンスが変わる可能性がある。
step 4 まで到達するテストケースで、step 4b/4c の API コール分の mock を追加する。

- [x] 既存テストを実行し、失敗するテストを特定
- [x] mock シーケンスを更新
- [x] 全テスト pass を確認
- [x] Run `npm run lint && npm run typecheck`

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [x] Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - 第1語タイポの MeSH 用語（"Brest Neoplasms" 等）で
    "Breast Neoplasms" がサジェスチョンに含まれることを確認
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [ ] **Manual verification**: 第1語タイポの用語で validate を実行しサジェスチョンを確認
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- step 4b は最大3回の API コールに制限。step 4c は1回。合計で lookupTerm あたりの最大 API コール数は
  10（Task #109 時点）→ 14 に増加するが、キャッシュにより2回目以降はゼロ
- `levenshteinDistance` は既に `src/utils/levenshtein.ts` に実装済み。新規ユーティリティは不要
- step 4b の第2語フィルタは先頭4文字の部分一致を使用。完全一致だと複数形/単数形の差異で
  フィルタ漏れが起きるため
- step 4c の contains は第2語のみ使用。第1語はタイポしているため検索キーとして不適切
