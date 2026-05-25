# ファイル構成

```txt
index.html                    … 画面本体
css/style.css                 … 画面デザイン
js/modules/                   … 機能別JavaScript
data/index.json               … 課題カテゴリの台帳
data/texts/*.json             … サイトで読み込む課題本文
data/raw-texts/               … 下書き・元テキスト保管場所（サイトでは未使用）
assets/*.mp3                  … 効果音
tests/*.mjs                   … 動作確認・静的確認
tools/sync-text-data.mjs      … 課題データ同期
tools/validate-data.mjs       … 課題データ検査
texts.json                    … 旧形式予備データ（自動生成）
js/modules/00-fallback-texts.js … 内蔵予備データ（自動生成）
```

## 課題追加時の基本手順

```bash
npm run sync:texts
npm test
```

この２つを実行すれば、課題数、旧形式データ、フォールバックデータの反映漏れを検出できます。
