# tools

課題データの生成・同期・検証に使うスクリプトを置いています。

## よく使うコマンド

```bash
npm run sync:texts
npm run validate:data
npm test
```

## ファイル

- `sync-text-data.mjs`：`data/texts/`、`data/index.json`、`texts.json`、`js/generated/fallback-texts.js` を同期します。
- `validate-data.mjs`：課題データの件数、ID、分類、本文長などを検証します。
- `rebuild-fallback.mjs`：フォールバックデータを再構築します。
