長文タイピング練習サイト

GitHub Pages にアップロードする場合は、このフォルダの中身をフォルダ構成ごとアップロードしてください。
index.html だけでなく、css / js / data / docs も同じ階層に置く必要があります。

現在の主な構成:

・index.html …… 画面の骨組み
・css/style.css …… デザイン、レイアウト
・js/modules/ …… 機能別JavaScriptモジュール群（入力、設定、結果、記録など）
・data/index.json …… 読み込む課題ジャンルJSONの一覧
・data/texts/*.json …… ジャンル別の課題文章
・texts.json …… 旧形式との互換用予備データ（自動生成）
・js/modules/00-fallback-texts.js …… 外部JSON読込失敗時の内蔵予備データ（自動生成）
・docs/STRUCTURE.md …… ファイル構成の説明

課題文章を追加する場合:

原則として data/texts/ 内の該当ジャンルJSONへ追加してください。
新しいジャンルを作る場合は、data/index.json にそのJSONファイルを登録してください。
追加後は必ず次を実行してください。

npm run sync:texts
npm test

これにより、data/index.json の件数、texts.json、js/modules/00-fallback-texts.js が同期されます。

注意:

・ローカルで index.html を直接開くと、ブラウザの制限でJSON読み込みに失敗する場合があります。
・GitHub Pages上では通常どおり data/index.json と data/texts/*.json が読み込まれます。
・ファイル名を index(1).html や module(1).js のように変更しないでください。
・GitHubへアップロードするときは、フォルダ構成を崩さないでください。

今回の整理内容:

・旧 script.js 構成を js/modules/ 構成へ整理しました。
・style.css を css/style.css に移動しました。
・index.html の読み込みパスを修正しました。
・docs/STRUCTURE.md を追加しました。
・README.txt を現在の構成に合わせて更新しました。
・data/ 以下の課題文構成は維持しました。
・動作安定を優先し、JavaScript内部の大規模分割は行っていません。

## 今回の整理について

- 以前の `js/modules/` は機能別に `js/modules/` へ分割しました。
- HTML側では番号順にJavaScriptを読み込むようにしています。
- 元の単一ファイル版は `js/legacy/app-single-file-backup.js` に保存しています。
- 今後、結果画面を直す場合は主に `js/modules/60-scoring.js`、詳細設定を直す場合は `js/modules/70-settings-main.js` を見ればよい構成にしています。


【今回の整理で追加したもの】
- package.json: Node.js で簡易テストをまとめて実行するための入口です。
- tools/validate-data.mjs: data/index.json と data/texts/*.json の整合性を確認します。
- tools/sync-text-data.mjs: 課題数、旧形式データ、内蔵予備データをまとめて同期します。
- tools/rebuild-fallback.mjs: sync-text-data.mjs への互換入口です。
- docs/DEVELOPMENT_CHECKLIST.md: 今後の修正時に触るファイルと確認項目をまとめました。

【基本コマンド】
npm test
npm run validate:data
npm run sync:texts

通常の修正では js/modules/ 側を編集し、課題文追加では data/ 側を編集してください。
