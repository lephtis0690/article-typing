// サーバー側の採点（ranking-worker/src/scoring.js）が、ブラウザ側（60-scoring.js / 10-texts.js）と
// 同じ結果になることを確認する。どちらかの採点ルールを変えたのに片方を直し忘れると、このテストが失敗する。
import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { scoreInput, buildTypingTarget } from '../ranking-worker/src/scoring.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// --- ブラウザ側の採点関数を読み込む（DOM部分は使わない） ---
const scoringContext = { console, escapeHtml: v => String(v) };
vm.createContext(scoringContext);
vm.runInContext(read('js/modules/60-scoring.js'), scoringContext, { filename: '60-scoring.js' });

function browserScore(target, input, disqualifyLimit) {
  const effective = scoringContext.computeEffectiveTarget(target, input);
  const { counts } = scoringContext.classifyErrors(effective, input);
  const errorTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const isDisqualified = errorTotal >= disqualifyLimit;
  const net = isDisqualified ? 0 : Math.max(0, input.length - errorTotal * 10);
  const accuracy = input.length > 0 ? Math.round((Math.max(0, input.length - errorTotal) / input.length) * 100) : 0;
  return { errorTotal, net, isDisqualified, accuracy };
}

// --- ブラウザ側で入力対象の本文を作る処理（applySelectedText）を読み込む ---
const textsContext = {
  console,
  TEXTS_FALLBACK: [],
  gameState: { texts: { items: [], selectionMode: 'manual' }, session: { running: true }, countdown: { active: false } },
  document: { getElementById: () => null },
  taskTitle: null,
  typingArea: { value: '' },
  resultScreen: { style: {} }
};
vm.createContext(textsContext);
vm.runInContext(read('js/modules/10-texts.js'), textsContext, { filename: '10-texts.js' });

function browserTarget(item) {
  textsContext.gameState.texts.items = [item];
  textsContext.applySelectedText(item.id);
  return textsContext.gameState.texts.currentText;
}

// --- 全課題で本文の作り方が一致すること ---
const allTexts = [];
for (const category of JSON.parse(read('data/index.json'))) {
  for (const item of JSON.parse(read(category.file))) allTexts.push(item);
}
for (const item of allTexts) {
  assert.equal(buildTypingTarget(item), browserTarget(item), `入力対象の本文がブラウザと一致しません: ${item.id}`);
}

// --- ランダムな誤り入りの入力で採点が一致すること ---
let seed = 20261004;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (s) => s[Math.floor(rand() * s.length)];
const NOISE = ['あ', 'い', 'x', '１', '1', 'Ａ', 'A', '、', '，', '。', '．', ' ', '　', '\n', '\t', '！', '!'];
function mutate(target, length) {
  const chars = [...target.slice(0, length)];
  const out = [];
  for (const ch of chars) {
    const r = rand();
    if (r < 0.03) continue;                        // 脱字
    if (r < 0.06) { out.push(pick(NOISE)); continue; } // 誤字・全角半角・句読点違い
    out.push(ch);
    if (r > 0.97) out.push(pick(NOISE));            // 余字・余分な空白・改行
  }
  return out.join('');
}

const scheduleIds = JSON.parse(read('data/challenge/schedule.json')).challenges.map(c => c.textId);
const samples = [...new Set([...scheduleIds, ...allTexts.filter((_, i) => i % 7 === 0).map(t => t.id)])];
let cases = 0;
for (const id of samples) {
  const item = allTexts.find(t => t.id === id);
  const target = buildTypingTarget(item);
  for (let k = 0; k < 12; k++) {
    const length = Math.floor(rand() * Math.min(target.length + 20, 420));
    const input = k === 0 ? target.slice(0, length) : mutate(target, length);
    for (const limit of [10, 30]) {
      const server = scoreInput(target, input, limit);
      const browser = browserScore(target, input, limit);
      assert.equal(server.errorTotal, browser.errorTotal, `エラー数が一致しません: ${id} (${k})`);
      assert.equal(server.net, browser.net, `純字数が一致しません: ${id} (${k})`);
      assert.equal(server.isDisqualified, browser.isDisqualified);
      assert.equal(server.accuracy, browser.accuracy);
      cases++;
    }
  }
}

// 入力が課題文より長い場合（超過分は余字）
const short = allTexts.reduce((a, b) => (buildTypingTarget(a).length < buildTypingTarget(b).length ? a : b));
const shortTarget = buildTypingTarget(short);
const over = shortTarget + 'あいうえお';
assert.equal(scoreInput(shortTarget, over, 30).errorTotal, browserScore(shortTarget, over, 30).errorTotal);

console.log(`OK: server scoring matches browser (${allTexts.length} texts, ${cases} randomized cases)`);
