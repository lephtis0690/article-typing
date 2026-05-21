# js フォルダ

この版では、以前の `app.js` を機能別に `js/modules/` へ分割しました。

読み込み順は `index.html` の script タグで固定しています。

- `00-state-dom.js`：状態変数・DOM参照
- `10-texts.js`：課題文読み込み・選択
- `20-library.js`：課題一覧モーダル
- `30-ui-render.js`：表示欄・タイマー・UI補助
- `40-game.js`：開始・中断・入力イベント
- `50-chart.js`：CPMグラフ
- `60-scoring.js`：採点・エラー分類・詳細表示
- `70-settings-main.js`：設定反映・イベント登録・初期化

元の単一ファイル版は `js/legacy/app-single-file-backup.js` に保存しています。
通常の修正では `js/modules/` 側を編集してください。
