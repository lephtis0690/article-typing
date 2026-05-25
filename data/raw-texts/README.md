# raw-texts

このフォルダは、過去に追加作業で使った下書き・元テキストの保管場所です。

サイト本体が読み込む課題データは、`data/texts/*.json` だけです。
このフォルダ内の `.txt` や下書きファイルは、画面の課題一覧には反映されません。

課題を追加するときは、対応するカテゴリの `data/texts/<category>.json` に課題オブジェクトを追加し、次を実行してください。

```bash
npm run sync:texts
npm test
```
