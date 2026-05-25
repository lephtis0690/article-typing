# 課題文章管理の方針

## 正規の読み込みルート

課題文章の正規データは、次の３層で管理します。

```txt
data/index.json                 … ジャンル一覧・読み込み対象ファイルの台帳
data/texts/*.json               … ジャンル別の課題文章本体
texts.json                      … 旧形式用の予備データ（自動生成）
js/modules/00-fallback-texts.js  … 外部JSONが読めない場合の内蔵予備データ（自動生成）
```

通常の画面表示は `data/index.json` → `data/texts/*.json` を読み込みます。  
`texts.json` と `js/modules/00-fallback-texts.js` は、手で編集せず、必ず同期スクリプトで再生成します。

## 編集する場所

新しい課題文章を追加するときに手で編集するのは、基本的に次のどれか１つです。

```txt
data/texts/society.json
data/texts/science.json
data/texts/history.json
...
```

`data/texts/` には、カテゴリJSONだけを置きます。`.txt` の下書きや一時ファイルは置きません。
下書き・元テキストは `data/raw-texts/` に保管します。ただし、このフォルダ内のファイルはサイトには反映されません。

## 追加後に必ず実行するコマンド

課題を追加・削除・移動した後は、次の順に実行します。

```bash
npm run sync:texts
npm test
```

`npm run sync:texts` は次を自動で行います。

- `data/index.json` の件数を実データに合わせる
- `texts.json` を再生成する
- `js/modules/00-fallback-texts.js` を再生成する

`npm test` では、件数の不一致、重複ID、参照漏れ、未参照JSON、フォールバック未同期などを確認します。以前起きた「テストは通ったが、課題数が画面に反映されない」問題を防ぐため、現在は件数不一致を警告ではなくエラーとして扱います。

## 課題文章１件の基本形

```json
{
  "id": "example-topic-001",
  "title": "課題タイトル",
  "genre": "society",
  "length": 1500,
  "charCount": 1500,
  "kanjiRate": 30.0,
  "lengthBand": "under-2000",
  "difficulty": "standard",
  "rhythmType": "stable",
  "hasNumbers": true,
  "hasAlphabet": false,
  "hasBrackets": true,
  "symbolCount": 20,
  "text": "本文"
}
```

最低限必要なのは `id`、`title`、`genre`、`text` です。その他の分析値は画面側で自動算出できますが、一覧の管理を安定させるため、既存データでは持たせています。

## 追加時の注意

1. `id` は全課題で重複させない。
2. `genre` は追加先ファイルのカテゴリIDと一致させる。
3. `data/index.json` の `count`、`texts.json`、`00-fallback-texts.js` は手で直さない。
4. 追加後は必ず `npm run sync:texts` を実行する。
5. 最後に `npm test` を実行し、課題数が `OK: 24 categories, ○○ texts` と表示されることを確認する。

## 今回整理した点

- `data/texts/` から `.txt` や未参照の壊れたJSONを移動し、カテゴリJSONだけに整理しました。
- 下書き類は `data/raw-texts/` に移しました。
- `tools/sync-text-data.mjs` を追加し、件数・旧形式・フォールバックを一括同期できるようにしました。
- `tools/validate-data.mjs` を強化し、件数不一致や未参照JSONをエラーとして検出するようにしました。
