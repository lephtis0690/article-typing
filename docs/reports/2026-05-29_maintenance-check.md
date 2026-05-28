# 2026-05-29 maintenance check

## 整理内容

- `data/index.json`、`texts.json`、`js/generated/fallback-texts.js` を同期し、課題数を 168 題に統一。
- `docs/reports/` 直下にあった文字化けファイル名の過去レポートを `docs/reports/legacy-encoded/` に移動し、英数字ファイル名へ変更。
- `docs/reports/README.md` を更新し、今後のレポート保存ルールを明記。
- `js/modules/40-game.js` に、計測開始前の入力欄タイトル混入チェックを追加。

## 動作確認

- `npm test`: 成功。
- データ検証: 10 カテゴリ、168 課題で成功。
- ローカル HTTP 配信確認: `index.html`、`data/index.json`、`js/modules/40-game.js`、`js/generated/fallback-texts.js`、`css/style.css` が 200 で取得可能。

## 注意

`validate-data.mjs` の警告として、短めの課題が複数表示されます。これはエラーではなく、短文・初級課題が含まれるためです。
