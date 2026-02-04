# Task: ERIC Phrase Query Error Handling

## Purpose

ERIC APIはフィールド指定なしのフレーズ検索（例: `"generative AI"`）をサポートしていない。
直接クエリ（`--query`オプション）でフレーズ検索を使用するとAPIエラーが返されるが、
現在のエラーメッセージはユーザーにとって理解しにくい。

このタスクでは：
1. ERIC APIの`error`レスポンスを明示的に検出する
2. PhraseQueryエラーに対して具体的な解決策を提示するエラーメッセージを表示する

## Background

ERIC APIの動作：
- `"phrase query"` (全文検索) → エラー: `field "text" was indexed without position data; cannot run PhraseQuery`
- `title:"phrase query"` (フィールド指定) → 正常に動作

YAML経由では翻訳時に自動的に `title:"..." OR description:"..."` 形式に変換されるため問題は発生しない。

## Related Specs

- [spec/providers/eric.md](../providers/eric.md) - ERIC provider specification

## Related Source Files

- `src/providers/eric/parser.ts` - レスポンスバリデーション
- `src/providers/eric/parser.test.ts` - テスト

## Implementation Steps

### Step 1: ERIC APIエラーレスポンスの明示的検出

- [x] Write test: `src/providers/eric/parser.test.ts`
  - `{"error": {"msg": "some error message"}}` 形式のレスポンスに対して適切なProviderErrorがスローされることをテスト
- [x] Verify test fails (Red)
- [x] Implement: `validateSearchResponse`関数に`error`プロパティの検出を追加
  ```typescript
  // 'response' チェックの前に追加
  if (typeof response === 'object' && response !== null && 'error' in response) {
    const errorObj = (response as { error: { msg?: string } }).error;
    throw createProviderError(
      'QUERY_ERROR',
      `ERIC API error: ${errorObj.msg ?? 'Unknown error'}`,
      'eric',
      { retryable: false }
    );
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: エラーレスポンスが適切に検出される

### Step 2: PhraseQueryエラーに対する具体的なエラーメッセージ

- [x] Write test: `src/providers/eric/parser.test.ts`
  - `PhraseQuery`を含むエラーメッセージに対して、フィールド指定の必要性を説明するエラーがスローされることをテスト
- [x] Verify test fails (Red)
- [x] Implement: PhraseQueryエラーを検出して具体的なメッセージを表示
  ```typescript
  if (errorObj.msg?.includes('PhraseQuery')) {
    throw createProviderError(
      'QUERY_ERROR',
      'ERIC does not support phrase queries without field specification. ' +
        'Use field-prefixed queries like: title:"your phrase" OR description:"your phrase". ' +
        'Alternatively, use YAML format which automatically adds field prefixes.',
      'eric',
      { retryable: false }
    );
  }
  ```
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: PhraseQueryエラーに対して解決策が提示される

### Step 3: E2E Integration Test

- [x] Write E2E test: `src/providers/eric/eric.api.test.ts`
  - 実際のERIC APIに対してフレーズ検索を実行し、適切なエラーメッセージが返ることを確認
- [x] Verify E2E test passes
- [x] Run full test suite: `npm test`
- [x] Manual verification:
  ```bash
  node ./dist/cli/index.js search --db eric --query '"generative AI"' --count-only
  ```
  期待される出力: `ERIC does not support phrase queries without field specification...`
- [x] Acceptance: ユーザーフレンドリーなエラーメッセージが表示される

## Expected Behavior

### Before (現状)
```
eric: error: ERIC API error: Unexpected response format (missing 'response' property).
      This may indicate an API change or service issue.
      Response received: {"error":{"msg":"field \"text\" was indexed without position data; cannot run PhraseQuery...
```

### After (改善後)
```
eric: error: ERIC does not support phrase queries without field specification.
      Use field-prefixed queries like: title:"your phrase" OR description:"your phrase".
      Alternatively, use YAML format which automatically adds field prefixes.
```

## Notes

- エラーコードは `QUERY_ERROR` を使用（ユーザーのクエリに問題がある場合）
- `retryable: false` を設定（クエリを修正しない限り再試行しても失敗する）
