// 開催スケジュールと課題文章は、公開中のサイト（GitHub Pages）から読み込む。
// サイト側の data/challenge/schedule.json を更新するだけで、サーバー側も新しい課題に切り替わる。
import { buildTypingTarget } from './scoring.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function siteUrl(env, path) {
  const base = String(env.SITE_BASE_URL || '').trim();
  if (!base) throw new Error('SITE_BASE_URL が設定されていません。');
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

async function fetchJson(env, path) {
  const key = `json:${path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const response = await fetch(siteUrl(env, path), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path} を読み込めませんでした（HTTP ${response.status}）`);
  const value = await response.json();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export async function findChallenge(env, challengeId) {
  const schedule = await fetchJson(env, 'data/challenge/schedule.json');
  const baseRules = schedule && schedule.rules ? schedule.rules : {};
  const list = schedule && Array.isArray(schedule.challenges) ? schedule.challenges : [];
  const item = list.find(c => c && c.id === challengeId);
  if (!item) return null;
  const startMs = Date.parse(item.start);
  const endMs = Date.parse(item.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const rules = item.rules || baseRules;
  return {
    id: item.id,
    textId: item.textId,
    startMs,
    endMs,
    timeLimitSeconds: positiveInt(rules.timeLimitSeconds, 60),
    disqualifyLimit: positiveInt(rules.disqualifyLimit, 10)
  };
}

function isSafeTextFilePath(filePath) {
  return typeof filePath === 'string' && /^data\/texts\/[A-Za-z0-9_-]+\.json$/.test(filePath.trim());
}

// 課題文章を探して、ブラウザと同じ手順で入力対象の本文を作る。
export async function loadChallengeTarget(env, textId) {
  const key = `target:${textId}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const index = await fetchJson(env, 'data/index.json');
  for (const category of Array.isArray(index) ? index : []) {
    if (!category || !isSafeTextFilePath(category.file)) continue;
    const data = await fetchJson(env, category.file.trim());
    const items = Array.isArray(data) ? data : (data && Array.isArray(data.texts) ? data.texts : []);
    const item = items.find(t => t && typeof t.text === 'string' && String(t.id || '').trim() === textId);
    if (item) {
      const value = { title: String(item.title || '').trim(), target: buildTypingTarget(item) };
      cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
      return value;
    }
  }
  return null;
}

export function clearChallengeCache() {
  cache.clear();
}
