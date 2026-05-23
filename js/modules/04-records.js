// 自己ベスト・直近50回履歴の保存
// localStorage には成績の要約だけを保存し、入力本文や課題文本文は保存しない。

const RECORDS_STORAGE_KEY = 'long-type:records:v1';
const HISTORY_LIMIT = 50;
const PER_TEXT_HISTORY_LIMIT = 10;

function readRecordsStore() {
  if (typeof canUseLocalStorage === 'function' && !canUseLocalStorage()) {
    return { version: 1, bests: {}, history: [], perText: {} };
  }
  try {
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return { version: 1, bests: {}, history: [], perText: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, bests: {}, history: [], perText: {} };
    return {
      version: 1,
      bests: parsed.bests && typeof parsed.bests === 'object' ? parsed.bests : {},
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, HISTORY_LIMIT) : [],
      perText: parsed.perText && typeof parsed.perText === 'object' ? normalizePerTextStats(parsed.perText) : {}
    };
  } catch (error) {
    console.warn('成績履歴の読み込みに失敗しました。履歴を初期化します。', error);
    try { window.localStorage.removeItem(RECORDS_STORAGE_KEY); } catch (_) {}
    return { version: 1, bests: {}, history: [], perText: {} };
  }
}

function writeRecordsStore(store) {
  if (typeof canUseLocalStorage === 'function' && !canUseLocalStorage()) return false;
  try {
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      bests: store.bests || {},
      history: Array.isArray(store.history) ? store.history.slice(0, HISTORY_LIMIT) : [],
      perText: store.perText && typeof store.perText === 'object' ? normalizePerTextStats(store.perText) : {}
    }));
    return true;
  } catch (error) {
    console.warn('成績履歴の保存に失敗しました。', error);
    return false;
  }
}


function cloneRecordSummary(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    id: record.id || '',
    date: record.date || '',
    textId: record.textId || '',
    title: record.title || '課題文',
    condition: record.condition || '',
    mode: record.mode || '',
    durationSeconds: getRecordDurationSeconds(record),
    elapsedSeconds: getRecordDurationSeconds(record),
    startedAt: record.startedAt || '',
    endedAt: record.endedAt || '',
    inputChars: Number(record.inputChars || 0),
    correct: Number(record.correct || 0),
    accuracy: Number(record.accuracy || 0),
    cpm: Number(record.cpm || 0),
    cps: Number(record.cps || 0),
    backspace: Number(record.backspace || 0),
    errorTotal: Number(record.errorTotal || 0),
    net: Number(record.net || 0),
    judge: record.judge || '通常',
    isCompleted: record.isCompleted === true
  };
}

function normalizeTextStats(stats, fallbackTextId = '') {
  const source = stats && typeof stats === 'object' ? stats : {};
  const history = Array.isArray(source.history)
    ? source.history.map(cloneRecordSummary).filter(Boolean).slice(0, PER_TEXT_HISTORY_LIMIT)
    : [];
  return {
    textId: source.textId || fallbackTextId,
    title: source.title || (history[0] && history[0].title) || '課題文',
    count: Number.isFinite(Number(source.count)) ? Number(source.count) : history.length,
    latest: cloneRecordSummary(source.latest) || history[0] || null,
    bestCpm: cloneRecordSummary(source.bestCpm) || history.reduce((best, record) => isBetterCpm(record, best) ? record : best, null),
    bestAccuracy: cloneRecordSummary(source.bestAccuracy) || history.reduce((best, record) => isBetterAccuracy(record, best) ? record : best, null),
    history
  };
}

function normalizePerTextStats(perText) {
  const normalized = {};
  Object.entries(perText || {}).forEach(([textId, stats]) => {
    if (!textId) return;
    normalized[textId] = normalizeTextStats(stats, textId);
  });
  return normalized;
}

function updatePerTextStats(store, record) {
  if (!record || !record.textId) return;
  if (!store.perText || typeof store.perText !== 'object') store.perText = {};
  const previous = normalizeTextStats(store.perText[record.textId], record.textId);
  const recordSummary = cloneRecordSummary(record);
  previous.textId = record.textId;
  previous.title = record.title || previous.title || '課題文';
  previous.count = Math.max(0, Number(previous.count || 0)) + 1;
  previous.latest = recordSummary;
  previous.history = [recordSummary, ...previous.history.filter(r => r && r.id !== record.id)].slice(0, PER_TEXT_HISTORY_LIMIT);
  if (isBetterCpm(recordSummary, previous.bestCpm)) previous.bestCpm = recordSummary;
  if (isBetterAccuracy(recordSummary, previous.bestAccuracy)) previous.bestAccuracy = recordSummary;
  store.perText[record.textId] = previous;
}

function makeConditionLabel() {
  if (typeof isCompleteMode === 'function' && isCompleteMode()) return '全文打ち切り';
  const seconds = timeSelect ? parseInt(timeSelect.value, 10) : 180;
  return Number.isFinite(seconds) ? formatSeconds(seconds) : '時間指定';
}

function createResultRecord(metrics) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    textId: gameState.texts.currentId || '',
    title: gameState.texts.currentTitle || '課題文',
    condition: makeConditionLabel(),
    mode: displayPresetModeSelect ? displayPresetModeSelect.value : '',
    durationSeconds: Math.round(metrics.durationSeconds ?? metrics.elapsed ?? 0),
    elapsedSeconds: Math.round(metrics.elapsed ?? metrics.durationSeconds ?? 0),
    startedAt: metrics.startedAt || '',
    endedAt: metrics.endedAt || new Date().toISOString(),
    inputChars: metrics.inputChars || 0,
    correct: metrics.correct || 0,
    accuracy: metrics.accuracy || 0,
    cpm: metrics.cpm || 0,
    cps: Number(metrics.cps || 0),
    backspace: metrics.backspace || 0,
    errorTotal: metrics.errorTotal || 0,
    net: metrics.net || 0,
    judge: metrics.isDisqualified ? '失格' : (metrics.errorTotal === 0 && metrics.net >= 1000 ? '正確賞' : '通常'),
    isCompleted: metrics.isCompleted === true
  };
}

function isBetterCpm(a, b) {
  if (!b) return true;
  if (a.cpm !== b.cpm) return a.cpm > b.cpm;
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy;
  if (a.errorTotal !== b.errorTotal) return a.errorTotal < b.errorTotal;
  return a.correct > b.correct;
}

function isBetterAccuracy(a, b) {
  if (!b) return true;
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy;
  if (a.errorTotal !== b.errorTotal) return a.errorTotal < b.errorTotal;
  return a.cpm > b.cpm;
}

function isErrorBestEligible(record) {
  // 「最少エラー」は途中終了や極端に短い入力では更新しない。
  // 課題文の最後まで到達した記録だけを対象にする。
  return !!(record && record.isCompleted === true);
}

function isBetterError(a, b) {
  if (!isErrorBestEligible(a)) return false;
  if (!isErrorBestEligible(b)) return true;
  if (a.errorTotal !== b.errorTotal) return a.errorTotal < b.errorTotal;
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy;
  return a.cpm > b.cpm;
}

function saveResultRecord(metrics) {
  const record = createResultRecord(metrics);
  const store = readRecordsStore();
  const before = { ...store.bests };
  store.history = [record, ...store.history].slice(0, HISTORY_LIMIT);
  updatePerTextStats(store, record);
  if (isBetterCpm(record, store.bests.cpm)) store.bests.cpm = record;
  if (isBetterAccuracy(record, store.bests.accuracy)) store.bests.accuracy = record;
  if (isBetterError(record, store.bests.error)) store.bests.error = record;
  const saved = writeRecordsStore(store);
  renderRecords(record, store, {
    saved,
    newCpmBest: store.bests.cpm && store.bests.cpm.id === record.id && (!before.cpm || before.cpm.id !== record.id),
    newAccuracyBest: store.bests.accuracy && store.bests.accuracy.id === record.id && (!before.accuracy || before.accuracy.id !== record.id),
    newErrorBest: store.bests.error && store.bests.error.id === record.id && (!before.error || before.error.id !== record.id)
  });
  return record;
}

function formatRecordDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function getRecordDurationSeconds(record) {
  if (!record) return 0;
  const duration = Number(record.durationSeconds ?? record.elapsedSeconds ?? 0);
  return Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
}

function renderBestCard(prefix, record, emptyLabel) {
  setText(document.getElementById(`${prefix}-value`), record ? emptyLabel(record) : '—');
  setText(document.getElementById(`${prefix}-meta`), record ? `${formatRecordDate(record.date)} / ${record.condition} / ${formatSeconds(getRecordDurationSeconds(record))}` : 'まだ記録がありません');
  setText(document.getElementById(`${prefix}-title`), record ? record.title : '—');
}

function makeUniqueRecords(records) {
  const seen = new Set();
  return (Array.isArray(records) ? records : []).filter(record => {
    if (!record) return false;
    const key = record.id || `${record.date}-${record.textId}-${record.cpm}-${record.accuracy}-${record.errorTotal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRecordModeLabel(mode) {
  const raw = String(mode || '');
  if (raw === 'practice') return '練習';
  if (raw === 'competition') return '本番';
  if (raw === 'custom') return 'カスタム';
  return raw || '—';
}

function getBestOnlyRecords(store) {
  const bests = store && store.bests ? store.bests : {};
  return makeUniqueRecords([bests.cpm, bests.accuracy, bests.error].filter(Boolean));
}

function getFilteredRecords(store) {
  const filter = (typeof recordFilterMode !== 'undefined' && recordFilterMode) ? recordFilterMode.value : 'all';
  const history = Array.isArray(store.history) ? store.history.slice() : [];
  if (filter === 'bestOnly') return getBestOnlyRecords(store);
  if (filter === 'currentText') {
    const currentId = gameState && gameState.texts ? gameState.texts.currentId : '';
    return history.filter(record => record && record.textId === currentId);
  }
  if (filter === 'practice') return history.filter(record => record && record.mode === 'practice');
  if (filter === 'competition') return history.filter(record => record && record.mode === 'competition');
  return history;
}

function sortRecords(records) {
  const mode = (typeof recordSortMode !== 'undefined' && recordSortMode) ? recordSortMode.value : 'dateDesc';
  const sorted = (Array.isArray(records) ? records.slice() : []);
  const byDate = record => {
    const time = new Date(record.date || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  };
  const byNumber = (record, key) => Number(record && record[key] || 0);
  sorted.sort((a, b) => {
    if (mode === 'dateAsc') return byDate(a) - byDate(b);
    if (mode === 'cpmDesc') return byNumber(b, 'cpm') - byNumber(a, 'cpm') || byDate(b) - byDate(a);
    if (mode === 'accuracyDesc') return byNumber(b, 'accuracy') - byNumber(a, 'accuracy') || byNumber(a, 'errorTotal') - byNumber(b, 'errorTotal');
    if (mode === 'errorAsc') return byNumber(a, 'errorTotal') - byNumber(b, 'errorTotal') || byNumber(b, 'accuracy') - byNumber(a, 'accuracy');
    if (mode === 'durationDesc') return getRecordDurationSeconds(b) - getRecordDurationSeconds(a) || byDate(b) - byDate(a);
    return byDate(b) - byDate(a);
  });
  return sorted;
}

function updateRecordSummary(records) {
  const list = Array.isArray(records) ? records : [];
  const count = list.length;
  setText(typeof recordSummaryCount !== 'undefined' ? recordSummaryCount : null, String(count));
  if (!count) {
    setText(typeof recordSummaryCpm !== 'undefined' ? recordSummaryCpm : null, '—');
    setText(typeof recordSummaryAccuracy !== 'undefined' ? recordSummaryAccuracy : null, '—');
    setText(typeof recordSummaryError !== 'undefined' ? recordSummaryError : null, '—');
    return;
  }
  const avg = key => list.reduce((sum, record) => sum + Number(record[key] || 0), 0) / count;
  setText(typeof recordSummaryCpm !== 'undefined' ? recordSummaryCpm : null, String(Math.round(avg('cpm'))));
  setText(typeof recordSummaryAccuracy !== 'undefined' ? recordSummaryAccuracy : null, `${avg('accuracy').toFixed(1)}%`);
  setText(typeof recordSummaryError !== 'undefined' ? recordSummaryError : null, avg('errorTotal').toFixed(1));
}

function getRecordFilterLabel() {
  if (typeof recordFilterMode === 'undefined' || !recordFilterMode) return '直近５０回の履歴';
  const selected = recordFilterMode.options[recordFilterMode.selectedIndex];
  return selected ? selected.textContent : '直近５０回の履歴';
}

function getRecordGraphMetricConfig() {
  const metric = (typeof recordGraphMetric !== 'undefined' && recordGraphMetric) ? recordGraphMetric.value : 'cpm';
  const configs = {
    cpm: { key: 'cpm', label: 'CPM', title: 'CPMの遷移', suffix: '', decimals: 0 },
    errorTotal: { key: 'errorTotal', label: 'ミス数', title: 'ミス数の遷移', suffix: '件', decimals: 0 },
    accuracy: { key: 'accuracy', label: '正確率', title: '正確率の遷移', suffix: '%', decimals: 1, maxFixed: 100 },
    durationSeconds: { key: 'durationSeconds', label: '練習時間', title: '練習時間の遷移', suffix: '秒', decimals: 0, valueOf: getRecordDurationSeconds }
  };
  return configs[metric] || configs.cpm;
}

function formatRecordGraphValue(value, config) {
  const n = Number(value || 0);
  if (config.key === 'durationSeconds') return formatSeconds(n);
  if (config.decimals && Math.abs(n - Math.round(n)) > 0.05) return `${n.toFixed(config.decimals)}${config.suffix || ''}`;
  return `${Math.round(n)}${config.suffix || ''}`;
}

function drawRecordLineChart(records) {
  if (typeof recordLineChart === 'undefined' || !recordLineChart) return;
  const config = getRecordGraphMetricConfig();
  setText(typeof recordGraphTitle !== 'undefined' ? recordGraphTitle : null, `グラフ：${config.title}`);
  setText(typeof recordGraphLegend !== 'undefined' ? recordGraphLegend : null, config.label);
  const canvas = recordLineChart;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 260;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const styles = getComputedStyle(document.body);
  const colAccent = styles.getPropertyValue('--accent').trim() || '#4fd1c5';
  const colAccent2 = styles.getPropertyValue('--accent2').trim() || '#f6ad55';
  const colBorder = styles.getPropertyValue('--border').trim() || '#2a3045';
  const colDim = styles.getPropertyValue('--text-dim').trim() || '#718096';
  const colText = styles.getPropertyValue('--text').trim() || '#e2e8f0';

  const chronological = (Array.isArray(records) ? records.slice() : []).sort((a, b) => {
    const at = new Date(a.date || 0).getTime();
    const bt = new Date(b.date || 0).getTime();
    return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
  });
  const values = chronological.map(record => {
    const raw = config.valueOf ? config.valueOf(record) : Number(record[config.key] || 0);
    return Number.isFinite(Number(raw)) ? Number(raw) : 0;
  });

  const padL = 54, padR = 18, padT = 18, padB = 42;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  ctx.font = '12px "Noto Sans JP", sans-serif';
  ctx.fillStyle = colDim;

  if (!chronological.length) {
    setText(typeof recordGraphNote !== 'undefined' ? recordGraphNote : null, '条件に合う履歴がないため、グラフは表示できません。');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('条件に合う履歴がありません', cssW / 2, cssH / 2);
    return;
  }
  setText(typeof recordGraphNote !== 'undefined' ? recordGraphNote : null, `${chronological.length}件の履歴を古い順に表示しています。表の並び替えとは別に、推移が読み取りやすい順序で描画します。`);

  const rawMax = Math.max(...values, config.maxFixed ? config.maxFixed : 0, 1);
  const rawMin = Math.min(...values, 0);
  const niceMaxValue = config.maxFixed || (typeof niceCeil === 'function' ? niceCeil(rawMax * 1.12) : Math.ceil(rawMax * 1.12));
  const minValue = rawMin < 0 ? rawMin : 0;
  const span = Math.max(1, niceMaxValue - minValue);
  const xOf = (i) => padL + (chronological.length === 1 ? plotW / 2 : (i / (chronological.length - 1)) * plotW);
  const yOf = (v) => padT + plotH - ((v - minValue) / span) * plotH;

  ctx.lineWidth = 1;
  ctx.strokeStyle = colBorder;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = minValue + (span / 4) * i;
    const y = yOf(v);
    ctx.globalAlpha = i === 0 ? 0.8 : 0.32;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colDim;
    ctx.fillText(formatRecordGraphValue(v, config), padL - 8, y);
  }

  const labelEvery = Math.max(1, Math.ceil(chronological.length / 8));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  chronological.forEach((record, i) => {
    const x = xOf(i);
    if (i % labelEvery === 0 || i === chronological.length - 1) {
      ctx.strokeStyle = colBorder;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colDim;
      ctx.fillText(formatRecordDate(record.date), x, padT + plotH + 8);
    }
  });

  if (chronological.length >= 2) {
    ctx.strokeStyle = colAccent;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = xOf(i), y = yOf(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  const dotEvery = values.length > 50 ? Math.ceil(values.length / 50) : 1;
  values.forEach((v, i) => {
    if (i % dotEvery !== 0 && i !== values.length - 1) return;
    ctx.fillStyle = i === values.length - 1 ? colAccent2 : colAccent;
    ctx.beginPath();
    ctx.arc(xOf(i), yOf(v), i === values.length - 1 ? 4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  });

  const lastIndex = values.length - 1;
  const lastValue = values[lastIndex];
  ctx.fillStyle = colText;
  ctx.textAlign = lastIndex === 0 ? 'center' : 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`最新 ${formatRecordGraphValue(lastValue, config)}`, xOf(lastIndex), Math.max(14, yOf(lastValue) - 8));
}

function renderRecordHistory(store, currentRecord = null) {
  if (!recordHistoryBody) return;
  const filtered = getFilteredRecords(store);
  const records = sortRecords(filtered);
  updateRecordSummary(records);
  drawRecordLineChart(filtered);
  setText(typeof recordHistoryTitle !== 'undefined' ? recordHistoryTitle : null, `履歴：${getRecordFilterLabel()}`);
  if (!records.length) {
    recordHistoryBody.innerHTML = '<tr><td colspan="8" class="record-empty">条件に合う履歴がありません</td></tr>';
    return;
  }
  recordHistoryBody.innerHTML = records.map((r, index) => `
    <tr class="${currentRecord && r.id === currentRecord.id ? 'is-current' : ''}">
      <td>${index + 1}</td>
      <td>${formatRecordDate(r.date)}</td>
      <td>${escapeHtml(r.title || '—')}<br><small class="record-row-sub">${getRecordModeLabel(r.mode)}</small></td>
      <td>${escapeHtml(r.condition || '—')}</td>
      <td>${formatSeconds(getRecordDurationSeconds(r))}</td>
      <td>${r.cpm ?? 0}</td>
      <td>${r.accuracy ?? 0}%</td>
      <td>${r.errorTotal ?? 0}</td>
    </tr>
  `).join('');
}

function renderRecords(currentRecord, store, flags = {}) {
  const bests = store.bests || {};
  const bestMessages = [];
  if (flags.newCpmBest) bestMessages.push('最高CPM更新');
  if (flags.newAccuracyBest) bestMessages.push('最高正確率更新');
  if (flags.newErrorBest) bestMessages.push('最少エラー更新');
  if (flags.updateNote !== false) {
    setText(recordCurrentNote, flags.saved
      ? (bestMessages.length ? `今回の結果を保存しました。${bestMessages.join('・')}です。` : '今回の結果を保存しました。')
      : 'localStorage が利用できないため、この端末には保存できませんでした。');
  }

  renderBestCard('best-cpm', bests.cpm, r => String(r.cpm));
  renderBestCard('best-accuracy', bests.accuracy, r => `${r.accuracy}%`);
  renderBestCard('best-error', bests.error, r => `${r.errorTotal}件`);
  renderRecordHistory(store, currentRecord);
}

function refreshRecordsView() {
  renderRecords(null, readRecordsStore(), { saved: true, updateNote: false });
}
function getRecordsForText(textId) {
  const store = readRecordsStore();
  const stats = getStatsForTextFromStore(store, textId);
  if (stats && Array.isArray(stats.history) && stats.history.length) return stats.history;
  const history = Array.isArray(store.history) ? store.history : [];
  return history.filter(record => record && record.textId === textId);
}

function getStatsForTextFromStore(store, textId) {
  if (!textId || !store || !store.perText || typeof store.perText !== 'object') return null;
  return store.perText[textId] ? normalizeTextStats(store.perText[textId], textId) : null;
}

function getStatsForText(textId) {
  const store = readRecordsStore();
  const storedStats = getStatsForTextFromStore(store, textId);
  if (storedStats && storedStats.count) return storedStats;
  const history = Array.isArray(store.history) ? store.history.filter(record => record && record.textId === textId) : [];
  if (!history.length) return storedStats;
  return normalizeTextStats({
    textId,
    title: history[0].title || '課題文',
    count: history.length,
    latest: history[0],
    bestCpm: history.reduce((best, record) => isBetterCpm(record, best) ? record : best, null),
    bestAccuracy: history.reduce((best, record) => isBetterAccuracy(record, best) ? record : best, null),
    history
  }, textId);
}

function getLatestRecordForText(textId) {
  const stats = getStatsForText(textId);
  if (stats && stats.latest) return stats.latest;
  return getRecordsForText(textId)[0] || null;
}

function getBestCpmRecordForText(textId) {
  const stats = getStatsForText(textId);
  if (stats && stats.bestCpm) return stats.bestCpm;
  return getRecordsForText(textId).reduce((best, record) => isBetterCpm(record, best) ? record : best, null);
}

function getBestAccuracyRecordForText(textId) {
  const stats = getStatsForText(textId);
  if (stats && stats.bestAccuracy) return stats.bestAccuracy;
  return getRecordsForText(textId).reduce((best, record) => isBetterAccuracy(record, best) ? record : best, null);
}

function formatLibraryRecordSummary(record) {
  if (!record) return '記録なし';
  return `${record.cpm ?? 0} CPM／正確率 ${record.accuracy ?? 0}%／${formatSeconds(getRecordDurationSeconds(record))}／${formatRecordDate(record.date)}`;
}

function formatTextStatsSummary(textId) {
  const stats = getStatsForText(textId);
  if (!stats || !stats.count) return '練習回数：0回／最高CPM：—／最高正確率：—／最終練習：—';
  const bestCpm = stats.bestCpm ? `${stats.bestCpm.cpm ?? 0}` : '—';
  const bestAccuracy = stats.bestAccuracy ? `${stats.bestAccuracy.accuracy ?? 0}%` : '—';
  const latestDate = stats.latest ? formatRecordDate(stats.latest.date) : '—';
  return `練習回数：${stats.count}回／最高CPM：${bestCpm}／最高正確率：${bestAccuracy}／最終練習：${latestDate}`;
}




let recordsReturnMode = 'home';

function showRecordsScreen(returnMode = 'home') {
  recordsReturnMode = returnMode === 'result' ? 'result' : 'home';
  const store = readRecordsStore();
  renderRecords(null, store, { saved: true });
  if (recordCurrentNote) {
    recordCurrentNote.textContent = store.history && store.history.length
      ? '保存済みの自己ベストと直近５０回の履歴を表示しています。'
      : 'まだ保存済みの履歴がありません。練習を終えると、この画面に記録が表示されます。';
  }
  document.body.classList.remove('result-mode', 'focus-mode');
  document.body.classList.add('records-mode');
  if (typeof resultScreen !== 'undefined' && resultScreen) resultScreen.style.display = 'none';
  if (typeof recordsScreen !== 'undefined' && recordsScreen) recordsScreen.style.display = 'block';
  if (typeof typingArea !== 'undefined' && typingArea) {
    typingArea.disabled = true;
    typingArea.blur();
  }
  if (window && typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeRecordsScreen(toHome = false) {
  document.body.classList.remove('records-mode');
  if (typeof recordsScreen !== 'undefined' && recordsScreen) recordsScreen.style.display = 'none';
  if (!toHome && recordsReturnMode === 'result' && typeof resultScreen !== 'undefined' && resultScreen) {
    document.body.classList.add('result-mode');
    resultScreen.style.display = 'block';
  } else {
    document.body.classList.remove('result-mode', 'focus-mode');
    if (typeof resultScreen !== 'undefined' && resultScreen) resultScreen.style.display = 'none';
    if (typeof setConfigControlsDisabled === 'function') setConfigControlsDisabled(false);
    if (typeof initDisplay === 'function') initDisplay();
  }
  if (window && typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (typeof btnOpenRecordsHome !== 'undefined' && btnOpenRecordsHome) {
  btnOpenRecordsHome.addEventListener('click', () => showRecordsScreen('home'));
}
if (typeof btnOpenRecordsResult !== 'undefined' && btnOpenRecordsResult) {
  btnOpenRecordsResult.addEventListener('click', () => showRecordsScreen('result'));
}
if (typeof btnRecordBack !== 'undefined' && btnRecordBack) {
  btnRecordBack.addEventListener('click', () => closeRecordsScreen(false));
}
if (typeof btnRecordHome !== 'undefined' && btnRecordHome) {
  btnRecordHome.addEventListener('click', () => closeRecordsScreen(true));
}


if (typeof recordFilterMode !== 'undefined' && recordFilterMode) {
  recordFilterMode.addEventListener('change', refreshRecordsView);
}
if (typeof recordSortMode !== 'undefined' && recordSortMode) {
  recordSortMode.addEventListener('change', refreshRecordsView);
}
if (typeof recordGraphMetric !== 'undefined' && recordGraphMetric) {
  recordGraphMetric.addEventListener('change', refreshRecordsView);
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('resize', () => {
    if (document.body.classList.contains('records-mode')) refreshRecordsView();
  });
}

function renderStoredRecordsOnLoad() {
  const store = readRecordsStore();
  renderRecords(null, store, { saved: true });
  if (recordCurrentNote) {
    recordCurrentNote.textContent = store.history && store.history.length
      ? '保存済みの自己ベストと直近５０回の履歴を表示しています。'
      : '今回の結果を保存し、自己ベストと直近５０回の履歴を表示します。';
  }
}
