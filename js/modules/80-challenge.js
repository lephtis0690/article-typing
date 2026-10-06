// チャレンジモード（試作・ローカル版）
// 期間ごとに決めた１つの課題文章を、全員同じ条件（制限時間・失格ライン・3秒後開始）で打ち、
// 純字数の自己ベストをこの端末に記録する。サーバーは使わない。
// 将来オンラインランキングにする場合は、handleChallengeResult() の中で送信処理を追加する想定。
//
// 構成:
//  - 前半: DOMに依存しない純粋な関数（スケジュール判定・記録比較・保存）。tests/challenge-check.mjs で検証する。
//  - 後半: 画面表示・モード切替・既存処理との連携。

const CHALLENGE_SCHEDULE_URL = 'data/challenge/schedule.json';
const CHALLENGE_STORAGE_KEY = 'long-type:challenge-records:v1';
const CHALLENGE_HISTORY_LIMIT = 50;
const CHALLENGE_HISTORY_DISPLAY = 5;
const CHALLENGE_DEFAULT_RULES = { timeLimitSeconds: 60, disqualifyLimit: 10 };
// チャレンジ中は本番モードを強制する。本番モードが書き換える表示補助の設定も、終了時に元へ戻すため控えておく。
const CHALLENGE_FORCED_PRESET = 'competition';
const CHALLENGE_PRESET_DEPENDENT_IDS = [
  'live-status-mode', 'typing-position-mode', 'correct-feedback-mode', 'feedback-mode', 'time-call-mode', 'start-mode'
];

// data/challenge/schedule.json を読めない場合（ローカルで index.html を直接開いた場合など）の予備。
// schedule.json を変更したら、ここも同じ内容にする（npm test で一致を確認している）。
const CHALLENGE_SCHEDULE_FALLBACK = {
  rules: { timeLimitSeconds: 60, disqualifyLimit: 10 },
  challenges: [
    { id: '2026-w41', textId: 'kitamaebune_trade_history', start: '2026-10-04T00:00:00+09:00', end: '2026-10-12T00:00:00+09:00' },
    { id: '2026-w42', textId: 'edo_waterworks_history', start: '2026-10-12T00:00:00+09:00', end: '2026-10-19T00:00:00+09:00' },
    { id: '2026-w43', textId: 'stock-008', start: '2026-10-19T00:00:00+09:00', end: '2026-10-26T00:00:00+09:00' }
  ]
};

// ---------------------------------------------------------------------------
// 純粋な関数（DOMを使わない）
// ---------------------------------------------------------------------------

function normalizeChallengeRules(rules) {
  const source = rules && typeof rules === 'object' ? rules : {};
  const time = Number(source.timeLimitSeconds);
  const limit = Number(source.disqualifyLimit);
  return {
    timeLimitSeconds: Number.isInteger(time) && time > 0 ? time : CHALLENGE_DEFAULT_RULES.timeLimitSeconds,
    disqualifyLimit: Number.isInteger(limit) && limit > 0 ? limit : CHALLENGE_DEFAULT_RULES.disqualifyLimit
  };
}

// 不正な行（日付が読めない・開始が終了より後など）は捨て、開始日時の順に並べる。
function normalizeChallengeSchedule(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rules = normalizeChallengeRules(source.rules);
  const list = Array.isArray(source.challenges) ? source.challenges : [];
  const challenges = list
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const id = String(item.id || '').trim();
      const textId = String(item.textId || '').trim();
      const startMs = Date.parse(item.start);
      const endMs = Date.parse(item.end);
      if (!id || !textId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return null;
      return { id, textId, start: item.start, end: item.end, startMs, endMs, rules: normalizeChallengeRules(item.rules || rules) };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);
  return { rules, challenges };
}

// 開始日時 <= 現在 < 終了日時 の課題を返す。
function findChallengeAt(schedule, nowMs) {
  if (!schedule || !Array.isArray(schedule.challenges)) return null;
  return schedule.challenges.find(item => item.startMs <= nowMs && nowMs < item.endMs) || null;
}

function findNextChallenge(schedule, nowMs) {
  if (!schedule || !Array.isArray(schedule.challenges)) return null;
  return schedule.challenges.find(item => item.startMs > nowMs) || null;
}

// 正規終了（時間切れ・全文入力）かつ失格でない挑戦だけが自己ベストの対象。
function isChallengeAttemptEligible(attempt) {
  return !!attempt && attempt.status === 'recorded';
}

// a の方が上位なら負の値。純字数が多い → エラーが少ない → 先に記録した、の順。
function compareChallengeAttempts(a, b) {
  const netDiff = (Number(b.net) || 0) - (Number(a.net) || 0);
  if (netDiff !== 0) return netDiff;
  const errorDiff = (Number(a.errorTotal) || 0) - (Number(b.errorTotal) || 0);
  if (errorDiff !== 0) return errorDiff;
  return String(a.at || '').localeCompare(String(b.at || ''));
}

function buildChallengeAttempt(metrics, atIso) {
  const m = metrics && typeof metrics === 'object' ? metrics : {};
  const finishedNormally = !!(m.isTimeoutFinish || m.isCompleted);
  let status = 'recorded';
  if (!finishedNormally) status = 'aborted';
  else if (m.isDisqualified) status = 'disqualified';
  return {
    at: atIso || new Date().toISOString(),
    status,
    net: status === 'recorded' ? Math.max(0, Math.round(Number(m.net) || 0)) : 0,
    inputChars: Math.max(0, Math.round(Number(m.inputChars) || 0)),
    errorTotal: Math.max(0, Math.round(Number(m.errorTotal) || 0)),
    accuracy: Math.max(0, Math.round(Number(m.accuracy) || 0)),
    cpm: Math.max(0, Math.round(Number(m.cpm) || 0))
  };
}

function makeEmptyChallengeStore() {
  return { version: 1, challenges: {} };
}

function normalizeChallengeStore(raw) {
  if (!raw || typeof raw !== 'object' || !raw.challenges || typeof raw.challenges !== 'object') {
    return makeEmptyChallengeStore();
  }
  const store = makeEmptyChallengeStore();
  Object.keys(raw.challenges).forEach(id => {
    const entry = raw.challenges[id];
    if (!entry || typeof entry !== 'object') return;
    const attempts = Array.isArray(entry.attempts) ? entry.attempts.filter(a => a && typeof a === 'object') : [];
    const best = entry.best && typeof entry.best === 'object' ? entry.best : null;
    store.challenges[id] = {
      textId: String(entry.textId || ''),
      title: String(entry.title || ''),
      start: entry.start || '',
      end: entry.end || '',
      attemptCount: Number.isFinite(Number(entry.attemptCount)) ? Number(entry.attemptCount) : attempts.length,
      best: isChallengeAttemptEligible(best) ? best : null,
      attempts: attempts.slice(0, CHALLENGE_HISTORY_LIMIT)
    };
  });
  return store;
}

// store を直接書き換えず、新しい store と今回の判定結果を返す。
function addChallengeAttempt(store, challenge, attempt, title = '') {
  const next = normalizeChallengeStore(store);
  const previous = next.challenges[challenge.id] || {
    textId: challenge.textId, title, start: challenge.start, end: challenge.end, attemptCount: 0, best: null, attempts: []
  };
  const previousBest = previous.best || null;
  const eligible = isChallengeAttemptEligible(attempt);
  const isNewBest = eligible && (!previousBest || compareChallengeAttempts(attempt, previousBest) < 0);
  next.challenges[challenge.id] = {
    textId: challenge.textId,
    title: title || previous.title,
    start: challenge.start,
    end: challenge.end,
    attemptCount: (Number(previous.attemptCount) || 0) + 1,
    best: isNewBest ? attempt : previousBest,
    attempts: [attempt, ...previous.attempts].slice(0, CHALLENGE_HISTORY_LIMIT)
  };
  return { store: next, previousBest, isNewBest, eligible };
}

function readChallengeStore() {
  try {
    const raw = window.localStorage.getItem(CHALLENGE_STORAGE_KEY);
    return raw ? normalizeChallengeStore(JSON.parse(raw)) : makeEmptyChallengeStore();
  } catch (error) {
    console.warn('チャレンジ記録を読み込めませんでした。', error);
    return makeEmptyChallengeStore();
  }
}

function writeChallengeStore(store) {
  try {
    window.localStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    console.warn('チャレンジ記録を保存できませんでした。', error);
    return false;
  }
}

// 日本時間で「10月4日（日）」の形にする。
function formatChallengeDate(ms) {
  try {
    const date = new Date(ms);
    const parts = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(date)
      .reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    return `${parts.month}月${parts.day}日（${parts.weekday}）`;
  } catch (_) {
    return new Date(ms).toLocaleDateString('ja-JP');
  }
}

function formatChallengeDateTime(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(ms));
  } catch (_) {
    return new Date(ms).toLocaleString('ja-JP');
  }
}

// 終了日時は「その時刻になった瞬間に終了」なので、表示上は1ミリ秒前の日付を最終日とする。
function formatChallengePeriod(challenge) {
  return `${formatChallengeDate(challenge.startMs)}〜${formatChallengeDate(challenge.endMs - 1)}`;
}

function formatChallengeRemaining(challenge, nowMs) {
  const remain = challenge.endMs - nowMs;
  if (remain <= 0) return '終了しました';
  const hours = Math.floor(remain / 3600000);
  if (hours >= 24) return `残り${Math.floor(hours / 24)}日`;
  if (hours >= 1) return `残り${hours}時間`;
  return `残り${Math.max(1, Math.ceil(remain / 60000))}分`;
}

function getChallengeStatusLabel(status) {
  if (status === 'disqualified') return '失格';
  if (status === 'aborted') return '中断';
  return '記録';
}

// ---------------------------------------------------------------------------
// 画面との連携
// ---------------------------------------------------------------------------

const challengeState = {
  active: false,
  schedule: normalizeChallengeSchedule(CHALLENGE_SCHEDULE_FALLBACK),
  scheduleSource: 'fallback',
  current: null,
  snapshot: null
};

const challengeDom = {};

function getChallengeDom() {
  if (challengeDom.ready) return challengeDom;
  challengeDom.panel = document.getElementById('challenge-panel');
  challengeDom.toggle = document.getElementById('btn-challenge-mode');
  challengeDom.period = document.getElementById('challenge-period');
  challengeDom.title = document.getElementById('challenge-panel-title');
  challengeDom.rules = document.getElementById('challenge-rules');
  challengeDom.bestNet = document.getElementById('challenge-best-net');
  challengeDom.bestMeta = document.getElementById('challenge-best-meta');
  challengeDom.attemptCount = document.getElementById('challenge-attempt-count');
  challengeDom.historyList = document.getElementById('challenge-history-list');
  challengeDom.pastList = document.getElementById('challenge-past-list');
  challengeDom.past = document.getElementById('challenge-past');
  challengeDom.message = document.getElementById('challenge-message');
  challengeDom.startButton = document.getElementById('btn-challenge-start');
  challengeDom.exitButton = document.getElementById('btn-challenge-exit');
  challengeDom.result = document.getElementById('challenge-result');
  challengeDom.ready = true;
  return challengeDom;
}

function isChallengeActive() {
  return challengeState.active === true;
}

function getChallengeTextItem(challenge) {
  if (!challenge || !gameState || !gameState.texts || !Array.isArray(gameState.texts.items)) return null;
  return gameState.texts.items.find(item => item.id === challenge.textId) || null;
}

function refreshCurrentChallenge() {
  challengeState.current = findChallengeAt(challengeState.schedule, Date.now());
  return challengeState.current;
}

function isChallengeMeasuring() {
  return !!(gameState && ((gameState.session && gameState.session.running) || (gameState.countdown && gameState.countdown.active)));
}

function setSelectIfOptionExists(select, value) {
  if (!select) return false;
  const exists = Array.from(select.options || []).some(option => option.value === value);
  if (exists) select.value = value;
  return exists;
}

// 条件を固定する。チャレンジ中は終了条件・失格ライン・開始方法・課題選択を変更できない。
function applyChallengeRulesToControls() {
  const challenge = challengeState.current;
  const rules = challenge ? challenge.rules : challengeState.schedule.rules;
  setSelectIfOptionExists(timeSelect, String(rules.timeLimitSeconds));
  setSelectIfOptionExists(disqualifyLimitSelect, String(rules.disqualifyLimit));
  // 本番モードを強制する。applyDisplayPresetMode() が body.competition-mode と表示補助の固定を反映する。
  if (setSelectIfOptionExists(displayPresetModeSelect, CHALLENGE_FORCED_PRESET) && typeof applyDisplayPresetMode === 'function') {
    applyDisplayPresetMode();
  }
}

// setConfigControlsDisabled() の最後から呼ばれる。計測後に設定欄が再び有効化されても、固定項目は無効のまま保つ。
function applyChallengeLocks(measuring = isChallengeMeasuring()) {
  const dom = getChallengeDom();
  const active = isChallengeActive();
  const lockIds = ['display-preset-mode', 'time-select', 'disqualify-limit', 'start-mode', 'btn-text-library', 'btn-beginner-mode'];
  if (active) {
    lockIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.disabled = true;
    });
  }
  // カウントダウン開始の時点でパネルを隠し、START の瞬間に課題文の位置がずれないようにする。
  if (document.body) document.body.classList.toggle('challenge-measuring', active && measuring);
  if (dom.toggle) dom.toggle.disabled = measuring;
  if (dom.exitButton) dom.exitButton.disabled = measuring;
  if (dom.startButton) {
    dom.startButton.disabled = measuring || !challengeState.current || !getChallengeTextItem(challengeState.current);
  }
}

// 設定保存（localStorage）では、チャレンジで一時的に変えた値ではなく、利用者が元々選んでいた値を保存する。
function getChallengeSettingOverrides() {
  if (!isChallengeActive() || !challengeState.snapshot) return {};
  return {
    'display-preset-mode': challengeState.snapshot.preset,
    ...challengeState.snapshot.presetDependent,
    'time-select': challengeState.snapshot.time,
    'disqualify-limit': challengeState.snapshot.disqualify
  };
}

function applyChallengeText() {
  const challenge = challengeState.current;
  const item = getChallengeTextItem(challenge);
  if (!item) return false;
  gameState.texts.selectionMode = 'manual';
  applySelectedText(item.id);
  return true;
}

// startGame() の冒頭から呼ばれる。開始できない場合は false を返し、計測を始めない。
function prepareChallengeForStart() {
  const before = challengeState.current ? challengeState.current.id : null;
  refreshCurrentChallenge();
  const after = challengeState.current ? challengeState.current.id : null;
  applyChallengeRulesToControls();
  if (before !== after) renderChallengePanel();
  if (!challengeState.current) {
    showChallengeMessage('現在開催中のチャレンジはありません。');
    return false;
  }
  if (!applyChallengeText()) {
    showChallengeMessage('課題文章が見つからないため開始できません。課題データの読み込みを確認してください。');
    return false;
  }
  showChallengeMessage('');
  return true;
}

function showChallengeMessage(text) {
  const dom = getChallengeDom();
  if (!dom.message) return;
  dom.message.textContent = text || '';
  dom.message.hidden = !text;
}

function enterChallengeMode() {
  if (isChallengeActive() || isChallengeMeasuring()) return;
  const presetDependent = {};
  CHALLENGE_PRESET_DEPENDENT_IDS.forEach(id => {
    const select = document.getElementById(id);
    if (select) presetDependent[id] = select.value;
  });
  challengeState.snapshot = {
    preset: displayPresetModeSelect ? displayPresetModeSelect.value : 'practice',
    presetDependent,
    time: timeSelect ? timeSelect.value : '180',
    disqualify: disqualifyLimitSelect ? disqualifyLimitSelect.value : '10',
    selectionMode: gameState.texts.selectionMode,
    currentId: gameState.texts.currentId
  };
  challengeState.active = true;
  document.body.classList.add('challenge-mode');
  if (typeof closeAdvancedSettingsForMeasurement === 'function') closeAdvancedSettingsForMeasurement();
  if (typeof hideResultSubscreens === 'function') hideResultSubscreens();
  if (resultScreen) resultScreen.style.display = 'none';
  refreshCurrentChallenge();
  applyChallengeRulesToControls();
  applyChallengeText();
  showChallengeMessage('');
  renderChallengePanel();
  if (typeof initDisplay === 'function') initDisplay();
  if (typeof updateTextSelectionStatus === 'function') updateTextSelectionStatus();
  applyChallengeLocks(false);
  const dom = getChallengeDom();
  if (dom.panel && typeof dom.panel.scrollIntoView === 'function') dom.panel.scrollIntoView({ block: 'nearest' });
}

function exitChallengeMode() {
  if (!isChallengeActive() || isChallengeMeasuring()) return;
  const snapshot = challengeState.snapshot || {};
  challengeState.active = false;
  challengeState.snapshot = null;
  document.body.classList.remove('challenge-mode');
  if (resultScreen) resultScreen.style.display = 'none';
  setSelectIfOptionExists(timeSelect, snapshot.time || '180');
  setSelectIfOptionExists(disqualifyLimitSelect, snapshot.disqualify || '10');
  // 表示モードと表示補助を元に戻す。練習モード（手動調整なし）の場合は applyDisplayPresetMode() が標準値へ戻す。
  setSelectIfOptionExists(displayPresetModeSelect, snapshot.preset || 'practice');
  Object.entries(snapshot.presetDependent || {}).forEach(([id, value]) => {
    setSelectIfOptionExists(document.getElementById(id), value);
  });
  if (typeof applyDisplayPresetMode === 'function') applyDisplayPresetMode();
  if (snapshot.selectionMode === 'manual' && snapshot.currentId) {
    gameState.texts.selectionMode = 'manual';
    applySelectedText(snapshot.currentId);
  } else {
    gameState.texts.selectionMode = 'random';
    applyRandomTextForStart();
  }
  renderChallengePanel();
  if (typeof setConfigControlsDisabled === 'function') setConfigControlsDisabled(false);
  if (typeof initDisplay === 'function') initDisplay();
  if (typeof updateTextSelectionStatus === 'function') updateTextSelectionStatus();
  if (typeof saveCurrentSettings === 'function') saveCurrentSettings();
}

function toggleChallengeMode() {
  if (isChallengeActive()) exitChallengeMode();
  else enterChallengeMode();
}

function renderChallengeHistory(entry) {
  const dom = getChallengeDom();
  if (!dom.historyList) return;
  const attempts = entry && Array.isArray(entry.attempts) ? entry.attempts.slice(0, CHALLENGE_HISTORY_DISPLAY) : [];
  if (!attempts.length) {
    dom.historyList.innerHTML = '<li class="challenge-history-empty">まだ挑戦していません。Escキーか「挑戦する」で始められます。</li>';
    return;
  }
  const bestAt = entry.best ? entry.best.at : '';
  dom.historyList.innerHTML = attempts.map(attempt => {
    const isBest = attempt.status === 'recorded' && attempt.at === bestAt;
    const value = attempt.status === 'recorded' ? `${attempt.net}字` : '—';
    return `<li class="challenge-history-item is-${escapeHtml(attempt.status)}${isBest ? ' is-best' : ''}">`
      + `<span class="challenge-history-time">${escapeHtml(formatChallengeDateTime(attempt.at))}</span>`
      + `<strong class="challenge-history-net">${escapeHtml(value)}</strong>`
      + `<span class="challenge-history-detail">入力${escapeHtml(attempt.inputChars)}字・エラー${escapeHtml(attempt.errorTotal)}件</span>`
      + `<span class="challenge-history-status">${isBest ? '自己ベスト' : escapeHtml(getChallengeStatusLabel(attempt.status))}</span>`
      + '</li>';
  }).join('');
}

function renderChallengePast(store) {
  const dom = getChallengeDom();
  if (!dom.pastList || !dom.past) return;
  const currentId = challengeState.current ? challengeState.current.id : '';
  const entries = Object.keys(store.challenges)
    .filter(id => id !== currentId)
    .map(id => ({ id, ...store.challenges[id] }))
    .sort((a, b) => String(b.start).localeCompare(String(a.start)));
  dom.past.hidden = entries.length === 0;
  dom.pastList.innerHTML = entries.map(entry => {
    const period = Number.isFinite(Date.parse(entry.start)) && Number.isFinite(Date.parse(entry.end))
      ? `${formatChallengeDate(Date.parse(entry.start))}〜${formatChallengeDate(Date.parse(entry.end) - 1)}`
      : '';
    const best = entry.best ? `${entry.best.net}字（エラー${entry.best.errorTotal}件）` : '記録なし';
    return `<li><span>${escapeHtml(period)}　${escapeHtml(entry.title || entry.textId)}</span><strong>${escapeHtml(best)}</strong><small>${escapeHtml(entry.attemptCount)}回挑戦</small></li>`;
  }).join('');
}

function renderChallengePanel() {
  const dom = getChallengeDom();
  if (dom.toggle) {
    dom.toggle.setAttribute('aria-pressed', isChallengeActive() ? 'true' : 'false');
    dom.toggle.textContent = isChallengeActive() ? 'チャレンジ中' : 'チャレンジ';
  }
  if (!dom.panel) return;
  dom.panel.hidden = !isChallengeActive();
  if (!isChallengeActive()) return;

  const nowMs = Date.now();
  const challenge = challengeState.current;
  const store = readChallengeStore();

  if (!challenge) {
    const next = findNextChallenge(challengeState.schedule, nowMs);
    if (dom.period) dom.period.textContent = '// CHALLENGE';
    if (dom.title) dom.title.textContent = '開催中のチャレンジはありません';
    if (dom.rules) {
      dom.rules.textContent = next
        ? `次回は${formatChallengeDate(next.startMs)}から始まります。`
        : '次回の予定はまだ登録されていません。';
    }
    if (dom.bestNet) dom.bestNet.textContent = '—';
    if (dom.bestMeta) dom.bestMeta.textContent = '開催期間中に記録できます';
    if (dom.attemptCount) dom.attemptCount.textContent = '0回';
    if (dom.historyList) dom.historyList.innerHTML = '';
    renderChallengePast(store);
    applyChallengeLocks();
    if (typeof onChallengePanelRendered === 'function') onChallengePanelRendered(null);
    return;
  }

  const item = getChallengeTextItem(challenge);
  const title = item ? item.title : `（課題文章「${challenge.textId}」が見つかりません）`;
  const entry = store.challenges[challenge.id] || null;
  const rules = challenge.rules;
  const minutes = rules.timeLimitSeconds % 60 === 0 ? `${rules.timeLimitSeconds / 60}分` : `${rules.timeLimitSeconds}秒`;

  if (dom.period) dom.period.textContent = `// CHALLENGE　${formatChallengePeriod(challenge)}　${formatChallengeRemaining(challenge, nowMs)}`;
  if (dom.title) dom.title.textContent = title;
  if (dom.rules) {
    dom.rules.textContent = `本番モード（入力中の数値と正誤の色分けは非表示）・制限時間${minutes}・3秒後に開始・エラー${rules.disqualifyLimit}件で失格。純字数が同じ場合はエラーの少ない記録を上位にします。`;
  }
  if (entry && entry.best) {
    if (dom.bestNet) dom.bestNet.textContent = String(entry.best.net);
    if (dom.bestMeta) dom.bestMeta.textContent = `エラー${entry.best.errorTotal}件・${formatChallengeDateTime(entry.best.at)}`;
  } else {
    if (dom.bestNet) dom.bestNet.textContent = '—';
    if (dom.bestMeta) dom.bestMeta.textContent = 'まだ記録がありません';
  }
  if (dom.attemptCount) dom.attemptCount.textContent = `${entry ? entry.attemptCount : 0}回`;
  renderChallengeHistory(entry);
  renderChallengePast(store);
  if (!item) showChallengeMessage('課題文章が見つからないため開始できません。課題データの読み込みを確認してください。');
  applyChallengeLocks();
  if (typeof onChallengePanelRendered === 'function') onChallengePanelRendered(challenge);
}

function hideChallengeResult() {
  const dom = getChallengeDom();
  if (!dom.result) return;
  dom.result.hidden = true;
  dom.result.innerHTML = '';
  dom.result.className = 'challenge-result';
}

// endGame() から呼ばれる。チャレンジ中なら記録を保存し、結果画面に判定を出す。
function handleChallengeResult(resultMetrics, typed = null) {
  if (!isChallengeActive() || !challengeState.current) {
    hideChallengeResult();
    if (typeof prepareRankingRegistration === 'function') prepareRankingRegistration(null);
    return null;
  }
  const challenge = challengeState.current;
  const item = getChallengeTextItem(challenge);
  const attempt = buildChallengeAttempt(resultMetrics);
  const outcome = addChallengeAttempt(readChallengeStore(), challenge, attempt, item ? item.title : '');
  writeChallengeStore(outcome.store);

  const dom = getChallengeDom();
  if (dom.result) {
    let heading = '';
    let detail = '';
    let tone = 'normal';
    const prev = outcome.previousBest;
    if (attempt.status === 'aborted') {
      heading = '中断したため、今回は記録の対象外です';
      detail = '制限時間まで打ち切ると記録になります。';
      tone = 'muted';
    } else if (attempt.status === 'disqualified') {
      heading = `エラーが${challenge.rules.disqualifyLimit}件以上のため失格です`;
      detail = prev ? `自己ベストは${prev.net}字のままです。` : '挑戦回数には数えています。';
      tone = 'muted';
    } else if (outcome.isNewBest && prev) {
      const diff = attempt.net - prev.net;
      heading = `自己ベスト更新：純字数${attempt.net}字`;
      detail = diff > 0 ? `前回の自己ベスト${prev.net}字から${diff}字伸びました。` : `純字数は同じで、エラーが${prev.errorTotal - attempt.errorTotal}件少なくなりました。`;
      tone = 'best';
    } else if (outcome.isNewBest) {
      heading = `初記録：純字数${attempt.net}字`;
      detail = 'この期間の自己ベストとして保存しました。';
      tone = 'best';
    } else {
      heading = `純字数${attempt.net}字`;
      detail = prev ? `自己ベスト${prev.net}字まで、あと${Math.max(0, prev.net - attempt.net)}字です。` : '';
    }
    dom.result.className = `challenge-result is-${tone}`;
    dom.result.innerHTML = `<p class="challenge-result-kicker">// CHALLENGE　${escapeHtml(formatChallengePeriod(challenge))}</p>`
      + `<p class="challenge-result-heading">${escapeHtml(heading)}</p>`
      + (detail ? `<p class="challenge-result-detail">${escapeHtml(detail)}</p>` : '');
    dom.result.hidden = false;
  }
  renderChallengePanel();
  // ランキング登録（85-ranking.js）。正規終了かつ失格でない記録のときだけ登録欄を出す。
  if (typeof prepareRankingRegistration === 'function') {
    prepareRankingRegistration({ challenge, attempt, typed, clientNet: attempt.net });
  }
  return outcome;
}

async function loadChallengeSchedule() {
  try {
    const response = await fetch(`${CHALLENGE_SCHEDULE_URL}?v=20261004-challenge`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = normalizeChallengeSchedule(await response.json());
    if (parsed.challenges.length) {
      challengeState.schedule = parsed;
      challengeState.scheduleSource = 'json';
    }
  } catch (error) {
    console.warn('チャレンジのスケジュールを読み込めませんでした。内蔵の予備データを使います。', error);
  }
  if (isChallengeActive() && !isChallengeMeasuring()) {
    refreshCurrentChallenge();
    applyChallengeRulesToControls();
    applyChallengeText();
    renderChallengePanel();
  }
}

function initChallengeMode() {
  const dom = getChallengeDom();
  if (dom.toggle) dom.toggle.addEventListener('click', toggleChallengeMode);
  if (dom.exitButton) dom.exitButton.addEventListener('click', exitChallengeMode);
  if (dom.startButton) {
    dom.startButton.addEventListener('click', () => {
      if (typeof startGame === 'function') startGame();
    });
  }
  renderChallengePanel();
  loadChallengeSchedule();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__CHALLENGE_TEST__) {
  if (typeof runInitialUiStep === 'function') runInitialUiStep('チャレンジモード', initChallengeMode);
  else initChallengeMode();
}
