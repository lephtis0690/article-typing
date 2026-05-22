# 課題文章管理の方針

## 基本構成

課題文章は次の構成で管理します。

```txt
data/index.json          … ジャンル一覧・読み込み対象ファイルの台帳
data/texts/*.json        … ジャンル別の課題文章本体
js/modules/00-fallback-texts.js … 外部JSONが読めない場合の予備データ
```

通常の読み込みは `data/index.json` → `data/texts/*.json` の順です。`texts.json` は旧形式の予備として残していますが、通常運用では `data/` 配下を正規ルートとします。

## 課題文章１件の管理項目

各課題には、次の管理項目を持たせます。

```json
{
  "id": "clock-history-technology",
  "title": "時計と時間管理の変化",
  "genre": "clock",
  "length": 2512,
  "charCount": 2512,
  "kanjiRate": 41.6,
  "lengthBand": "medium",
  "difficulty": "standard",
  "rhythmType": "stable",
  "hasNumbers": true,
  "hasAlphabet": true,
  "hasBrackets": true,
  "symbolCount": 14,
  "text": "本文"
}
```

## 分類値

### lengthBand

- `short`: ２５００字未満
- `medium`: ２５００字以上３５００字未満
- `long`: ３５００字以上

### difficulty

- `basic`: 基礎（推定難易度 7.0 未満）
- `standard`: 標準（推定難易度 7.0 以上 8.0 未満）
- `advanced`: 発展（推定難易度 8.0 以上）

現在の課題群は長文・競技練習向けの文章が中心であるため、旧基準（4.2 / 7.0）よりも高めの閾値で分類する。

### rhythmType

現在は手入力値ではなく、課題文解析から自動判定する。

- `stable`: 安定型。文字種切替・記号率・英数字率・文長ばらつきが比較的少なく、一定テンポを保ちやすい。
- `mixed`: 変化型。記号・英数字・文長ばらつきなどにより、途中でリズム切替が必要になりやすい。
- `variable`: 将来拡張用。現時点では通常の自動判定では使用しない。

## 追加時の注意

新しい課題文章を追加するときは、次の点を守ります。

1. `data/texts/ジャンル名.json` に本文を追加する。
2. `genre` はファイルのジャンルIDと一致させる。
3. `id` は既存課題と重複させない。
4. `data/index.json` の `count` を実際の件数と一致させる。
5. `js/modules/00-fallback-texts.js` も同期する。
6. 追加後に `node tests/static-check.mjs` を実行する。

## 今後の拡張候補

課題数がさらに増えた場合は、次の項目を追加できます。

- `createdAt`: 追加日
- `updatedAt`: 更新日
- `tags`: 「数字多め」「記号多め」「変換練習向け」など
- `recommendedFor`: 「本番前」「苦手克服」「長文耐久」など
