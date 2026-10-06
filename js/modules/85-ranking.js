// チャレンジのオンラインランキング（登録・表示）
// サーバーは ranking-worker/（Cloudflare Workers + D1）。URL は js/ranking-config.js の RANKING_API_BASE。
// ・結果画面の「ランキングに登録」ボタンを押した記録だけを登録する（自動登録はしない）
// ・登録できるのは、制限時間まで打ち切った失格でない記録だけ
// ・同じブラウザからの登録は1期間1件。より良い記録のときだけサーバー側で上書きされる
// ・純字数はサーバー側で入力内容から計算し直し、人間離れした速度の記録は受け付けない

const RANKING_CLIENT_ID_KEY = 'long-type:ranking-client-id';
const RANKING_NAME_KEY = 'long-type:ranking-name';
const RANKING_NAME_MAX = 12;
const RANKING_REFRESH_MS = 60 * 1000;
const RANKING_TIMEOUT_MS = 12000;
// これらの理由で断られた記録は、送り直しても登録できないのでボタンを止める。
const RANKING_FINAL_REJECT_CODES = ['too_fast', 'burst', 'mechanical', 'disqualified', 'not_finished', 'closed', 'bad_log', 'empty', 'unknown_challenge'];

const rankingState = {
  pending: null,
  submitting: false,
  loadedChallengeId: '',
  loadedAt: 0,
  loading: false,
  data: null
};

function isRankingEnabled() {
  return typeof RANKING_API_BASE === 'string' && RANKING_API_BASE.trim() !== '';
}

function rankingApiUrl(path) {
  return RANKING_API_BASE.trim().replace(/\/+$/, '') + path;
}

function rankingEl(id) {
  return document.getElementById(id);
}

function makeRandomClientId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) { /* 下の方法で作る */ }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
}

// このブラウザの識別番号。初回に作ってブラウザに保存する（ブラウザのデータを消すと別の番号になる）。
function getRankingClientId() {
  try {
    let id = window.localStorage.getItem(RANKING_CLIENT_ID_KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = makeRandomClientId();
      window.localStorage.setItem(RANKING_CLIENT_ID_KEY, id);
    }
    return id;
  } catch (_) {
    if (!rankingState.memoryClientId) rankingState.memoryClientId = makeRandomClientId();
    return rankingState.memoryClientId;
  }
}

function getSavedRankingName() {
  try { return window.localStorage.getItem(RANKING_NAME_KEY) || ''; } catch (_) { return ''; }
}

function saveRankingName(name) {
  try { window.localStorage.setItem(RANKING_NAME_KEY, name); } catch (_) { /* 保存できなくても登録は続ける */ }
}

function cleanRankingName(raw) {
  return String(raw || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/[\s\u3000]+/g, ' ').trim();
}

async function rankingFetch(path, options = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), RANKING_TIMEOUT_MS) : null;
  try {
    const response = await fetch(rankingApiUrl(path), { ...options, signal: controller ? controller.signal : undefined });
    let body = null;
    try { body = await response.json(); } catch (_) { body = null; }
    return { status: response.status, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatRankingDate(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  } catch (_) {
    return new Date(ms).toLocaleString('ja-JP');
  }
}

// ---------------------------------------------------------------------------
// 結果画面：ランキングに登録
// ---------------------------------------------------------------------------

function setRegisterStatus(text, tone = '') {
  const status = rankingEl('ranking-register-status');
  if (!status) return;
  status.textContent = text || '';
  status.hidden = !text;
  status.className = `ranking-register-status${tone ? ` is-${tone}` : ''}`;
}

function setRegisterControlsDisabled(disabled) {
  const button = rankingEl('btn-ranking-register');
  const input = rankingEl('ranking-name');
  if (button) button.disabled = disabled;
  if (input) input.disabled = disabled;
}

// handleChallengeResult()（80-challenge.js）から呼ばれる。登録できる記録のときだけ登録欄を出す。
function prepareRankingRegistration(info) {
  const box = rankingEl('ranking-register');
  rankingState.pending = null;
  if (!box) return;
  const eligible = !!(info && info.attempt && info.attempt.status === 'recorded' && info.typed && info.challenge);
  if (!isRankingEnabled() || !eligible) {
    box.hidden = true;
    return;
  }
  rankingState.pending = {
    challengeId: info.challenge.id,
    input: info.typed.input,
    inputLog: info.typed.inputLog,
    elapsedMs: info.typed.elapsedMs,
    clientNet: info.clientNet
  };
  const input = rankingEl('ranking-name');
  if (input) {
    input.maxLength = RANKING_NAME_MAX;
    if (!input.value) input.value = getSavedRankingName();
  }
  const button = rankingEl('btn-ranking-register');
  if (button) button.hidden = false;
  setRegisterControlsDisabled(false);
  setRegisterStatus('');
  box.hidden = false;
}

async function submitRankingEntry() {
  const pending = rankingState.pending;
  if (!pending || rankingState.submitting) return;
  const input = rankingEl('ranking-name');
  const name = cleanRankingName(input ? input.value : '');
  if (!name) {
    setRegisterStatus('名前を入力してください。', 'error');
    if (input) input.focus();
    return;
  }
  if ([...name].length > RANKING_NAME_MAX) {
    setRegisterStatus(`名前は${RANKING_NAME_MAX}文字以内にしてください。`, 'error');
    return;
  }
  rankingState.submitting = true;
  setRegisterControlsDisabled(true);
  setRegisterStatus('登録しています…');
  try {
    const { status, body } = await rankingFetch(`/api/challenges/${encodeURIComponent(pending.challengeId)}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getRankingClientId(),
        name,
        input: pending.input,
        inputLog: pending.inputLog,
        elapsedMs: pending.elapsedMs,
        clientNet: pending.clientNet
      })
    });
    if (body && body.accepted) {
      saveRankingName(body.name || name);
      rankingState.pending = null;
      const button = rankingEl('btn-ranking-register');
      if (button) button.hidden = true;
      const rankText = body.rank ? `現在${body.rank}位（${body.total}人中）です。` : '';
      if (body.improved) {
        setRegisterStatus(`登録しました：純字数${body.score.net}字。${rankText}`, 'success');
      } else {
        setRegisterStatus(`登録済みの記録（純字数${body.best.net}字）の方が上位のため、記録はそのままです。名前は「${body.name}」にしました。${rankText}`, 'success');
      }
      rankingState.loadedAt = 0;
      loadRanking(pending.challengeId, true);
      return;
    }
    const message = body && body.message ? body.message : `登録できませんでした（エラー ${status}）。`;
    const code = body && body.code ? body.code : '';
    if (RANKING_FINAL_REJECT_CODES.includes(code)) {
      rankingState.pending = null;
      setRegisterStatus(message, 'error');
      setRegisterControlsDisabled(true);
    } else {
      setRegisterStatus(message, 'error');
      setRegisterControlsDisabled(false);
    }
  } catch (error) {
    setRegisterStatus('サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。', 'error');
    setRegisterControlsDisabled(false);
  } finally {
    rankingState.submitting = false;
  }
}

// ---------------------------------------------------------------------------
// チャレンジ画面：ランキング表示
// ---------------------------------------------------------------------------

function renderRankingData(data) {
  const list = rankingEl('challenge-ranking-list');
  const you = rankingEl('challenge-ranking-you');
  if (!list || !you) return;
  const entries = data && Array.isArray(data.entries) ? data.entries : [];
  if (!entries.length) {
    list.innerHTML = '<li class="challenge-ranking-empty">まだ登録がありません。結果画面の「ランキングに登録」から最初の記録を載せましょう。</li>';
  } else {
    list.innerHTML = entries.map(entry => `<li class="challenge-ranking-item${entry.isYou ? ' is-you' : ''}">`
      + `<span class="challenge-ranking-rank">${escapeHtml(entry.rank)}</span>`
      + `<span class="challenge-ranking-name">${escapeHtml(entry.name)}${entry.isYou ? '<small>あなた</small>' : ''}</span>`
      + `<strong class="challenge-ranking-net">${escapeHtml(entry.net)}字</strong>`
      + `<span class="challenge-ranking-detail">エラー${escapeHtml(entry.errorTotal)}件・${escapeHtml(formatRankingDate(entry.achievedAt))}</span>`
      + '</li>').join('');
  }
  if (data && data.you) {
    you.textContent = `あなたの順位：${data.you.rank}位（${data.total}人中）　純字数${data.you.net}字・エラー${data.you.errorTotal}件`;
  } else {
    you.textContent = data ? `登録者${data.total}人。まだ登録していません。` : '';
  }
}

function setRankingStatus(text) {
  const status = rankingEl('challenge-ranking-status');
  if (!status) return;
  status.textContent = text || '';
  status.hidden = !text;
}

async function loadRanking(challengeId, force = false) {
  if (!isRankingEnabled() || !challengeId) return;
  const fresh = rankingState.loadedChallengeId === challengeId && Date.now() - rankingState.loadedAt < RANKING_REFRESH_MS;
  if (rankingState.loading || (fresh && !force)) return;
  rankingState.loading = true;
  const refresh = rankingEl('btn-ranking-refresh');
  if (refresh) refresh.disabled = true;
  if (rankingState.loadedChallengeId !== challengeId) {
    renderRankingData(null);
    setRankingStatus('ランキングを読み込んでいます…');
  }
  try {
    const query = `?clientId=${encodeURIComponent(getRankingClientId())}`;
    const { status, body } = await rankingFetch(`/api/challenges/${encodeURIComponent(challengeId)}/ranking${query}`);
    if (!body || !body.ok) throw new Error(body && body.message ? body.message : `HTTP ${status}`);
    rankingState.data = body;
    rankingState.loadedChallengeId = challengeId;
    rankingState.loadedAt = Date.now();
    renderRankingData(body);
    setRankingStatus('');
  } catch (error) {
    setRankingStatus('ランキングを読み込めませんでした。時間をおいて「更新」を押してください。');
  } finally {
    rankingState.loading = false;
    if (refresh) refresh.disabled = false;
  }
}

// renderChallengePanel()（80-challenge.js）から呼ばれる。
function onChallengePanelRendered(challenge) {
  const section = rankingEl('challenge-ranking');
  if (!section) return;
  section.hidden = !isRankingEnabled() || !challenge;
  if (section.hidden) return;
  loadRanking(challenge.id);
}

function initRanking() {
  const button = rankingEl('btn-ranking-register');
  if (button) button.addEventListener('click', submitRankingEntry);
  const input = rankingEl('ranking-name');
  if (input) {
    input.maxLength = RANKING_NAME_MAX;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        submitRankingEntry();
      }
    });
  }
  const refresh = rankingEl('btn-ranking-refresh');
  if (refresh) {
    refresh.addEventListener('click', () => {
      const current = typeof challengeState !== 'undefined' ? challengeState.current : null;
      if (current) loadRanking(current.id, true);
    });
  }
}

if (typeof runInitialUiStep === 'function') runInitialUiStep('ランキング', initRanking);
else initRanking();
