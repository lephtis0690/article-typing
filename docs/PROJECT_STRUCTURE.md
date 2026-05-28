# プロジェクト構成メモ

このプロジェクトは、改良や修正をしやすいように、用途別にファイルを分けています。

## 主要ファイル

- `index.html`  
  サイト本体のHTMLです。
- `css/style.css`  
  画面全体のスタイルです。
- `js/modules/`  
  機能別に分けたJavaScriptです。
- `data/index.json`  
  課題カテゴリ一覧と件数を管理します。
- `data/texts/*.json`  
  実際にサイトで読み込む課題文章データです。
- `data/raw-texts/`  
  追加前・確認用の元文章置き場です。
- `tools/`  
  課題データ同期、フォールバック生成、検証用スクリプトです。
- `tests/`  
  主要機能の簡易チェック用スクリプトです。
- `docs/`  
  管理メモ、整理レポート、開発時の注意点を置きます。

## 整理方針

- サイト動作に直接必要なファイルは、ルート直下・`css`・`js`・`data`・`assets` に置きます。
- レポートや作業メモは `docs/reports/` に置きます。
- テスト実行メモは `docs/release-notes/` に置きます。
- ルート直下に残すファイルは、原則として `index.html`、`README.txt`、`package.json`、`texts.json`、`.zipignore`、`favicon.ico` です。

## よく使うコマンド

```bash
npm test
npm run sync:texts
npm run validate:data
```

## 注意

`tools/validate-data.mjs` の警告は、主に「長文課題として短い可能性がある」課題を知らせるものです。終了コードが 0 であれば、データ検証自体は通っています。
