# js フォルダ

この版では、巨大な単一 `script.js` 相当の処理を、役割別に `js/modules/` へ分割しています。
読み込み順は `index.html` の script タグで固定しています。

## 読み込み順と役割

1. `../generated/fallback-texts.js`：外部JSON読込失敗時の保険用課題文（自動生成・通常編集しない）
2. `01-state.js`：アプリ全体の状態変数
3. `02-dom.js`：DOM参照の集中管理
4. `05-utils.js`：HTML安全化処理・表示ラベルなどの共通ユーティリティ
5. `10-texts.js`：課題文読み込み・ランダム／手動選択
6. `20-library.js`：課題一覧モーダル
7. `30-ui-render.js`：表示欄・タイマー・UI補助
8. `50-chart.js`：CPMグラフ
9. `60-scoring.js`：採点・エラー分類・詳細表示
10. `40-game.js`：開始・中断・入力イベント
11. `70-settings-main.js`：設定反映・イベント登録・初期化

## 修正時の目安

- HTMLのIDを変える場合：まず `02-dom.js` を確認
- 表示ラベルやHTMLエスケープ：`05-utils.js`
- 課題文の読込やランダム出題：`10-texts.js`
- 結果画面や採点：`60-scoring.js` と `40-game.js`
- 表示欄、進捗、色変更：`30-ui-render.js`
- CPMグラフ：`50-chart.js`
- 初期化、設定変更イベント：`70-settings-main.js`

## 簡易チェック

Node.js が使える環境では、次を実行すると script 読込、DOM参照、JSON構造を確認できます。

```bash
node tests/static-check.mjs
```

通常の修正では `js/modules/` 側を編集してください。
自動生成ファイルは `js/generated/` に分離しています。
