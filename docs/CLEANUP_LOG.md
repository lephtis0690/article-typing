# ファイル整理ログ

- 正規の課題読込ルートを `data/index.json` → `data/texts/*.json` に統一しました。
- 旧形式の `texts.json` にだけ存在していた課題を、ジャンル別JSONへ統合しました。
- `texts.json` は互換用の集約ファイルとして、正規データから再生成しました。
- `js/modules/00-fallback-texts.js` も再生成済みです。

## 今回統合した課題：20件
- `business`: マーケティングと消費行動 (`marketing_facts_01`)
- `history`: 建築の歴史と発展 (`architecture_history_01`)
- `culture`: 服飾とアパレル産業の変化 (`fashion_history_01`)
- `transport`: 交通・鉄道・物流の発展 (`transport_logistics_01`)
- `transport`: 航空技術と空の移動の変化 (`aviation-future-and-transport`)
- `culture`: 現代につながる江戸時代の食習慣 (`edo-food-culture-modern-japan`)
- `finance`: 金融市場と社会の関係 (`16`)
- `technology-geography`: 測量と社会基盤 (`17`)
- `science`: 心理学・認知科学と人間の思考 (`psychology-cognitive-science`)
- `culture`: 言語・文字・翻訳の歴史と役割 (`language-writing-translation`)
- `society`: 統計と人口問題の変化を考える (`statistics-population-issues`)
- `lifestyle`: カバンと日々の持ち運び (`bag-essay`)
- `culture`: 動物園で感じる静かな時間 (`zoo-essay`)
- `lifestyle`: 自転車と日々の移動 (`bicycle_essay_400_001`)
- `society`: 法律の仕組みと暮らし (`law-system-essay`)
- `nature`: 花と季節のうつろい (`flower-essay-400`)
- `nature`: 貝殻と浜辺 (`shell_essay_400_001`)
- `society`: 法律とモラル、マナー (`law_moral_manner_3500`)
- `society`: 日本の統計と国勢調査 (`statistics_census_japan_3500`)
- `nature`: 海そうと海辺の記憶 (`seaweed-essay`)
