// チャレンジモード（ローカル版）の簡易テスト
//  - schedule.json の整合性（課題IDの存在・期間の重なり・内蔵予備データとの一致）
//  - 開催中の課題判定、記録の判定（記録／失格／中断）、自己ベストの比較と保存
import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const storage = new Map();
const context = {
  console: { ...console, warn: () => {} }, // 壊れたデータの復帰テストで出る警告は表示しない
  Intl,
  Date,
  window: {
    __CHALLENGE_TEST__: true,
    localStorage: {
      setItem: (k, v) => storage.set(k, String(v)),
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      removeItem: (k) => storage.delete(k)
    }
  },
  document: { getElementById: () => null },
  gameState: { texts: { items: [] }, session: { running: false }, countdown: { active: false } },
  escapeHtml: (v) => String(v)
};
vm.createContext(context);
vm.runInContext(read('js/modules/80-challenge.js'), context, { filename: '80-challenge.js' });
const run = (code) => vm.runInContext(code, context);

// --- schedule.json の整合性 ---
const scheduleJson = JSON.parse(read('data/challenge/schedule.json'));
const fallback = run('CHALLENGE_SCHEDULE_FALLBACK');
assert.deepEqual(
  JSON.parse(JSON.stringify(fallback.challenges)),
  scheduleJson.challenges,
  'schedule.json と 80-challenge.js の CHALLENGE_SCHEDULE_FALLBACK を同じ内容にしてください'
);
assert.deepEqual(JSON.parse(JSON.stringify(fallback.rules)), scheduleJson.rules, 'rules が予備データと一致しません');

const schedule = context.normalizeChallengeSchedule(scheduleJson);
assert.equal(schedule.challenges.length, scheduleJson.challenges.length, 'schedule.json に読めない行があります（id/textId/日付を確認）');

const textIds = new Set();
for (const item of JSON.parse(read('data/index.json'))) {
  for (const text of JSON.parse(read(item.file))) textIds.add(text.id);
}
const idSet = new Set();
let prevEnd = -Infinity;
const timeOptions = [...read('index.html').matchAll(/<option value="(\d+)">\d+ 分<\/option>/g)].map(m => Number(m[1]));
for (const c of schedule.challenges) {
  assert.ok(textIds.has(c.textId), `課題文章が存在しません: ${c.textId}`);
  assert.ok(!idSet.has(c.id), `チャレンジIDが重複しています: ${c.id}`);
  idSet.add(c.id);
  assert.ok(c.startMs >= prevEnd, `期間が重なっています: ${c.id}`);
  prevEnd = c.endMs;
  assert.ok(timeOptions.includes(c.rules.timeLimitSeconds), `制限時間 ${c.rules.timeLimitSeconds}秒 は終了条件の選択肢にありません`);
  assert.ok(c.rules.disqualifyLimit >= 1 && c.rules.disqualifyLimit <= 30, '失格ラインは1〜30の範囲にしてください');
}

// --- 開催中の判定（開始時刻ちょうどは開催中、終了時刻ちょうどは次の課題） ---
const first = schedule.challenges[0];
const second = schedule.challenges[1];
assert.equal(context.findChallengeAt(schedule, first.startMs).id, first.id);
assert.equal(context.findChallengeAt(schedule, first.startMs - 1), null);
assert.equal(context.findChallengeAt(schedule, first.endMs - 1).id, first.id);
assert.equal(context.findChallengeAt(schedule, first.endMs).id, second.id);
assert.equal(context.findNextChallenge(schedule, first.startMs - 1).id, first.id);
assert.equal(context.findChallengeAt(schedule, schedule.challenges.at(-1).endMs), null);
assert.equal(context.formatChallengePeriod(first), '10月4日（日）〜10月11日（日）');

// 不正な行は除外される
const broken = context.normalizeChallengeSchedule({ challenges: [
  { id: 'x', textId: 't', start: 'bad', end: '2026-10-01T00:00:00+09:00' },
  { id: 'y', textId: 't', start: '2026-10-02T00:00:00+09:00', end: '2026-10-01T00:00:00+09:00' },
  { id: 'z', textId: 't', start: '2026-10-01T00:00:00+09:00', end: '2026-10-02T00:00:00+09:00' }
] });
assert.deepEqual(broken.challenges.map(c => c.id), ['z']);
assert.equal(broken.rules.timeLimitSeconds, 60);

// --- 1回の挑戦の判定 ---
const base = { inputChars: 150, errorTotal: 2, accuracy: 98, cpm: 150, net: 130 };
const timeout = context.buildChallengeAttempt({ ...base, isTimeoutFinish: true }, '2026-10-04T10:00:00.000Z');
assert.equal(timeout.status, 'recorded');
assert.equal(timeout.net, 130);
const aborted = context.buildChallengeAttempt({ ...base, isTimeoutFinish: false, isCompleted: false });
assert.equal(aborted.status, 'aborted');
assert.equal(aborted.net, 0, '中断は純字数0として扱う');
const dq = context.buildChallengeAttempt({ ...base, net: 0, errorTotal: 10, isDisqualified: true, isTimeoutFinish: true });
assert.equal(dq.status, 'disqualified');
const completed = context.buildChallengeAttempt({ ...base, isCompleted: true });
assert.equal(completed.status, 'recorded', '全文を打ち終えた場合は正規終了として記録する');

// --- 順位の比較：純字数 → エラー数 → 記録日時 ---
const a = { net: 130, errorTotal: 2, at: '2026-10-04T10:00:00.000Z' };
assert.ok(context.compareChallengeAttempts({ net: 131, errorTotal: 9, at: 'z' }, a) < 0, '純字数が多い方が上位');
assert.ok(context.compareChallengeAttempts({ net: 130, errorTotal: 1, at: 'z' }, a) < 0, '同点ならエラーが少ない方が上位');
assert.ok(context.compareChallengeAttempts({ net: 130, errorTotal: 2, at: '2026-10-05T00:00:00.000Z' }, a) > 0, '完全に同点なら先の記録が上位');

// --- 保存と自己ベスト更新 ---
let store = context.makeEmptyChallengeStore();
let r = context.addChallengeAttempt(store, first, aborted, '北前船');
assert.equal(r.isNewBest, false);
assert.equal(r.store.challenges[first.id].best, null);
r = context.addChallengeAttempt(r.store, first, dq, '北前船');
assert.equal(r.isNewBest, false, '失格は自己ベストにならない');
r = context.addChallengeAttempt(r.store, first, timeout, '北前船');
assert.equal(r.isNewBest, true);
assert.equal(r.previousBest, null);
const lower = context.buildChallengeAttempt({ ...base, net: 120, isTimeoutFinish: true }, '2026-10-04T11:00:00.000Z');
r = context.addChallengeAttempt(r.store, first, lower, '北前船');
assert.equal(r.isNewBest, false);
assert.equal(r.store.challenges[first.id].best.net, 130);
const tieFewerErrors = context.buildChallengeAttempt({ ...base, errorTotal: 1, isTimeoutFinish: true }, '2026-10-04T12:00:00.000Z');
r = context.addChallengeAttempt(r.store, first, tieFewerErrors, '北前船');
assert.equal(r.isNewBest, true, '同じ純字数でエラーが少なければ更新');
assert.equal(r.previousBest.errorTotal, 2);
const entry = r.store.challenges[first.id];
assert.equal(entry.attemptCount, 5);
assert.equal(entry.attempts[0].at, '2026-10-04T12:00:00.000Z', '新しい挑戦が先頭');

// 期間ごとに独立して記録される
r = context.addChallengeAttempt(r.store, second, timeout, '江戸');
assert.equal(r.isNewBest, true);
assert.equal(Object.keys(r.store.challenges).length, 2);

// 履歴は上限件数まで
let big = context.makeEmptyChallengeStore();
for (let i = 0; i < 60; i++) {
  big = context.addChallengeAttempt(big, first, context.buildChallengeAttempt({ ...base, net: i, isTimeoutFinish: true }, `2026-10-04T00:00:${String(i).padStart(2, '0')}.000Z`)).store;
}
assert.equal(big.challenges[first.id].attempts.length, 50);
assert.equal(big.challenges[first.id].attemptCount, 60);
assert.equal(big.challenges[first.id].best.net, 59);

// localStorage との読み書き、壊れたデータからの復帰
context.writeChallengeStore(r.store);
assert.equal(context.readChallengeStore().challenges[first.id].best.errorTotal, 1);
storage.set('long-type:challenge-records:v1', '{broken');
assert.deepEqual(JSON.parse(JSON.stringify(context.readChallengeStore())), { version: 1, challenges: {} });

// 設定保存の上書き：チャレンジ中は元の設定値を返す
run(`challengeState.active = true; challengeState.snapshot = { preset: 'practice', presetDependent: { 'live-status-mode': 'show', 'start-mode': 'immediate' }, time: '180', disqualify: '5' };`);
assert.deepEqual(JSON.parse(JSON.stringify(context.getChallengeSettingOverrides())), {
  'display-preset-mode': 'practice', 'live-status-mode': 'show', 'start-mode': 'immediate', 'time-select': '180', 'disqualify-limit': '5'
}, 'チャレンジ中に保存される設定は、強制した本番モードではなく元の表示モードにする');
assert.equal(context.CHALLENGE_FORCED_PRESET ?? run('CHALLENGE_FORCED_PRESET'), 'competition');
run(`challengeState.active = false; challengeState.snapshot = null;`);
assert.deepEqual(JSON.parse(JSON.stringify(context.getChallengeSettingOverrides())), {});

console.log(`OK: challenge mode schedule (${schedule.challenges.length} periods) and record logic`);
