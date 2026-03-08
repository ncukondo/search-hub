# Task: Single Binary Distribution via Bun Compile

Closes #136

## Purpose

search-hub は現在 npm 経由のみで配布しており、Node.js 22+ が必要である。
`bun build --compile` を使用してシングルバイナリを生成し、Node.js 不要でインストール・実行できるようにする。
reference-manager と同じアプローチを採用し、既存の npm 配布は並行して維持する（デュアル配布モデル）。

## Related Specs

- [spec/cli/commands.md](../cli/commands.md) - CLI コマンド仕様
- [spec/architecture.md](../architecture.md) - プロジェクト構造

## Related Source Files

- `src/cli/index.ts` - CLI エントリポイント
- `package.json` - ビルド設定・依存関係
- `vite.config.ts` - 現行ビルド設定（Bun は独自にバンドルするため迂回）
- `.github/workflows/release.yml` - 既存リリースワークフロー
- `.github/workflows/publish.yml` - 既存 npm パブリッシュワークフロー

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step 1: Bun 互換性の検証

Bun ランタイムで既存の CLI が動作するか確認する。

- [ ] `bun install` で依存関係がインストールできること
- [ ] `bun src/cli/index.ts --help` で CLI が起動すること
- [ ] 主要コマンド（`query validate`, `search --dry-run`）が動作すること
- [ ] 非互換な依存がある場合は代替案を検討
- [ ] Acceptance: Bun ランタイムで基本的な CLI 操作が動作する

### Step 2: Bun 用エントリポイントの作成

- [ ] Create: `src/cli/entry-bun.ts`
  ```typescript
  import { main } from "./index.js";
  await main(process.argv);
  ```
- [ ] `main()` 関数が `src/cli/index.ts` からエクスポートされていることを確認
  - 必要であれば `src/cli/index.ts` を修正して `main()` をエクスポート
- [ ] `bun src/cli/entry-bun.ts --help` で動作確認
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Bun 用エントリポイント経由で CLI が動作する

### Step 3: ビルドスクリプトの作成

- [ ] Create: `scripts/build-binary.sh`
  - ターゲット: `linux-x64`, `linux-arm64`, `windows-x64`
  - 各ターゲットに対して `bun build --compile --target=bun-<target>` を実行
  - 出力先: `dist/search-hub-<target>`（Windows は `.exe` 付加）
  - 引数でターゲットを指定可能、未指定時は全ターゲットをビルド
- [ ] ローカルで現在のプラットフォーム向けにビルドが成功すること
- [ ] 生成されたバイナリが `--help` で動作すること
- [ ] Acceptance: ビルドスクリプトでシングルバイナリが生成できる

### Step 4: GitHub Actions ワークフローの作成

- [ ] Create: `.github/workflows/release-binary.yml`
  - トリガー: `v*` タグの push、manual dispatch
  - マトリクスビルド: linux-x64, linux-arm64, windows-x64
  - Bun セットアップ (`oven-sh/setup-bun@v2`)
  - `scripts/build-binary.sh` でバイナリビルド
  - GitHub Release にバイナリをアップロード (`softprops/action-gh-release@v2`)
- [ ] ワークフロー YAML の構文チェック
- [ ] Acceptance: ワークフローが正しく定義されている

### Step 5: インストールスクリプトの作成

- [ ] Create: `install.sh`
  - プラットフォーム・アーキテクチャの自動検出
  - GitHub Releases から最新バイナリをダウンロード
  - `~/.local/bin/search-hub` に配置
  - PATH へのヒント表示
- [ ] スクリプトの動作確認（dry-run 的に）
- [ ] Acceptance: `curl ... | sh` で簡単にインストールできる想定

### Step 6: ドキュメント更新

- [ ] `README.md` の Installation セクションを更新
  - npm インストール方法に加え、バイナリダウンロード方法を追記
  - `install.sh` によるワンライナーインストール
  - GitHub Releases へのリンク
- [ ] `spec/cli/commands.md` にバイナリ配布に関する注記（必要に応じて）
- [ ] Acceptance: ユーザーがバイナリでのインストール方法を理解できる

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] ローカルビルドしたバイナリで以下を手動検証:
  - `search-hub --help` が正しく表示される
  - `search-hub --version` が正しいバージョンを返す
  - `search-hub init` でプロジェクト初期化ができる
  - `search-hub query init "test"` でクエリテンプレートが生成される
  - `search-hub query validate` でバリデーションが動作する
- [ ] CI ワークフローの dry-run（手動トリガー）で全ターゲットのビルドが成功すること
- [ ] Run full test suite: `npm test`（既存テストに影響がないこと）
- [ ] Acceptance: All tests pass, binary works in real usage

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- Bun はバンドル時に Vite ビルドを迂回し、TypeScript ソースから直接コンパイルする
- バイナリサイズは 100MB 超になる見込み（Bun ランタイム埋め込みのため）
- macOS バイナリは初回では対象外（必要に応じて後から追加）
- 既存の npm 配布パイプラインには影響を与えない
