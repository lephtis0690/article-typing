# js/generated

このフォルダは自動生成された JavaScript を置く場所です。

## ファイル

- `fallback-texts.js`
  - 外部 JSON 読み込みに失敗した場合の保険用課題データです。
  - `tools/sync-text-data.mjs` によって生成されます。
  - 通常は直接編集しません。

## 更新方法

```bash
npm run sync:texts
```
