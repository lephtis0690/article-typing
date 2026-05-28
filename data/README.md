# data

課題文章データを置くフォルダです。

## 構成

- `raw-texts/`：課題文章の原稿です。
- `texts/`：カテゴリ別に整形された課題データです。
- `index.json`：カテゴリ別の件数や読み込み先を管理します。
- `updates.json`：更新情報です。

## 課題を追加・修正した後

```bash
npm run sync:texts
npm test
```
