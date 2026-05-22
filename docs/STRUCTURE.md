# 構造メモ

このサイトはPC向け・長文入力訓練向けの静的サイトです。
GitHub Pagesにそのまま配置できるよう、ビルド不要のHTML/CSS/JavaScript構成にしています。

```text
index.html
css/
  style.css
js/
  modules/
    00-fallback-texts.js
    01-state.js
    02-dom.js
    03-storage.js
    04-records.js
    10-texts.js
    20-library.js
    30-ui-render.js
    40-game.js
    50-chart.js
    60-scoring.js
    70-settings-main.js
  legacy/
    app-single-file-backup.js
data/
  index.json
  texts/
    business.json
    food.json
    music.json
    science.json
    society.json
    sports.json
    tourism.json
tests/
  static-check.mjs
  localstorage-check.mjs
  records-check.mjs
  library-records-check.mjs
tools/
  validate-data.mjs
  rebuild-fallback.mjs
package.json
```

## 分割方針

- 状態変数、DOM参照、課題文データを分離し、1ファイルに責任を集中させない。
- 画面表示、ゲーム進行、採点、グラフ、記録保存、設定保存を別ファイルに分ける。
- `index.html` の script 読み込み順に依存しているため、順番を変更する場合は統合確認が必要。

## 修正後に最低限確認する項目

- 開始ボタンで開始できる
- Escキーで開始／中断できる
- ランダム出題が消えていない
- 課題一覧から手動選択できる
- 全文打ち切りで結果画面が出る
- 時間制限終了で結果画面が出る
- 「同じ課題をもう一度」「ランダム課題で再挑戦」で即開始されない
- JSONがすべて読み込める


## 今後の整理方針

ルート直下は `index.html`、`texts.json`、`README.txt`、`package.json` 程度に抑え、実装は `css/`、`js/modules/`、課題文は `data/`、確認用スクリプトは `tests/` と `tools/` に置く。

`texts.json` は旧形式互換の予備ファイルとして残している。通常の課題追加は `data/index.json` と `data/texts/*.json` を編集する。
