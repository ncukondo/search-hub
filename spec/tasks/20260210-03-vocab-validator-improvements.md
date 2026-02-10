# Task: Vocab Validator Improvements (Rate Limit, Timeout, Refactor)

## Purpose

PR #102 のレビューで指摘された5件の改善事項をすべて対応する。
いずれも non-blocking だが、プロダクション品質のために対処が必要。

### 指摘事項

1. **Code duplication** — `validateVocabCommand` が `validateQueryCommand` のファイル読み込み・YAMLパース・エラーハンドリングを重複している。共通化する。
2. **Exit code** — 無効なMeSH用語が見つかった場合も exit code が 0 のまま。`--vocab` 使用時に無効な用語があれば非ゼロ終了コードを返す。
3. **Rate limiting** — `MeSHLookupClient` が既存の `RateLimiter`（トークンバケット）を使っていない。DI で `RateLimiter` を注入し、各 `lookupTerm` 前に `acquire()` する。
4. **Fetch timeout** — `fetch()` に `AbortSignal.timeout()` がなく、NLM APIが無応答だとハングする。10秒のタイムアウトを追加。
5. **Duplicated mock client** — テスト用 `createMockMeSHClient` が3ファイルで重複。共通テストヘルパーに抽出。

## Related Specs

- [spec/tasks/completed/20260210-02-validate-controlled-vocabulary.md](completed/20260210-02-validate-controlled-vocabulary.md) - 元タスク

## Related Source Files

- `src/query/mesh-lookup.ts` — MeSH Lookup APIクライアント（#3, #4 対応）
- `src/query/mesh-lookup.test.ts` — 単体テスト
- `src/query/vocab-validator.ts` — 統制語バリデータ
- `src/query/vocab-validator.test.ts` — 単体テスト
- `src/cli/commands/query/validate.ts` — CLIコマンド（#1, #2 対応）
- `src/cli/commands/query/validate.test.ts` — CLIテスト
- `src/cli/commands/query/validate.e2e.test.ts` — E2Eテスト（#5 対応）
- `src/cli/index.ts` — CLIオプション定義
- `src/providers/base/rate-limiter.ts` — 既存 `RateLimiter`（#3 で再利用）

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Add `RateLimiter` to `MeSHLookupClient`

- [x]Write test: `src/query/mesh-lookup.test.ts`
  - `RateLimiter.acquire()` が各 `lookupTerm` 呼び出し前に呼ばれることを検証
  - `RateLimiter` 未指定時はレート制限なしで動作する（後方互換）
- [x]Verify test fails (Red)
- [x]Implement: コンストラクタに `RateLimiter` をオプショナルで受け取り、`lookupTerm` 内で `acquire()` を呼ぶ
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Refactor if needed
- [x]Verify test still passes
- [x]Acceptance: NLM APIへのリクエストが `RateLimiter` でレート制御される

### Step 2: Add fetch timeout with `AbortSignal`

- [x]Write test: `src/query/mesh-lookup.test.ts`
  - タイムアウト時に `status: 'error'` が返ることを検証
  - デフォルトタイムアウト値（10秒）の確認
- [x]Verify test fails (Red)
- [x]Implement: `fetch()` に `{ signal: AbortSignal.timeout(timeoutMs) }` を追加
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Refactor if needed
- [x]Verify test still passes
- [x]Acceptance: 無応答APIがタイムアウト後に適切なエラーを返す

### Step 3: Refactor `validateVocabCommand` to reuse `validateQueryCommand`

- [x]Write test: `src/cli/commands/query/validate.test.ts`
  - リファクタ後も全既存テストがパスすることを確認
  - 構文エラー時に vocab チェックがスキップされることを確認
- [x]Verify test fails (Red) — or confirm existing tests cover the behavior
- [x]Implement: `validateVocabCommand` を `validateQueryCommand` の結果を利用する形にリファクタ
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Refactor if needed
- [x]Verify test still passes
- [x]Acceptance: ファイル読み込み・パースの重複コードが排除される

### Step 4: Non-zero exit code on invalid vocab terms

- [x]Write test: `src/cli/commands/query/validate.test.ts`
  - `--vocab` で無効な用語がある場合、終了コードが非ゼロ
  - 全用語が有効な場合は終了コード 0
  - `status: 'error'`（API エラー）は非ゼロにしない（警告のみ）
- [x]Verify test fails (Red)
- [x]Implement: `result.termResults` に `not_found` がある場合に適切な終了コードを返す
- [x]Verify test passes (Green)
- [x]Run `npm run lint && npm run typecheck`
- [x]Refactor if needed
- [x]Verify test still passes
- [x]Acceptance: CI で `query validate --vocab` を使って無効な用語を検出できる

### Step 5: Extract shared mock client helper

- [x]Identify duplicated `createMockMeSHClient` / `createMockClient` patterns
- [x]Create shared helper: `src/query/__test-helpers__/mock-mesh-client.ts`
- [x]Update all 3 test files to import from shared helper
- [x]Run `npm run lint && npm run typecheck`
- [x]Verify all tests still pass
- [x]Acceptance: モッククライアントのコードが一箇所に集約される

### Final Step: E2E Integration Tests (MANDATORY)

- [x]Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - `--vocab` で無効な用語がある場合の終了コードを検証
  - タイムアウト動作の検証（モック使用可）
  - 既存のE2Eテストが壊れていないことを確認
- [x]Verify all E2E tests pass
- [x]Run full test suite: `npm test`
- [x]Acceptance: All tests pass, feature works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- E2E integration tests are critical - Mock-based unit tests often miss real-world issues
- `RateLimiter` は `src/providers/base/rate-limiter.ts` の既存実装を再利用する
- NLM MeSH Lookup API は認証不要だが、礼儀としてレート制限を設ける（3 req/s 程度）
- `AbortSignal.timeout()` は Node.js 17.3+ / ブラウザ対応済み
