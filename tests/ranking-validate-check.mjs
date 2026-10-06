// ランキング登録の検査（人間離れした速度・名前・送信データ）のテスト
import assert from 'node:assert/strict';
import { checkHumanPace, normalizeName, parseSubmission, readLimits, DEFAULT_LIMITS, compareEntries } from '../ranking-worker/src/validate.js';

let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// 人間らしい入力の推移を作る：平均 cpm 文字/分、確定ごとに1〜maxChunk文字、間隔はばらつく
function humanLog(cpm, seconds = 60, maxChunk = 6) {
  const log = [];
  let t = 400, n = 0;
  const target = Math.round(cpm * seconds / 60);
  while (n < target) {
    const chunk = Math.min(target - n, 1 + Math.floor(rand() * maxChunk));
    n += chunk;
    t += Math.round((chunk / (cpm / 60)) * 1000 * (0.5 + rand()));
    log.push([Math.min(t, seconds * 1000 - 50), n]);
  }
  return log;
}
const input = (n) => 'あ'.repeat(n);
const base = { elapsedMs: 60100, timeLimitSeconds: 60 };

// 通常の速さ（毎分120・250・450文字）は受け付ける
for (const cpm of [120, 250, 450]) {
  const log = humanLog(cpm);
  const r = checkHumanPace({ ...base, input: input(log.at(-1)[1]), inputLog: log });
  assert.equal(r.ok, true, `cpm ${cpm} should pass: ${JSON.stringify(r)}`);
}

// 平均速度の上限超え
{
  const log = humanLog(560);
  const r = checkHumanPace({ ...base, input: input(log.at(-1)[1]), inputLog: log });
  assert.equal(r.code, 'too_fast');
}

// 貼り付けのような一括入力
{
  const log = [[1000, 10], [2000, 80], [5000, 100]];
  assert.equal(checkHumanPace({ ...base, input: input(100), inputLog: log }).code, 'burst');
}

// 5秒間に61文字以上（1回の増加は小さいが短時間に集中）
{
  const log = [];
  for (let i = 1; i <= 16; i++) log.push([10000 + i * 290 + (i % 3) * 20, i * 4]); // 約4.7秒で64文字
  log.push([59000, 70]);
  assert.equal(checkHumanPace({ ...base, input: input(70), inputLog: log }).code, 'burst');
}

// 機械的に一定の間隔
{
  const log = [];
  for (let i = 1; i <= 120; i++) log.push([i * 450, i * 2]);
  assert.equal(checkHumanPace({ ...base, input: input(240), inputLog: log }).code, 'mechanical');
}

// 少しだけ揺らした機械入力も弾く（変動係数0.05程度）
{
  const log = [];
  let t = 0;
  for (let i = 1; i <= 120; i++) { t += 450 + Math.round((rand() - 0.5) * 60); log.push([t, i * 2]); }
  assert.equal(checkHumanPace({ ...base, input: input(240), inputLog: log }).code, 'mechanical');
}

// 制限時間まで打ち切っていない
{
  const log = humanLog(200, 30);
  assert.equal(checkHumanPace({ elapsedMs: 30000, timeLimitSeconds: 60, input: input(log.at(-1)[1]), inputLog: log }).code, 'not_finished');
}

// 推移の最後と入力文字数が合わない／時間が逆戻り／計測時間外
{
  const log = humanLog(200);
  assert.equal(checkHumanPace({ ...base, input: input(log.at(-1)[1] + 5), inputLog: log }).code, 'bad_log');
  const swapped = [[2000, 5], [1000, 10], [59000, 20]];
  assert.equal(checkHumanPace({ ...base, input: input(20), inputLog: swapped }).code, 'bad_log');
  const late = [[1000, 5], [90000, 20]];
  assert.equal(checkHumanPace({ ...base, input: input(20), inputLog: late }).code, 'bad_log');
  assert.equal(checkHumanPace({ ...base, input: '', inputLog: [] }).code, 'empty');
}

// Backspace で文字数が減る推移も正しく扱う
{
  const log = [[1000, 5], [1500, 3], [2600, 9], [59000, 40]];
  assert.equal(checkHumanPace({ ...base, input: input(40), inputLog: log }).ok, true);
}

// 基準値の上書き
assert.equal(readLimits({ MAX_CPM: '600' }).MAX_CPM, 600);
assert.equal(readLimits({ MAX_CPM: 'abc' }).MAX_CPM, DEFAULT_LIMITS.MAX_CPM);
assert.equal(readLimits({}).MAX_CHARS_PER_5SEC, DEFAULT_LIMITS.MAX_CHARS_PER_5SEC);

// 名前
assert.deepEqual(normalizeName('  たろう  '), { ok: true, name: 'たろう' });
assert.equal(normalizeName('タイピング　好き\n').name, 'タイピング 好き');
assert.equal(normalizeName('').ok, false);
assert.equal(normalizeName('　 ').ok, false);
assert.equal(normalizeName('１２３４５６７８９０１２').ok, true, '12文字はOK');
assert.equal(normalizeName('１２３４５６７８９０１２３').ok, false, '13文字はNG');
assert.equal(normalizeName('😀😀😀😀😀😀😀😀😀😀😀😀').ok, true, '絵文字は1文字として数える');
assert.equal(normalizeName('ＨＴＴＰｓ屋').ok, false, '全角でも禁止語を見つける');
assert.equal(normalizeName(123).ok, false);

// 送信データ
const good = { clientId: '0123456789abcdef0123', name: 'a', input: 'あい', elapsedMs: 60000, inputLog: [[1, 2]] };
assert.equal(parseSubmission(good).ok, true);
assert.equal(parseSubmission({ ...good, clientId: 'short' }).ok, false);
assert.equal(parseSubmission({ ...good, clientId: '<script>alert(1)</script>xxxx' }).ok, false);
assert.equal(parseSubmission({ ...good, inputLog: [[1.5, 2]] }).ok, false);
assert.equal(parseSubmission({ ...good, inputLog: [[-1, 2]] }).ok, false);
assert.equal(parseSubmission({ ...good, inputLog: 'x' }).ok, false);
assert.equal(parseSubmission({ ...good, input: 'あ'.repeat(5001) }).ok, false);
assert.equal(parseSubmission(null).ok, false);

// 順位の比較
const e = (net, errorTotal, achievedAt) => ({ net, errorTotal, achievedAt });
const sorted = [e(100, 3, '2026-10-04T03'), e(120, 9, '2026-10-04T05'), e(100, 1, '2026-10-04T09'), e(100, 1, '2026-10-04T01')].sort(compareEntries);
assert.deepEqual(sorted.map(x => `${x.net}/${x.errorTotal}/${x.achievedAt.slice(-2)}`), ['120/9/05', '100/1/01', '100/1/09', '100/3/03']);

// 画面側：85-ranking.js が使う要素がすべて index.html にあること、設定ファイルが読み込まれていること
import('node:fs').then(({ default: fs }) => {
  const root = new URL('..', import.meta.url);
  const html = fs.readFileSync(new URL('index.html', root), 'utf8');
  const ui = fs.readFileSync(new URL('js/modules/85-ranking.js', root), 'utf8');
  const ids = [...ui.matchAll(/rankingEl\('([^']+)'\)/g)].map(m => m[1]);
  assert.ok(ids.length >= 8);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `index.html に #${id} がありません`);
  const order = ['80-challenge.js', 'ranking-config.js', '85-ranking.js'].map(name => html.indexOf(name));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], 'スクリプトの読み込み順が正しくありません');
  console.log('OK: ranking validation (human pace, names, payload, ordering, UI ids)');
});
