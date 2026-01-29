新しいタスクファイルを作成してください。

## 引数

$ARGUMENTS: タスク名（例: "custom-theme-support"）

## 手順

1. spec/tasks/ROADMAP.md を確認し、次のタスク番号を決定
2. spec/tasks/_template.md をベースに新しいタスクファイルを作成
   - ファイル名: `spec/tasks/active/YYYYMMDD-NN-$ARGUMENTS.md`
3. 以下の情報を入力:
   - Purpose: タスクの目的
   - Context: 関連仕様、依存タスク、関連ソース
   - Implementation Steps: 実装ステップ（TDD形式）
   - E2E Test: エンドツーエンドテスト
   - Acceptance Criteria: 受け入れ基準
4. ROADMAP.md に新しいタスクを追加

## 出力

作成したタスクファイルのパスと、ROADMAP.mdへの追加内容を報告してください。
