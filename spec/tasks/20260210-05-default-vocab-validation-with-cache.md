# Task: Default Vocab Validation with File-Based Cache

## Purpose

`query validate --vocab` は統制語（MeSH 等）の妥当性チェックを行うが、明示的なフラグが必要で
ユーザーが忘れがちである。統制語を含むクエリでは vocab チェックを**デフォルトで自動実行**し、
繰り返し実行時の API コール重複を**ファイルベースキャッシュ**で解消する。

### 変更概要

1. **デフォルト化** — クエリに統制語（mesh/emtree/eric）が含まれる場合、`query validate` で
   自動的に vocab チェックを実行する。`--no-vocab` で明示スキップ可能。
2. **ファイルベースキャッシュ** — MeSH Lookup 結果をディスクに永続化し、同一用語への
   重複 API コールを防ぐ。TTL 30 日。`--no-cache` で無視可能。
3. **Rate limit 修正** — `lookupTerm` が `acquire()` 1回で `fetchLookup` を最大2回呼ぶ
   バグを修正し、HTTP リクエスト単位で rate limit を適用する。
4. **ファジーサジェスチョン** — `lookupTerm` の `startsWith` フォールバックがタイプミスや
   複数形でヒットしない。`contains` マッチや先頭N単語での `startsWith` 等、追加の
   フォールバック戦略を実装してサジェスチョンの精度を向上させる。
5. **API エラー時の graceful degradation** — ネットワークエラー・タイムアウト時は警告のみ
   表示し、validate 自体は成功扱いとする。
6. **`--vocab` フラグ廃止** — `--vocab` は受け付けるが無視する（後方互換）。

## Related Specs

- [spec/tasks/completed/20260210-02-validate-controlled-vocabulary.md](completed/20260210-02-validate-controlled-vocabulary.md) - 元タスク
- [spec/tasks/completed/20260210-03-vocab-validator-improvements.md](completed/20260210-03-vocab-validator-improvements.md) - Rate limit/timeout 改善

## Related Source Files

- `src/query/mesh-lookup.ts` — MeSH Lookup API クライアント（#3 rate limit 修正）
- `src/query/mesh-lookup.test.ts` — 単体テスト
- `src/query/vocab-validator.ts` — 統制語バリデータ
- `src/query/vocab-validator.test.ts` — 単体テスト
- `src/query/vocab-cache.ts` (new) — ファイルベースキャッシュ
- `src/query/vocab-cache.test.ts` (new) — キャッシュテスト
- `src/cli/commands/query/validate.ts` — CLI validate コマンド（#1, #4, #5 対応）
- `src/cli/commands/query/validate.test.ts` — 単体テスト
- `src/cli/commands/query/validate.e2e.test.ts` — E2E テスト
- `src/cli/index.ts` — CLI コマンド定義（`--no-vocab`, `--no-cache` 追加）
- `src/config/paths.ts` — `getConfigDir()` でキャッシュディレクトリ決定
- `src/providers/base/rate-limiter.ts` — 既存 `RateLimiter`

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Fix rate limit accounting in `MeSHLookupClient`

現状 `lookupTerm` は `acquire()` を1回呼ぶが `fetchLookup` を最大2回（exact + startswith）
呼ぶため、rate limit を超過する可能性がある。`acquire()` を `fetchLookup` 呼び出し前に
移動し、HTTP リクエスト単位で rate limit を適用する。

- [ ] Write test: `src/query/mesh-lookup.test.ts`
  - `lookupTerm` で term が見つからない場合（exact miss → startswith）、`acquire()` が2回呼ばれることを検証
  - term が見つかる場合（exact hit のみ）、`acquire()` が1回呼ばれることを検証
- [ ] Verify test fails (Red)
- [ ] Implement: `acquire()` を `lookupTerm` から `fetchLookup` の各呼び出し前に移動
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: HTTP リクエスト単位で rate limit が正しく適用される

### Step 2: Improve `lookupTerm` fuzzy suggestion strategy

現状の `lookupTerm` は `exact` → `startsWith`（用語全体）のみ。
タイプミスや複数形でサジェスチョンが返らない。追加のフォールバック戦略を実装する。

戦略（順に試行、最初にヒットしたものを採用）：
1. `exact` — 完全一致 → `found: true`
2. `startsWith`（用語全体）— 現状通り
3. `contains`（用語全体）— 部分一致で候補を探す
4. `startsWith`（先頭N単語）— 複数語の用語で末尾が違う場合に対応

※ 各フォールバックは個別に `acquire()` を呼ぶ（Step 1 の修正による）。

- [ ] Write test: `src/query/mesh-lookup.test.ts`
  - タイプミス（例: "Artificial Intelligense"）で `contains` 経由のサジェスチョンが返ることを検証
  - 複数形（例: "Drug Therapies"）で `startsWith`（先頭語）経由のサジェスチョンが返ることを検証
  - 完全一致時は従来通り `found: true`、追加 API コールなし
  - `startsWith`（全体）で見つかる場合は従来通り `contains` は呼ばない
  - 全フォールバックでヒットしない場合は `found: false, suggestions: undefined`
- [ ] Verify test fails (Red)
- [ ] Implement: `lookupTerm` にフォールバック戦略を追加
  - `contains`: NLM API の `match=contains` を使用、`limit=5`
  - 先頭N単語: 用語をスペースで分割し先頭1〜2語で `match=startswith`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: タイプミス・複数形・表記揺れに対してサジェスチョンが返る

### Step 3: Create file-based vocab cache

`~/.config/search-hub/cache/vocab-lookup.json` にルックアップ結果をキャッシュする。
キャッシュキーは `{vocabulary}:{term}`（例: `mesh:Diabetes Mellitus`）。

- [ ] Write test: `src/query/vocab-cache.test.ts`
  - `get(vocabulary, term)` — キャッシュヒット時に結果を返す
  - `get(vocabulary, term)` — キャッシュミス時に `undefined` を返す
  - `get(vocabulary, term)` — TTL 超過時に `undefined` を返す
  - `set(vocabulary, term, result)` — 結果をキャッシュに保存
  - `load()` / `save()` — ファイルからの読み書き
  - ファイルが存在しない場合は空キャッシュで初期化
  - 破損した JSON は無視して空キャッシュで再初期化
- [ ] Verify test fails (Red)
- [ ] Create `src/query/vocab-cache.ts`
  ```typescript
  interface VocabCacheEntry {
    result: MeSHLookupResult;
    cachedAt: number;       // Unix ms
  }
  // cache key format: "{vocabulary}:{term}"
  type VocabCacheStore = Record<string, VocabCacheEntry>;

  class VocabCache {
    constructor(options?: { cachePath?: string; ttlMs?: number });
    async load(): Promise<void>;
    async save(): Promise<void>;
    get(vocabulary: string, term: string): MeSHLookupResult | undefined;
    set(vocabulary: string, term: string, result: MeSHLookupResult): void;
  }
  ```
  - デフォルト `cachePath`: `path.join(getConfigDir(), 'cache', 'vocab-lookup.json')`
  - デフォルト `ttlMs`: 30日 (30 * 24 * 60 * 60 * 1000)
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: キャッシュの読み書きが正しく動作する

### Step 4: Integrate cache into `MeSHLookupClient`

`MeSHLookupClient` にオプショナルな `VocabCache` を DI で注入し、
`lookupTerm` でキャッシュヒット時は API コールをスキップする。

- [ ] Write test: `src/query/mesh-lookup.test.ts`
  - キャッシュヒット時に `fetchLookup` が呼ばれないことを検証
  - キャッシュミス時に API を呼び、結果がキャッシュに書き込まれることを検証
  - キャッシュなし（undefined）の場合は従来通り動作
- [ ] Verify test fails (Red)
- [ ] Implement: `MeSHLookupClient` のコンストラクタに `cache?: VocabCache` を追加
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: キャッシュヒット時は API 呼び出しゼロ

### Step 5: Make vocab validation default when controlled vocab terms exist

`query validate` で AST に統制語が含まれる場合、自動的に vocab チェックを実行する。
`--no-vocab` で明示スキップ。`--vocab` は後方互換のため受け付けるが無視。

- [ ] Write test: `src/cli/commands/query/validate.test.ts`
  - MeSH 用語を含むクエリで `vocabResult` が自動的に返ることを検証
  - キーワードのみのクエリで `vocabResult` が `undefined` であることを検証
  - `--no-vocab` 指定時に MeSH 用語があっても `vocabResult` が `undefined` であることを検証
- [ ] Verify test fails (Red)
- [ ] Implement:
  - `validateQueryCommand` を拡張: AST に統制語がある場合は `validateControlledVocab` も実行
  - `validateVocabCommand` は `validateQueryCommand` に統合（不要になる）
  - CLI 側: `--no-vocab` オプション追加、`--vocab` は互換性のため残すが動作に影響しない
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: 統制語を含むクエリで validate 時に自動的に vocab チェックが走る

### Step 6: Graceful degradation on API errors

ネットワークエラー・タイムアウト時は警告メッセージを表示し、validate 自体は
成功扱い（exit code 0）とする。vocab チェック部分のみスキップされたことを明示する。

- [ ] Write test: `src/cli/commands/query/validate.test.ts`
  - API エラー時に `result.success === true` であることを検証
  - API エラー時に警告メッセージが含まれることを検証
  - API エラー時の exit code が 0 であることを検証
  - 一部の用語が API エラー、残りが正常な場合のハイブリッド結果を検証
- [ ] Verify test fails (Red)
- [ ] Implement: vocab validation のエラーハンドリングを調整
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: オフライン環境でも `query validate` が正常終了する

### Step 7: Wire CLI options and cache lifecycle

`src/cli/index.ts` で `--no-vocab`, `--no-cache` オプションを追加し、
`VocabCache` のライフサイクル（load → validate → save）を組み込む。

- [ ] Write test: CLI integration test
  - `--no-cache` 指定時にキャッシュが使われないことを検証
  - キャッシュファイルが自動的に作成されることを検証
- [ ] Verify test fails (Red)
- [ ] Implement: CLI コマンド定義を更新
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: CLI から全機能が正しく動作する

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Update E2E test: `src/cli/commands/query/validate.e2e.test.ts`
  - `query validate` で MeSH 用語を含むクエリが自動チェックされることを確認
  - `--no-vocab` でスキップされることを確認
  - キャッシュファイルが作成・利用されることを確認
  - API エラー時の graceful degradation を確認
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test the feature manually as a user would
- [ ] Acceptance: All tests pass, feature works in real usage

## Architecture

```
query validate search.yaml
  │
  ├─ YAML 構文検証 (常に実行)
  │
  ├─ 統制語あり? ──No──→ 終了（現状通り）
  │     │
  │    Yes
  │     │
  │  --no-vocab? ──Yes──→ 終了（スキップ）
  │     │
  │    No
  │     ▼
  ├─ VocabCache.load() (ファイル読み込み)
  │
  ├─ 各用語について:
  │     │
  │     ├─ キャッシュヒット (TTL 内) → 結果を即返却
  │     │
  │     └─ キャッシュミス → lookupTerm() フォールバック:
  │           1. acquire() → exact match
  │           2. acquire() → startsWith (全体)
  │           3. acquire() → contains (全体)
  │           4. acquire() → startsWith (先頭N単語)
  │           ※ 各段階でヒットしたら残りはスキップ
  │           → VocabCache.set()
  │
  ├─ VocabCache.save() (ファイル書き込み)
  │
  └─ 結果フォーマット・表示
       ├─ ✓ 有効な用語 / ✗ 無効な用語 (+ サジェスチョン)
       └─ API エラーは警告のみ (exit code 0)
```

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- キャッシュキーに vocabulary を含めることで、将来 ERIC/Emtree 等が追加されても対応可能
- MeSH は年1回更新のため TTL 30 日は十分に安全
- `--vocab` フラグは後方互換のため残すが、ドキュメント・ヘルプからは削除
- このタスクにより旧タスク #99 (Vocab Suggestion Improvements) は廃止・統合
- `contains` は NLM API の負荷が上がるため、`startsWith` で見つからなかった場合のみ試行
- サジェスチョンは最大5件に制限する（NLM API の `limit` パラメータ）
- ファジーサジェスチョンにより `lookupTerm` あたりの API コールが最大4回に増えるが、
  キャッシュにより2回目以降はゼロ、rate limit 修正により各コールが正しく制御される
