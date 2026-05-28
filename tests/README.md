# tests

このフォルダには、ブラウザを使わずに実行できる簡易チェックを置いています。

## 全体チェック

```bash
npm test
```

## 主な確認内容

- `static-check.mjs`：HTML、script 読み込み、主要ファイルの整合性
- `localstorage-check.mjs`：保存処理の基本確認
- `records-check.mjs`：記録保存・集計処理の確認
- `library-filter-check.mjs`：課題一覧の絞り込み確認
- `record-graph-check.mjs`：記録グラフ関連の確認
- `typing-area-check.mjs`：入力欄・表示欄関連の確認
- `diagnosis-regression-check.mjs`：長文入力診断の退行確認
