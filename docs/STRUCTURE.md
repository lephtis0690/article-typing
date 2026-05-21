# ファイル構成

今後の修正をしやすくするため、役割ごとにファイルを整理しています。

```text
article-typing/
├─ index.html
├─ css/
│  └─ style.css
├─ js/
│  ├─ README.md
│  ├─ modules/
│  │  ├─ 00-state-dom.js
│  │  ├─ 10-texts.js
│  │  ├─ 20-library.js
│  │  ├─ 30-ui-render.js
│  │  ├─ 40-game.js
│  │  ├─ 50-chart.js
│  │  ├─ 60-scoring.js
│  │  └─ 70-settings-main.js
│  └─ legacy/
│     └─ app-single-file-backup.js
├─ data/
│  ├─ index.json
│  └─ texts/
├─ texts.json
├─ docs/
│  └─ STRUCTURE.md
└─ README.txt
```

## 編集方針

- 画面構造を変える場合：`index.html`
- デザインを変える場合：`css/style.css`
- 課題文を追加する場合：`data/texts/` と `data/index.json`
- 結果画面・採点表示を変える場合：主に `js/modules/60-scoring.js`
- CPMグラフを変える場合：`js/modules/50-chart.js`
- 詳細設定や表示モードを変える場合：`js/modules/70-settings-main.js`
- 開始・中断・タイマー・入力処理を変える場合：`js/modules/40-game.js`

## 注意

`index.html` の script タグは読み込み順が重要です。
番号付きファイル名は、その順番を壊さないためのものです。

元の単一ファイル版は `js/legacy/app-single-file-backup.js` に残していますが、通常は編集しません。
