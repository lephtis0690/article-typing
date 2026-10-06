// LONG_TYPE チャレンジランキング用 API（Cloudflare Workers + D1）
//
//   GET  /api/health
//   GET  /api/challenges/:id/ranking?clientId=...   上位50位と自分の順位
//   POST /api/challenges/:id/entries                 ランキング登録（サーバー側で再採点・速度検査）
import { scoreInput } from './scoring.js';
import { parseSubmission, normalizeName, checkHumanPace, readLimits, isValidClientId } from './validate.js';
import { findChallenge, loadChallengeTarget } from './challenges.js';

const RANKING_LIMIT = 50;
// 期間終了の直前に始めた挑戦を登録できるよう、終了後も少しだけ受け付ける。
const SUBMIT_GRACE_MS = 3 * 60 * 1000;
// 同じ端末からの連続送信（ボタンの二度押しなど）を防ぐ間隔。1回の挑戦は1分以上かかるので通常の利用には影響しない。
const RESUBMIT_INTERVAL_MS = 20 * 1000;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin && allowedOrigins(env).includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request, env, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(request, env) }
  });
}

function fail(request, env, status, code, message) {
  return json(request, env, status, { ok: false, accepted: false, code, message });
}

function rowToEntry(row) {
  return {
    name: row.name,
    net: row.net,
    errorTotal: row.error_total,
    accuracy: row.accuracy,
    inputChars: row.input_chars,
    achievedAt: row.achieved_at
  };
}

// 自分より上位の件数 + 1 が順位。
async function getRank(db, challengeId, entry) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS better FROM entries
     WHERE challenge_id = ?1 AND hidden = 0
       AND (net > ?2 OR (net = ?2 AND error_total < ?3) OR (net = ?2 AND error_total = ?3 AND achieved_at < ?4))`
  ).bind(challengeId, entry.net, entry.errorTotal, entry.achievedAt).first();
  return (row ? row.better : 0) + 1;
}

async function countEntries(db, challengeId) {
  const row = await db.prepare('SELECT COUNT(*) AS total FROM entries WHERE challenge_id = ?1 AND hidden = 0').bind(challengeId).first();
  return row ? row.total : 0;
}

async function handleRanking(request, env, challengeId) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || '';
  const { results } = await env.DB.prepare(
    `SELECT client_id, name, net, error_total, accuracy, input_chars, achieved_at FROM entries
     WHERE challenge_id = ?1 AND hidden = 0
     ORDER BY net DESC, error_total ASC, achieved_at ASC LIMIT ?2`
  ).bind(challengeId, RANKING_LIMIT).all();
  const total = await countEntries(env.DB, challengeId);

  let you = null;
  if (isValidClientId(clientId)) {
    const row = await env.DB.prepare(
      `SELECT name, net, error_total, accuracy, input_chars, achieved_at FROM entries
       WHERE challenge_id = ?1 AND client_id = ?2 AND hidden = 0`
    ).bind(challengeId, clientId).first();
    if (row) {
      const entry = rowToEntry(row);
      you = { ...entry, rank: await getRank(env.DB, challengeId, entry) };
    }
  }
  const entries = (results || []).map((row, index) => {
    // client_id は公開しない。自分の行かどうかの判定にだけ使う。
    const isYou = isValidClientId(clientId) && row.client_id === clientId;
    return { rank: index + 1, ...rowToEntry(row), isYou };
  });
  return json(request, env, 200, { ok: true, challengeId, limit: RANKING_LIMIT, total, entries, you });
}

async function logSubmission(db, values) {
  await db.prepare(
    `INSERT INTO submissions (challenge_id, client_id, created_at, accepted, code, input_chars, net, error_total, client_net)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(
    values.challengeId, values.clientId, values.createdAt, values.accepted ? 1 : 0, values.code || '',
    values.inputChars ?? null, values.net ?? null, values.errorTotal ?? null, values.clientNet ?? null
  ).run();
}

async function handleSubmit(request, env, challengeId) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return fail(request, env, 400, 'bad_request', '送信データが読み取れません。');
  }
  const parsed = parseSubmission(body);
  if (!parsed.ok) return fail(request, env, 400, parsed.code, parsed.message);
  const nameResult = normalizeName(parsed.name);
  if (!nameResult.ok) return fail(request, env, 400, 'bad_name', nameResult.message);

  const challenge = await findChallenge(env, challengeId);
  if (!challenge) return fail(request, env, 404, 'unknown_challenge', 'このチャレンジは登録されていません。');
  const now = Date.now();
  if (now < challenge.startMs || now > challenge.endMs + SUBMIT_GRACE_MS) {
    return fail(request, env, 403, 'closed', 'このチャレンジの登録期間は終了しています。');
  }

  const nowIso = new Date(now).toISOString();
  const clientNet = Number.isFinite(Number(body.clientNet)) ? Math.round(Number(body.clientNet)) : null;
  const last = await env.DB.prepare('SELECT created_at FROM submissions WHERE client_id = ?1 ORDER BY id DESC LIMIT 1')
    .bind(parsed.clientId).first();
  if (last && now - Date.parse(last.created_at) < RESUBMIT_INTERVAL_MS) {
    return fail(request, env, 429, 'too_soon', '続けて登録しています。少し待ってからもう一度お試しください。');
  }

  const reject = async (status, code, message, extra = {}) => {
    await logSubmission(env.DB, { challengeId, clientId: parsed.clientId, createdAt: nowIso, accepted: false, code, clientNet, ...extra });
    return fail(request, env, status, code, message);
  };

  const pace = checkHumanPace({
    input: parsed.input, inputLog: parsed.inputLog, elapsedMs: parsed.elapsedMs, timeLimitSeconds: challenge.timeLimitSeconds
  }, readLimits(env));
  if (!pace.ok) return reject(422, pace.code, pace.message, { inputChars: parsed.input.length });

  const text = await loadChallengeTarget(env, challenge.textId);
  if (!text) return fail(request, env, 500, 'text_missing', '課題文章が見つからないため採点できません。');
  const score = scoreInput(text.target, parsed.input, challenge.disqualifyLimit);
  if (score.isDisqualified) {
    return reject(422, 'disqualified', `エラーが${challenge.disqualifyLimit}件以上のため登録できません。`, {
      inputChars: score.inputChars, net: 0, errorTotal: score.errorTotal
    });
  }

  const candidate = { net: score.net, errorTotal: score.errorTotal, achievedAt: nowIso };
  const existing = await env.DB.prepare(
    'SELECT name, net, error_total, accuracy, input_chars, achieved_at, hidden FROM entries WHERE challenge_id = ?1 AND client_id = ?2'
  ).bind(challengeId, parsed.clientId).first();

  let improved = false;
  if (!existing) {
    improved = true;
    await env.DB.prepare(
      `INSERT INTO entries (challenge_id, client_id, name, net, error_total, accuracy, input_chars, achieved_at, updated_at, submit_count, hidden)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 1, 0)`
    ).bind(challengeId, parsed.clientId, nameResult.name, score.net, score.errorTotal, score.accuracy, score.inputChars, nowIso).run();
  } else {
    improved = score.net > existing.net || (score.net === existing.net && score.errorTotal < existing.error_total);
    if (improved) {
      await env.DB.prepare(
        `UPDATE entries SET name = ?3, net = ?4, error_total = ?5, accuracy = ?6, input_chars = ?7, achieved_at = ?8, updated_at = ?8,
           submit_count = submit_count + 1
         WHERE challenge_id = ?1 AND client_id = ?2`
      ).bind(challengeId, parsed.clientId, nameResult.name, score.net, score.errorTotal, score.accuracy, score.inputChars, nowIso).run();
    } else {
      // 記録は更新しないが、名前の変更は反映する。
      await env.DB.prepare(
        'UPDATE entries SET name = ?3, updated_at = ?4, submit_count = submit_count + 1 WHERE challenge_id = ?1 AND client_id = ?2'
      ).bind(challengeId, parsed.clientId, nameResult.name, nowIso).run();
    }
  }
  await logSubmission(env.DB, {
    challengeId, clientId: parsed.clientId, createdAt: nowIso, accepted: true, code: improved ? 'improved' : 'kept',
    inputChars: score.inputChars, net: score.net, errorTotal: score.errorTotal, clientNet
  });

  const current = improved
    ? candidate
    : { net: existing.net, errorTotal: existing.error_total, achievedAt: existing.achieved_at };
  const hidden = existing && existing.hidden === 1;
  return json(request, env, 200, {
    ok: true,
    accepted: true,
    improved,
    name: nameResult.name,
    score: { net: score.net, errorTotal: score.errorTotal, accuracy: score.accuracy, inputChars: score.inputChars },
    previous: existing ? { net: existing.net, errorTotal: existing.error_total } : null,
    best: { net: current.net, errorTotal: current.errorTotal },
    rank: hidden ? null : await getRank(env.DB, challengeId, current),
    total: await countEntries(env.DB, challengeId)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });

    // 許可していないサイトからの登録は受け付けない（ブラウザ以外からの直接送信は再採点と速度検査で防ぐ）。
    const origin = request.headers.get('Origin');
    if (request.method === 'POST' && (!origin || !allowedOrigins(env).includes(origin.replace(/\/$/, '')))) {
      return fail(request, env, 403, 'forbidden_origin', 'このサイトからは登録できません。');
    }

    try {
      if (url.pathname === '/api/health') return json(request, env, 200, { ok: true });
      const match = url.pathname.match(/^\/api\/challenges\/([A-Za-z0-9_-]{1,64})\/(ranking|entries)$/);
      if (match && match[2] === 'ranking' && request.method === 'GET') return await handleRanking(request, env, match[1]);
      if (match && match[2] === 'entries' && request.method === 'POST') return await handleSubmit(request, env, match[1]);
      return fail(request, env, 404, 'not_found', '見つかりません。');
    } catch (error) {
      console.error(error);
      return fail(request, env, 500, 'server_error', 'サーバーでエラーが発生しました。時間をおいてもう一度お試しください。');
    }
  }
};
