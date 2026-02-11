# Task: MeSH Multi-word Progressive Prefix Suggestion

## Purpose

`lookupTerm` のフォールバック戦略が多語用語の中間タイポに弱い。
"Artificial Inteligence"（'l' が1つ欠落）に対して "Artificial Intelligence" が候補に出ず、
無関係な "Artificial Arm" 等が返される。

### 現状の問題

フォールバック戦略 (`src/query/mesh-lookup.ts`):
1. `exact("Artificial Inteligence")` → miss
2. `startsWith("Artificial Inteligence")` → miss
3. `startsWith` 末尾1-3文字削除 → miss（タイポが中間にあるため末尾削除では到達しない）
4. `contains("Artificial Inteligence")` → miss（MeSH用語内にこの文字列を含むものがない）
5. `startsWith("Artificial")` limit=5 → "Artificial Arm" 等がヒット（正解は20件目以降）

NLM API の `startsWith("Artificial Inte")` は "Artificial Intelligence" を返すことを実験で確認済み。
つまり word1 + word2 の先頭数文字で startsWith すれば、タイポを迂回して正解に到達できる。

### 改善方針

2つの改善を行う:

**A) Step 2c: Multi-word progressive prefix**
step 2b と step 3 の間に新ステップを追加。多語用語の場合に `words[0] + " " + words[1].slice(0, N)` を
N を段階的に短縮しながら startsWith で検索する。step 2b の末尾3文字削除ではカバーできない、
word2 のより短い prefix を探索する。

**B) Step 4 強化: Levenshtein 再ランキング**
step 4 の `startsWith(firstWord)` の limit を 5 → 25 に増加し、
Levenshtein 距離で再ランキングして上位5件を返す。
これにより step 4 にフォールバックした場合でもサジェスチョンの質が向上する。

## Related Specs

- [spec/tasks/completed/20260210-08-mesh-suggestion-suffix-typo.md](completed/20260210-08-mesh-suggestion-suffix-typo.md) — Task #103（suffix typo 改善）
- [spec/tasks/completed/20260210-05-default-vocab-validation-with-cache.md](completed/20260210-05-default-vocab-validation-with-cache.md) — Task #100（フォールバック戦略定義）

## Related Source Files

- `src/query/mesh-lookup.ts` — `MeSHLookupClient.lookupTerm()` のフォールバック戦略
- `src/query/mesh-lookup.test.ts` — 単体テスト
- `src/utils/levenshtein.ts` — **新規作成** Levenshtein 距離ユーティリティ
- `src/utils/levenshtein.test.ts` — **新規作成** テスト
- `src/cli/commands/query/validate.e2e.test.ts` — E2E テスト

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Levenshtein 距離ユーティリティ

`src/utils/levenshtein.ts` に Wagner-Fischer アルゴリズムを実装する。
外部依存なし、~20行の pure TypeScript。

- [x] Write test: `src/utils/levenshtein.test.ts`
  - `levenshteinDistance('', '') === 0`
  - `levenshteinDistance('abc', '') === 3`
  - `levenshteinDistance('kitten', 'sitting') === 3`
  - `levenshteinDistance('Artificial Inteligence', 'Artificial Intelligence') === 1`
  - `levenshteinDistance('a', 'a') === 0`
- [x] Verify test fails (Red)
- [x] Implement: `src/utils/levenshtein.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 全テストケースが正しい距離を返す

### Step 2: Multi-word progressive prefix (step 2c)

`lookupTerm()` の step 2b（末尾 truncation）と step 3（contains）の間に新ステップを追加。

多語用語（2語以上）で step 1〜2b が全て失敗した場合に、
`words[0] + " " + words[1].slice(0, N)` を N を段階的に短縮しながら startsWith で検索する。

アルゴリズム:
```
words = term.split(/\s+/)
if (words.length >= 2 && words[1].length > 3) {
  // step 2b がカバーする範囲（末尾3文字削除）より短い prefix を探索
  startN = min(words[1].length - 4, words[1].length - 1)
  endN = 3
  最大3回の API コールに制限
  for N from startN down to endN (max 3 iterations):
    prefix = words[0] + " " + words[1].slice(0, N)
    results = fetchLookup(prefix, 'startswith', 5)
    if results → return suggestions
}
```

"Artificial Inteligence" の場合:
- words[1] = "Inteligence" (11文字), startN = min(7, 10) = 7
- N=7: "Artificial Intelig" → miss
- N=6: "Artificial Inteli" → miss
- N=5: "Artificial Intel" → ✓ "Artificial Intelligence" がヒット

- [x] Write test: `src/query/mesh-lookup.test.ts`
  - "Artificial Inteligence" で step 2c により "Artificial Intelligence" が suggestion に含まれることを検証
  - step 2（全体 startsWith）でヒットする場合は step 2c が呼ばれないことを検証
  - 単語が1語の場合は step 2c がスキップされることを検証
  - words[1].length <= 3 の場合は step 2c がスキップされることを検証
- [x] Verify test fails (Red)
- [x] Implement: `lookupTerm` に step 2c を追加（step 2b の後、step 3 の前）
- [x] Verify test passes (Green)
- [x] **既存テストの更新**: step 2c の追加により、多語用語の既存テストで
  mock シーケンスが変わる（step 2c の API コール分が追加される）。
  以下のテストの mock を更新:
  - `'should return suggestions via contains when startswith fails (typo)'`
  - `'should return suggestions via first-word startswith for multi-word terms'`
  - `'should fall back to contains when truncated startswith also fails'`
  - (skipped `'should return found=false...'` — words[1]="Not" (3 chars) doesn't trigger step 2c)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: 中間タイポの多語用語で正しいサジェスチョンが得られる

### Step 3: Step 4 強化（Levenshtein 再ランキング）

step 4 (先頭語 startsWith) の limit を 5 → 25 に増加し、
結果を Levenshtein 距離で再ランキングして上位5件を返す。
比較は大文字小文字を区別しない（`.toLowerCase()`）。

注意: Step 2 で `words` 変数を step 2c で先に宣言するため、step 4 の既存 `words` 宣言を
削除し、上位で共有する。

- [x] Write test: `src/query/mesh-lookup.test.ts`
  - step 4 まで到達するケースで、limit=25 の mock レスポンスから
    Levenshtein 距離の近い順にソートされた suggestion が返ることを検証
  - 例: "Artificial Inteligence" に対して "Artificial Intelligence" (距離1) が
    "Artificial Arm" (距離大) より先に来ること
- [x] Verify test fails (Red)
- [x] Implement: step 4 を修正
  ```typescript
  if (words.length > 1) {
    const firstWord = words[0]!;
    const firstWordResults = await this.fetchLookup(firstWord, 'startswith', 25);
    if (firstWordResults.length > 0) {
      const ranked = firstWordResults
        .map((s) => ({
          label: s.label,
          distance: levenshteinDistance(term.toLowerCase(), s.label.toLowerCase()),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5)
        .map((s) => s.label);
      const result: MeSHLookupResult = { term, found: false, suggestions: ranked };
      this.cache?.set('mesh', term, result);
      return result;
    }
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: step 4 のサジェスチョンが入力に最も近い順に並ぶ

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [x] Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - 中間タイポの MeSH 用語（"Artificial Inteligence" 等）で
    "Artificial Intelligence" がサジェスチョンに含まれることを確認
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: "Artificial Inteligence" で validate を実行しサジェスチョンを確認
  - curl で NLM API の直接テスト:  startsWith("Artificial Intel") → "Artificial Intelligence" ヒット確認
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- step 2c は最大3回の API コールに制限。これにより lookupTerm あたりの最大 API コール数は
  7（Task #103 時点）→ 10 に増加するが、キャッシュにより2回目以降はゼロ
- step 4 の limit 増加（5→25）は API コール数を増やさない（回数は同じ、レスポンスサイズのみ増加）
- Levenshtein 距離の実装は ~20行の pure TypeScript で外部依存なし
- `words` 変数のスコープ変更（step 4 のローカル → lookupTerm 全体で共有）に注意
- step 2c は word1 が正しい場合にのみ有効。word1 にタイポがある場合は既存の
  contains (step 3) や first-word startsWith (step 4) でカバーされる
