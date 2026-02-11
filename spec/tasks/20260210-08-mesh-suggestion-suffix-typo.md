# Task: Improve MeSH Suggestion Accuracy for Suffix Typos

## Purpose

`lookupTerm` のフォールバック戦略が末尾タイポに弱い。"Artificial Intelligencee"（末尾に余分な文字）
に対して正解 "Artificial Intelligence" が候補に出ず、無関係な "Artificial Arm" 等が返される。

### 現状の問題

フォールバック戦略（`src/query/mesh-lookup.ts`）:
1. `exact("Artificial Intelligencee")` → miss
2. `startsWith("Artificial Intelligencee")` → miss（正解はこれで始まらない）
3. `contains("Artificial Intelligencee")` → miss（正解はこの文字列を含まない）
4. 先頭語 `startsWith("Artificial")` → "Artificial Arm" 等がヒット（無関係）

MeSH API の `contains` は「**検索文字列を含む** term」を探すため、入力の方が長い
タイポケースでは機能しない。

### 改善方針

step 2 と step 3 の間に「入力文字列を段階的に短縮した startsWith 検索」を追加する。

"Artificial Intelligencee" → "Artificial Intelligenc" で `startsWith` →
"Artificial Intelligence" がヒット。

## Related Specs

- [spec/tasks/completed/20260210-05-default-vocab-validation-with-cache.md](completed/20260210-05-default-vocab-validation-with-cache.md) - Task #100（フォールバック戦略定義）

## Related Source Files

- `src/query/mesh-lookup.ts` — `MeSHLookupClient.lookupTerm()` のフォールバック戦略
- `src/query/mesh-lookup.test.ts` — 単体テスト

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Add truncated startsWith fallback to `lookupTerm`

`exact` → `startsWith`（全体）の後、`contains` の前に、入力文字列を末尾から1〜3文字
ずつ削った `startsWith` 検索を追加する。

- [x] Write test: `src/query/mesh-lookup.test.ts`
  - 末尾タイポ（"Artificial Intelligencee"）で `startsWith` 短縮版がヒットし
    "Artificial Intelligence" が suggestion に含まれることを検証
  - 元の `startsWith`（全体）でヒットする場合は短縮版が呼ばれないことを検証
  - 短縮版でもヒットしない場合は `contains` にフォールバックすることを検証
  - 3文字以下の入力では短縮を試みないことを検証
- [x] Verify test fails (Red)
- [x] Implement: `lookupTerm` に truncated startsWith ステップを追加
  ```typescript
  // Between step 2 (startsWith full) and step 3 (contains full):
  // 2b. Try startsWith with progressively shorter input (handles suffix typos)
  if (term.length > 3) {
    for (let len = term.length - 1; len >= Math.max(term.length - 3, 3); len--) {
      const truncated = term.slice(0, len);
      const truncatedResults = await this.fetchLookup(truncated, 'startswith', 5);
      if (truncatedResults.length > 0) {
        // return result with suggestions
      }
    }
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: 末尾タイポで正しい MeSH term が suggestion に含まれる

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [x] Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - 末尾タイポの MeSH term で suggestion に正解が含まれることを確認
- [x] Verify all E2E tests pass
- [x] Run full test suite: `npm test`
- [x] **Manual verification**: "Artificial Intelligencee" 等のタイポで validate を実行し suggestion を確認
- [x] Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- 短縮は最大3文字まで（API 呼び出し増加を制限）。これにより lookupTerm あたりの最大 API コール数は
  4 → 7 に増えるが、キャッシュにより2回目以降はゼロ
- 各 `fetchLookup` 呼び出し前に `acquire()` が呼ばれる（Step 1 of Task #100 による修正済み）
- `contains` は NLM API 負荷が高いため、truncated startsWith を先に試行する設計とする
