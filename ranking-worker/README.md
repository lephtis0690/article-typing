# チャレンジランキング API（Cloudflare Workers + D1）

チャレンジモードのオンラインランキングを受け付けるサーバー側のプログラムです。
無料プランの範囲で動きます（Workers：1日10万リクエスト、D1：1日の書き込み10万行まで）。

## 仕組み

- 結果画面の「ランキングに登録」を押すと、ブラウザが「入力した文字列」と「入力文字数の推移」を送ります。
- サーバーは送られた純字数を信用せず、入力文字列から採点し直します（ブラウザと同じ採点方法）。
- 次のいずれかに当てはまる記録は受け付けません。
  - 制限時間まで打ち切っていない／失格（エラー10件以上）
  - 平均速度が毎分500文字を超える
  - 1回の確定で51文字以上増えている（貼り付けのような入力）
  - 任意の5秒間で61文字以上増えている
  - 入力の間隔が機械的に一定
- 同じブラウザからの登録は1期間1件です。より良い記録のときだけ上書きし、名前は毎回の登録で更新します。
- 登録回数の制限はありません（ボタンの二度押し対策として、同じブラウザから20秒以内の連続送信だけ断ります。1回の挑戦は1分以上かかるので、通常の利用には影響しません）。
- 課題文章と開催スケジュールは、公開中のサイトから読み込みます。課題を切り替えるときは、サイトの `data/challenge/schedule.json` を更新するだけで済み、このプログラムを公開し直す必要はありません。

## 初回の準備（1回だけ）

必要なもの：Node.js、Cloudflare のアカウント（無料プラン）

先にサイト側（`data/challenge/schedule.json` を含む今回の版）を GitHub Pages に公開しておいてください。サーバーはサイトから課題を読み込むためです。

ターミナルで、このフォルダに移動してから順に実行します。

```bash
cd ranking-worker
npm install
npx wrangler login
```

`wrangler login` を実行するとブラウザが開くので、Cloudflare にログインして「Allow」を押します。

### データベースを作る

```bash
npx wrangler d1 create long-type-ranking
```

表示された内容の中に `database_id = "xxxxxxxx-xxxx-..."` という行があります。
この値を `wrangler.toml` の `database_id = "ここにdatabase_idを貼り付け"` の部分に貼り付けます。

### サイトのURLを設定する

`wrangler.toml` の次の2行を、自分のサイトに合わせて書き換えます。

```toml
SITE_BASE_URL = "https://YOUR-NAME.github.io/long-type/"   # サイトのURL（最後の / まで）
ALLOWED_ORIGINS = "https://YOUR-NAME.github.io"            # ドメイン部分だけ（最後の / なし）
```

独自ドメインを使っている場合は、そのドメインを書きます。

### 表を作って公開する

```bash
npm run db:migrate:remote
npm run deploy
```

`deploy` が終わると、`https://long-type-ranking.＜アカウント名＞.workers.dev` のようなURLが表示されます。
ブラウザで `そのURL/api/health` を開き、`{"ok":true}` と出れば成功です。

### サイトとつなぐ

サイト側の `js/ranking-config.js` に、表示されたURLを入れます。

```js
const RANKING_API_BASE = 'https://long-type-ranking.＜アカウント名＞.workers.dev';
```

これを GitHub にアップロードすると、チャレンジ画面にランキングが、結果画面に「ランキングに登録」が表示されます。

## 運用

すべて `ranking-worker` フォルダで実行します。

### ランキングを確認する

```bash
npx wrangler d1 execute long-type-ranking --remote --command "SELECT name, net, error_total, achieved_at FROM entries WHERE challenge_id = '2026-w41' AND hidden = 0 ORDER BY net DESC, error_total ASC, achieved_at ASC LIMIT 50"
```

### 不適切な登録を隠す／元に戻す

```bash
npx wrangler d1 execute long-type-ranking --remote --command "UPDATE entries SET hidden = 1 WHERE challenge_id = '2026-w41' AND name = '隠したい名前'"
npx wrangler d1 execute long-type-ranking --remote --command "UPDATE entries SET hidden = 0 WHERE challenge_id = '2026-w41' AND name = '戻したい名前'"
```

隠した登録はランキングに表示されず、順位の計算にも含まれません。

### 受け付けなかった登録の内訳を見る

速度判定が厳しすぎないかを確認するときに使います。

```bash
npx wrangler d1 execute long-type-ranking --remote --command "SELECT code, COUNT(*) AS count FROM submissions GROUP BY code ORDER BY count DESC"
```

`code` の意味：`improved`／`kept`＝受け付け（記録更新／記録そのまま）、`too_fast`＝平均速度、`burst`＝一括入力・短時間の集中、`mechanical`＝一定間隔、`disqualified`＝失格、`not_finished`＝打ち切りでない、`bad_log`＝送信データの不整合。

### 速度判定の基準を変える

`wrangler.toml` の `[vars]` にある `MAX_CPM`（毎分の上限）などを書き換えて、`npm run deploy` を実行します。

### 禁止語を追加する

`src/validate.js` の `NG_WORDS` に追加して、`npm run deploy` を実行します。

### 採点方法を変えるとき

サイト側の `js/modules/60-scoring.js` を変えたら、`src/scoring.js` も同じように直し、サイト側で `npm test` を実行します。
両者の結果が食い違うとテストが失敗するので、直し忘れに気づけます。

## 手元で動かす（開発用・任意）

```bash
npm run db:migrate:local
npx wrangler dev --var SITE_BASE_URL:http://localhost:8000/ --var ALLOWED_ORIGINS:http://localhost:8000
```

サイトは別のターミナルで `python3 -m http.server 8000` などで公開し、`js/ranking-config.js` を一時的に `http://127.0.0.1:8787` にします。
