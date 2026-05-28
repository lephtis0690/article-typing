# long-type 編集用プロジェクト概要

このファイルは、今後の修正時にどこを見ればよいかを素早く判断するための案内です。

## よく編集する場所

- `index.html`：画面構造、ボタン、モーダル、script / css 読み込み
- `css/style.css`：見た目、余白、カード、モーダル、レスポンシブ表示
- `js/modules/`：人が編集する主要ロジック
- `data/raw-texts/`：課題文章の原稿
- `data/texts/`：カテゴリ別の課題データ
- `tools/`：課題データ同期・検証用スクリプト
- `tests/`：簡易動作確認用スクリプト

## 通常編集しない場所

- `js/generated/fallback-texts.js`：`tools/sync-text-data.mjs` で自動生成される保険用データ
- `texts.json`：互換性維持用の統合データ
- `docs/reports/`：過去の確認結果・整理記録

## 基本手順

課題文章を追加・修正した場合は、次を実行します。

```bash
npm run sync:texts
npm test
```

見た目や機能を修正した場合は、少なくとも次を確認します。

```bash
npm test
```

## 大きな整理方針

- `js/modules/` は機能別に分割し、人が読む対象にする。
- `js/generated/` は自動生成物を置き、人が直接編集しない。
- `tools/` はデータ生成・検証、`tests/` は動作確認に分ける。
- `docs/` は判断記録・整理記録・保守メモを置く。
