# 修正時チェックリスト

## 触るファイルの目安

- 画面の部品やIDを変える: `index.html`、`js/modules/02-dom.js`
- 色、余白、カード、表示崩れ: `css/style.css`
- 課題文の追加・分類: `data/index.json`、`data/texts/*.json`
- 課題一覧・絞り込み: `js/modules/20-library.js`
- 表示欄、進捗、集中表示: `js/modules/30-ui-render.js`
- 開始、中断、入力処理: `js/modules/40-game.js`
- 結果画面、採点、ミス分析: `js/modules/60-scoring.js`
- 記録保存、自己ベスト、履歴: `js/modules/04-records.js`
- 設定保存: `js/modules/03-storage.js`、`js/modules/70-settings-main.js`

## 修正後に実行する確認

```bash
npm test
```

Node.js が使えない環境では、少なくとも次をブラウザで確認する。

1. ランダム課題で開始できる。
2. 課題一覧から手動選択できる。
3. Esc キーで開始・中断できる。
4. 入力完了後に結果画面が出る。
5. 記録画面に履歴が残る。
6. 「同じ課題をもう一度」「ランダム課題で再挑戦」で即開始されない。

## 課題文追加時の流れ

1. `data/texts/` にジャンル別JSONを追加または追記する。
2. 新ジャンルなら `data/index.json` にカテゴリを追加する。
3. `count` を実件数に合わせる。
4. `npm run validate:data` を実行する。
5. 必要に応じて `npm run rebuild:fallback` を実行する。
