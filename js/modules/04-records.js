// 自己ベスト・直近50回履歴の保存
// localStorage には成績の要約だけを保存し、入力本文や課題文本文は保存しない。

const RECORDS_STORAGE_KEY = 'long-type:records:v1';
const HISTORY_LIMIT = 50;
const PER_TEXT_HISTORY_LIMIT = 10;
const RECORD_HISTORY_PAGE_SIZE = 10;
let recordHistoryPage = 1;
let recordRankingConditionKey = '';


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
      history: Array.isArray(parsed.history) ? parsed.history.map(cloneRecordSummary).filter(Boolean).slice(0, HISTORY_LIMIT) : [],
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


function makeEmptyRecordsStore() {
  return { version: 1, bests: {}, history: [], perText: {} };
}

function resetRecordsStore() {
  if (typeof canUseLocalStorage === 'function' && !canUseLocalStorage()) return false;
  try {
    window.localStorage.removeItem(RECORDS_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn('成績履歴のリセットに失敗しました。', error);
    return false;
  }
}

function confirmRecordsReset(store) {
  const historyCount = store && Array.isArray(store.history) ? store.history.length : 0;
  if (!historyCount) {
    if (recordCurrentNote) recordCurrentNote.textContent = 'リセットできる保存済みの履歴はありません。';
    return false;
  }
  const message = `この端末に保存された自己ベスト・直近履歴・課題別記録（${historyCount}件）をすべて削除します。元に戻せません。`;
  if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(message)) return false;
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    const typed = window.prompt('削除を実行するには「記録をリセット」と入力してください。');
    if (typed !== '記録をリセット') {
      if (recordCurrentNote) recordCurrentNote.textContent = '入力が一致しなかったため、記録のリセットを中止しました。';
      return false;
    }
  }
  return true;
}

function handleRecordsReset() {
  const store = readRecordsStore();
  if (!confirmRecordsReset(store)) return;
  const ok = resetRecordsStore();
  renderRecords(null, makeEmptyRecordsStore(), { saved: true, updateNote: false });
  if (recordCurrentNote) {
    recordCurrentNote.textContent = ok
      ? 'この端末に保存されていた記録をリセットしました。次回の練習結果から新しく保存されます。'
      : 'localStorage が利用できないため、記録をリセットできませんでした。';
  }
}


function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = coerceFiniteNumber(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function coerceFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string') {
    const normalized = value
      .replace(/[０-９．－＋]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/,/g, '')
      .trim();
    const direct = Number(normalized);
    if (Number.isFinite(direct)) return direct;
    const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }
  return NaN;
}

function readNestedValue(source, path) {
  if (!source || typeof source !== 'object') return undefined;
  return path.split('.').reduce((obj, key) => (obj && typeof obj === 'object') ? obj[key] : undefined, source);
}

function getFirstPositiveNumber(...values) {
  for (const value of values) {
    const n = coerceFiniteNumber(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

function parseDurationLikeSeconds(value) {
  const direct = coerceFiniteNumber(value);
  if (Number.isFinite(direct)) return direct;
  if (typeof value !== 'string') return NaN;
  const normalized = value
    .replace(/[０-９：]/g, ch => ch === '：' ? ':' : String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .trim();
  const parts = normalized.split(':').map(part => Number(part));
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

function getRecordCpmValue(record) {
  if (!record || typeof record !== 'object') return 0;
  const cpmCandidates = [
    record.cpm,
    record.avgCpm,
    record.averageCpm,
    record.charsPerMinute,
    record.speed,
    readNestedValue(record, 'stats.cpm'),
    readNestedValue(record, 'stats.avgCpm'),
    readNestedValue(record, 'result.cpm'),
    readNestedValue(record, 'result.avgCpm'),
    readNestedValue(record, 'metrics.cpm')
  ];
  // 旧データでは record.cpm だけ 0 のまま、別フィールドに実CPMが入っていることがある。
  // そのため「最初の有限値」ではなく「正の値」を優先して採用する。
  const directPositive = getFirstPositiveNumber(...cpmCandidates);
  if (Number.isFinite(directPositive)) return Math.round(directPositive);

  const correct = getFirstPositiveNumber(
    record.correct, record.correctCount, record.correctChars, record.net, record.inputChars,
    readNestedValue(record, 'stats.correct'), readNestedValue(record, 'result.correct')
  );
  const seconds = getFirstPositiveNumber(
    record.durationSeconds, record.elapsedSeconds, record.elapsed, record.time, record.seconds,
    readNestedValue(record, 'stats.elapsedSeconds'), readNestedValue(record, 'result.elapsedSeconds'),
    parseDurationLikeSeconds(record.durationLabel), parseDurationLikeSeconds(record.timeLabel), parseDurationLikeSeconds(record.condition)
  );
  if (Number.isFinite(correct) && Number.isFinite(seconds) && correct > 0 && seconds > 0) {
    return Math.round((correct / seconds) * 60);
  }
  return Math.round(firstFiniteNumber(...cpmCandidates));
}

function getRecordAccuracyValue(record) {
  return firstFiniteNumber(record && record.accuracy, record && record.acc, record && record.accuracyRate, readNestedValue(record, 'stats.accuracy'), readNestedValue(record, 'result.accuracy'));
}

function getRecordErrorValue(record) {
  return firstFiniteNumber(record && record.errorTotal, record && record.errors, record && record.errorCount, record && record.miss, record && record.missCount, record && record.mistakes, readNestedValue(record, 'stats.errorTotal'), readNestedValue(record, 'result.errorTotal'));
}

function getRecordGraphValue(record, config) {
  if (!record || !config) return 0;
  if (Object.prototype.hasOwnProperty.call(config, 'valueOf') && typeof config.valueOf === 'function') return config.valueOf(record);
  if (config.key === 'cpm') return getRecordCpmValue(record);
  if (config.key === 'accuracy') return getRecordAccuracyValue(record);
  if (config.key === 'errorTotal') return getRecordErrorValue(record);
  return firstFiniteNumber(record[config.key]);
}

function cloneRecordSummary(record) {
  if (!record || typeof record !== 'object') return null;
  const durationSeconds = getRecordDurationSeconds(record);
  const correct = firstFiniteNumber(record.correct, record.correctCount, record.correctChars, record.net);
  const inputChars = firstFiniteNumber(record.inputChars, record.typedChars, record.totalTyped, record.totalChars, correct);
  const cpm = getRecordCpmValue(record);
  const cps = firstFiniteNumber(record.cps, cpm ? cpm / 60 : 0);
  const errorTotal = getRecordErrorValue(record);
  const accuracy = getRecordAccuracyValue(record);
  return {
    id: record.id || '',
    date: record.date || record.endedAt || record.createdAt || '',
    textId: record.textId || record.taskId || '',
    title: record.title || record.textTitle || '課題文',
    condition: record.condition || record.modeLabel || '',
    mode: record.mode || '',
    durationSeconds,
    elapsedSeconds: durationSeconds,
    startedAt: record.startedAt || '',
    endedAt: record.endedAt || '',
    inputChars,
    correct,
    accuracy,
    cpm,
    cps,
    backspace: firstFiniteNumber(record.backspace, record.backspaceCount),
    errorTotal,
    net: firstFiniteNumber(record.net, correct),
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
  // 「最少エラー」のベスト記録は途中終了や極端に短い入力では更新しない。
  // 課題文の最後まで到達した記録だけを対象にする。
  return !!(record && record.isCompleted === true);
}

function isErrorRankingEligible(record) {
  // 自己ランキングの「最少エラー」は、記録画面に保存された有効な記録を対象にする。
  // ベスト記録とは異なり、途中中断の練習結果も比較できるようにする。
  if (!record) return false;
  const errorTotal = getRecordErrorValue(record);
  const inputChars = firstFiniteNumber(record.inputChars, record.typedChars, record.totalTyped, record.totalChars, record.correct, record.net);
  return Number.isFinite(Number(errorTotal)) && Number.isFinite(Number(inputChars)) && Number(inputChars) > 0;
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
  const beforeCpm = before.cpm ? getRecordCpmValue(before.cpm) : null;
  const beforeAccuracy = before.accuracy ? getRecordAccuracyValue(before.accuracy) : null;
  const beforeError = before.error ? getRecordErrorValue(before.error) : null;
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
    newErrorBest: store.bests.error && store.bests.error.id === record.id && (!before.error || before.error.id !== record.id),
    previousCpm: beforeCpm,
    previousAccuracy: beforeAccuracy,
    previousError: beforeError
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
  const byNumber = (record, key) => key === 'cpm' ? getRecordCpmValue(record) : (key === 'accuracy' ? getRecordAccuracyValue(record) : (key === 'errorTotal' ? getRecordErrorValue(record) : firstFiniteNumber(record && record[key])));
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
  const avg = getter => list.reduce((sum, record) => sum + getter(record), 0) / count;
  setText(typeof recordSummaryCpm !== 'undefined' ? recordSummaryCpm : null, String(Math.round(avg(getRecordCpmValue))));
  setText(typeof recordSummaryAccuracy !== 'undefined' ? recordSummaryAccuracy : null, `${avg(getRecordAccuracyValue).toFixed(1)}%`);
  setText(typeof recordSummaryError !== 'undefined' ? recordSummaryError : null, avg(getRecordErrorValue).toFixed(1));
}


function renderCurrentResult(currentRecord, store) {
  const history = Array.isArray(store && store.history) ? store.history : [];
  const record = currentRecord || history[0] || null;
  const isCurrent = !!(currentRecord && record && currentRecord.id === record.id);
  setText(typeof recordCurrentBadge !== 'undefined' ? recordCurrentBadge : null, isCurrent ? '今回の結果' : '直近の結果');
  if (!record) {
    setText(typeof recordCurrentCpm !== 'undefined' ? recordCurrentCpm : null, '—');
    setText(typeof recordCurrentAccuracy !== 'undefined' ? recordCurrentAccuracy : null, '—');
    setText(typeof recordCurrentError !== 'undefined' ? recordCurrentError : null, '—');
    setText(typeof recordCurrentTask !== 'undefined' ? recordCurrentTask : null, '—');
    setText(typeof recordCurrentMeta !== 'undefined' ? recordCurrentMeta : null, 'まだ記録がありません');
    return;
  }
  setText(typeof recordCurrentCpm !== 'undefined' ? recordCurrentCpm : null, String(getRecordCpmValue(record)));
  setText(typeof recordCurrentAccuracy !== 'undefined' ? recordCurrentAccuracy : null, `${getRecordAccuracyValue(record)}%`);
  setText(typeof recordCurrentError !== 'undefined' ? recordCurrentError : null, `${getRecordErrorValue(record)}件`);
  setText(typeof recordCurrentTask !== 'undefined' ? recordCurrentTask : null, record.title || '課題文');
  setText(
    typeof recordCurrentMeta !== 'undefined' ? recordCurrentMeta : null,
    `${formatRecordDate(record.date)} / ${record.condition || '条件なし'} / ${getRecordModeLabel(record.mode)}`
  );
}

function updateRecordOverview(store) {
  const history = Array.isArray(store && store.history) ? store.history : [];
  const bests = store && store.bests ? store.bests : {};
  setText(typeof recordOverviewCount !== 'undefined' ? recordOverviewCount : null, `${history.length}回`);
  setText(typeof recordOverviewLatest !== 'undefined' ? recordOverviewLatest : null, history.length ? `最終練習：${formatRecordDate(history[0].date)}` : '最終練習：—');
  setText(typeof recordOverviewBestCpm !== 'undefined' ? recordOverviewBestCpm : null, bests.cpm ? String(getRecordCpmValue(bests.cpm)) : '—');
  setText(typeof recordOverviewBestCpmDate !== 'undefined' ? recordOverviewBestCpmDate : null, bests.cpm ? `${formatRecordDate(bests.cpm.date)} / ${bests.cpm.title || '課題文'}` : '—');
  const cpmValues = history.map(getRecordCpmValue).filter(value => Number.isFinite(value) && value > 0);
  setText(typeof recordOverviewAvgCpm !== 'undefined' ? recordOverviewAvgCpm : null, cpmValues.length ? String(Math.round(cpmValues.reduce((sum, value) => sum + value, 0) / cpmValues.length)) : '—');
  setText(typeof recordOverviewBestAccuracy !== 'undefined' ? recordOverviewBestAccuracy : null, bests.accuracy ? `${getRecordAccuracyValue(bests.accuracy)}%` : '—');
  setText(typeof recordOverviewBestAccuracyDate !== 'undefined' ? recordOverviewBestAccuracyDate : null, bests.accuracy ? `${formatRecordDate(bests.accuracy.date)} / ${bests.accuracy.title || '課題文'}` : '—');
}

function formatBestUpdateDelta(label, current, previous, suffix = '') {
  if (previous === null || previous === undefined || !Number.isFinite(Number(previous))) return `${label} ${current}${suffix}`;
  const diff = Number(current) - Number(previous);
  const sign = diff > 0 ? '+' : '';
  return `${label} ${current}${suffix}（前ベスト ${previous}${suffix} / ${sign}${diff.toFixed(label === '正確率' ? 1 : 0)}${suffix}）`;
}

function renderBestUpdateNotice(currentRecord, flags = {}) {
  const el = typeof recordBestUpdate !== 'undefined' ? recordBestUpdate : null;
  if (!el) return;
  const items = [];
  if (currentRecord && flags.newCpmBest) items.push(formatBestUpdateDelta('最高CPM', getRecordCpmValue(currentRecord), flags.previousCpm, ''));
  if (currentRecord && flags.newAccuracyBest) items.push(formatBestUpdateDelta('正確率', getRecordAccuracyValue(currentRecord), flags.previousAccuracy, '%'));
  if (currentRecord && flags.newErrorBest) {
    const currentError = getRecordErrorValue(currentRecord);
    const previous = flags.previousError;
    const detail = previous === null || previous === undefined || !Number.isFinite(Number(previous))
      ? `最少エラー ${currentError}件`
      : `最少エラー ${currentError}件（前ベスト ${previous}件 / ${currentError - previous}件）`;
    items.push(detail);
  }
  if (!items.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <div class="record-best-update-title">自己ベスト更新！</div>
    <ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  `;
}

function getRankMedal(index) {
  return index === 0 ? '1' : (index === 1 ? '2' : (index === 2 ? '3' : String(index + 1)));
}


function getRecordConditionKey(record) {
  const label = record && typeof record.condition === 'string' ? record.condition.trim() : '';
  if (label) return label;
  const seconds = getRecordDurationSeconds(record);
  return seconds > 0 ? formatSeconds(seconds) : '条件未設定';
}

function getRankingConditionOptions(store) {
  const history = Array.isArray(store && store.history) ? store.history : [];
  const seen = new Set();
  const options = [];
  history.forEach(record => {
    if (!record) return;
    const key = getRecordConditionKey(record);
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push({
      key,
      seconds: getRecordDurationSeconds(record),
      isComplete: key.includes('全文') || key.includes('打ち切り')
    });
  });
  options.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    if (a.seconds !== b.seconds) return a.seconds - b.seconds;
    return a.key.localeCompare(b.key, 'ja');
  });
  return options;
}

function getDefaultRankingConditionKey(store, currentRecord = null) {
  const options = getRankingConditionOptions(store);
  if (!options.length) return '';
  const currentKey = currentRecord ? getRecordConditionKey(currentRecord) : '';
  if (currentKey && options.some(option => option.key === currentKey)) return currentKey;
  const history = Array.isArray(store && store.history) ? store.history : [];
  const latest = history.find(Boolean);
  const latestKey = latest ? getRecordConditionKey(latest) : '';
  if (latestKey && options.some(option => option.key === latestKey)) return latestKey;
  return options[0].key;
}

function renderRankingConditionSelect(store, currentRecord = null) {
  const select = document.getElementById('record-ranking-condition');
  const note = document.getElementById('record-ranking-condition-note');
  if (!select) return getDefaultRankingConditionKey(store, currentRecord);

  const options = getRankingConditionOptions(store);
  if (!options.length) {
    select.innerHTML = '<option value="">記録なし</option>';
    select.disabled = true;
    if (note) note.textContent = '記録が保存されると、条件別にランキングを確認できます。';
    recordRankingConditionKey = '';
    return '';
  }

  const validKeys = new Set(options.map(option => option.key));
  if (!recordRankingConditionKey || !validKeys.has(recordRankingConditionKey)) {
    recordRankingConditionKey = getDefaultRankingConditionKey(store, currentRecord);
  }

  select.disabled = false;
  select.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.key)}">${escapeHtml(option.key)}</option>`)
    .join('');
  select.value = recordRankingConditionKey;

  if (!select.dataset.boundRankingCondition) {
    select.addEventListener('change', () => {
      recordRankingConditionKey = select.value;
      renderRecordRankings(readRecordsStore(), null);
    });
    select.dataset.boundRankingCondition = '1';
  }

  if (note) note.textContent = `${recordRankingConditionKey} の記録だけで比較しています。`;
  return recordRankingConditionKey;
}


function getRankingCandidates(store, type, conditionKey = '') {
  const history = Array.isArray(store && store.history) ? store.history.slice() : [];
  const candidates = history.filter(record => {
    if (!record) return false;
    if (conditionKey && getRecordConditionKey(record) !== conditionKey) return false;
    if (type === 'cpm') return getRecordCpmValue(record) > 0;
    if (type === 'accuracy') return getRecordAccuracyValue(record) > 0;
    if (type === 'error') return isErrorRankingEligible(record);
    return true;
  });
  const byDate = record => {
    const time = new Date(record.date || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  };
  candidates.sort((a, b) => {
    if (type === 'cpm') return getRecordCpmValue(b) - getRecordCpmValue(a) || getRecordAccuracyValue(b) - getRecordAccuracyValue(a) || byDate(b) - byDate(a);
    if (type === 'accuracy') return getRecordAccuracyValue(b) - getRecordAccuracyValue(a) || getRecordCpmValue(b) - getRecordCpmValue(a) || getRecordErrorValue(a) - getRecordErrorValue(b) || byDate(b) - byDate(a);
    if (type === 'error') return getRecordErrorValue(a) - getRecordErrorValue(b) || getRecordAccuracyValue(b) - getRecordAccuracyValue(a) || getRecordCpmValue(b) - getRecordCpmValue(a) || byDate(b) - byDate(a);
    return byDate(b) - byDate(a);
  });
  return makeUniqueRecords(candidates).slice(0, 5);
}

function getRankingMainValue(record, type) {
  if (type === 'cpm') return `${getRecordCpmValue(record)} CPM`;
  if (type === 'accuracy') return `${getRecordAccuracyValue(record)}%`;
  if (type === 'error') return `${getRecordErrorValue(record)}件`;
  return '—';
}

function renderRankingList(element, records, type, currentRecord = null) {
  if (!element) return;
  if (!records.length) {
    element.innerHTML = '<li class="record-ranking-empty">まだ記録がありません</li>';
    return;
  }
  element.innerHTML = records.map((record, index) => `
    <li class="record-ranking-item ${currentRecord && record.id === currentRecord.id ? 'is-current' : ''}">
      <span class="record-ranking-rank">${getRankMedal(index)}</span>
      <span class="record-ranking-main">
        <strong>${getRankingMainValue(record, type)}</strong>
        <small>${escapeHtml(record.title || '課題文')}</small>
      </span>
      <span class="record-ranking-meta">${formatRecordDate(record.date)}<br>${escapeHtml(record.condition || '—')}・${getRecordModeLabel(record.mode)}</span>
    </li>
  `).join('');
}

function renderRecordRankings(store, currentRecord = null) {
  const conditionKey = renderRankingConditionSelect(store, currentRecord);
  renderRankingList(typeof recordRankingCpm !== 'undefined' ? recordRankingCpm : null, getRankingCandidates(store, 'cpm', conditionKey), 'cpm', currentRecord);
  renderRankingList(typeof recordRankingAccuracy !== 'undefined' ? recordRankingAccuracy : null, getRankingCandidates(store, 'accuracy', conditionKey), 'accuracy', currentRecord);
  renderRankingList(typeof recordRankingError !== 'undefined' ? recordRankingError : null, getRankingCandidates(store, 'error', conditionKey), 'error', currentRecord);
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
  const cssW = canvas.clientWidth || Number(canvas.getAttribute('width')) || 900;
  const cssH = canvas.clientHeight || Number(canvas.getAttribute('height')) || 260;
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

  const chronological = (Array.isArray(records) ? records.filter(record => record && typeof record === 'object') : []).sort((a, b) => {
    const at = new Date(a.date || 0).getTime();
    const bt = new Date(b.date || 0).getTime();
    return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
  });

  const allPoints = chronological.map(record => {
    const raw = getRecordGraphValue(record, config);
    const value = Number(raw);
    return { record, value };
  }).filter(point => Number.isFinite(point.value));

  // CPM の 0 は、2秒終了・未完了・旧データの取得失敗などで混ざることが多い。
  // 0 を含めると縦軸が 0〜20 に固定され、正常値があるのに折れ線が見えない原因になるため、
  // CPM グラフでは「正のCPMだけ」を推移表示の対象にする。表には0も残す。
  const points = config.key === 'cpm'
    ? allPoints.filter(point => point.value > 0)
    : allPoints;
  const skippedCount = Math.max(0, allPoints.length - points.length);

  // 動作確認用。画面には出さないが、テストやブラウザ開発者ツールで値を確認できる。
  if (canvas.dataset) {
    canvas.dataset.recordGraphMetric = config.key;
    canvas.dataset.recordGraphValues = points.map(point => String(Math.round(point.value))).join(',');
    canvas.dataset.recordGraphSkipped = String(skippedCount);
  }

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

  if (!points.length) {
    const note = config.key === 'cpm'
      ? 'CPMが0または取得できない履歴だけのため、推移グラフは表示できません。1分練習など、CPMが正しく出る記録が2件以上たまると折れ線で表示されます。'
      : 'この項目の値を取得できる履歴がないため、グラフは表示できません。';
    setText(typeof recordGraphNote !== 'undefined' ? recordGraphNote : null, note);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('表示できる記録がありません', cssW / 2, cssH / 2);
    return;
  }

  const rangeNote = config.key === 'cpm'
    ? `CPMは0の記録を除外し、変化が見えるよう縦軸を記録値の周辺に自動調整しています。${skippedCount ? `CPM 0の履歴${skippedCount}件は表には残し、グラフからは除外しています。` : ''}`
    : '表の並び替えとは別に、推移が読み取りやすい順序で描画します。';
  const singleNote = points.length === 1
    ? '有効な履歴が1件だけなので、折れ線ではなく点と短い基準線で表示しています。2件以上たまると線でつながります。'
    : rangeNote;
  setText(typeof recordGraphNote !== 'undefined' ? recordGraphNote : null, `${points.length}件の履歴を古い順に表示しています。${singleNote}`);

  const values = points.map(point => point.value);
  const rawMax = Math.max(...values, 1);
  const rawMin = Math.min(...values);
  const range = Math.max(1, rawMax - rawMin);
  let minValue = 0;
  let niceMaxValue;
  if (config.maxFixed) {
    niceMaxValue = config.maxFixed;
  } else if (config.key === 'cpm') {
    const padding = Math.max(10, range * 0.22);
    minValue = Math.max(0, Math.floor((rawMin - padding) / 10) * 10);
    niceMaxValue = (typeof niceCeil === 'function') ? niceCeil(rawMax + padding) : Math.ceil(rawMax + padding);
    if (niceMaxValue <= minValue) niceMaxValue = minValue + Math.max(20, range);
  } else {
    niceMaxValue = (typeof niceCeil === 'function') ? niceCeil(rawMax * 1.12) : Math.ceil(rawMax * 1.12);
    minValue = rawMin < 0 ? rawMin : 0;
  }
  const span = Math.max(1, niceMaxValue - minValue);
  const xOf = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
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

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  points.forEach((point, i) => {
    const x = xOf(i);
    if (i % labelEvery === 0 || i === points.length - 1) {
      ctx.strokeStyle = colBorder;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colDim;
      ctx.fillText(formatRecordDate(point.record.date), x, padT + plotH + 8);
    }
  });

  ctx.strokeStyle = colAccent;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (points.length >= 2) {
    points.forEach((point, i) => {
      const x = xOf(i), y = yOf(point.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  } else {
    const x = xOf(0);
    const y = yOf(points[0].value);
    const half = Math.min(42, plotW / 4);
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
  }
  ctx.stroke();

  const dotEvery = points.length > 50 ? Math.ceil(points.length / 50) : 1;
  points.forEach((point, i) => {
    if (i % dotEvery !== 0 && i !== points.length - 1) return;
    ctx.fillStyle = i === points.length - 1 ? colAccent2 : colAccent;
    ctx.beginPath();
    ctx.arc(xOf(i), yOf(point.value), i === points.length - 1 ? 4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  });

  const lastIndex = points.length - 1;
  const lastValue = points[lastIndex].value;
  ctx.fillStyle = colText;
  ctx.textAlign = lastIndex === 0 ? 'center' : 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`最新 ${formatRecordGraphValue(lastValue, config)}`, xOf(lastIndex), Math.max(14, yOf(lastValue) - 8));
}
function updateRecordPaginationControls(totalRecords, totalPages, currentPage, startIndex, endIndex) {
  const hasRecords = totalRecords > 0;
  if (typeof recordPagePrev !== 'undefined' && recordPagePrev) {
    recordPagePrev.disabled = !hasRecords || currentPage <= 1;
  }
  if (typeof recordPageNext !== 'undefined' && recordPageNext) {
    recordPageNext.disabled = !hasRecords || currentPage >= totalPages;
  }
  setText(typeof recordPageStatus !== 'undefined' ? recordPageStatus : null, hasRecords ? `${currentPage} / ${totalPages}` : '0 / 0');
  setText(
    typeof recordPaginationInfo !== 'undefined' ? recordPaginationInfo : null,
    hasRecords
      ? `${startIndex + 1}〜${endIndex}件目を表示（全${totalRecords}件・10件ごと）`
      : '条件に合う履歴がありません'
  );
}

function resetRecordHistoryPage() {
  recordHistoryPage = 1;
}

function changeRecordHistoryPage(delta) {
  const store = readRecordsStore();
  const totalRecords = sortRecords(getFilteredRecords(store)).length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / RECORD_HISTORY_PAGE_SIZE));
  recordHistoryPage = Math.min(totalPages, Math.max(1, recordHistoryPage + delta));
  renderRecords(null, store, { saved: true, updateNote: false });
}

function renderRecordHistory(store, currentRecord = null) {
  if (!recordHistoryBody) return;
  const filtered = getFilteredRecords(store);
  const records = sortRecords(filtered);
  updateRecordSummary(records);
  drawRecordLineChart(filtered);
  setText(typeof recordHistoryTitle !== 'undefined' ? recordHistoryTitle : null, `履歴：${getRecordFilterLabel()}`);
  if (!records.length) {
    recordHistoryPage = 1;
    updateRecordPaginationControls(0, 0, 0, 0, 0);
    recordHistoryBody.innerHTML = '<tr><td colspan="8" class="record-empty">条件に合う履歴がありません</td></tr>';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(records.length / RECORD_HISTORY_PAGE_SIZE));
  recordHistoryPage = Math.min(totalPages, Math.max(1, Number(recordHistoryPage) || 1));
  const startIndex = (recordHistoryPage - 1) * RECORD_HISTORY_PAGE_SIZE;
  const pageRecords = records.slice(startIndex, startIndex + RECORD_HISTORY_PAGE_SIZE);
  const endIndex = Math.min(records.length, startIndex + pageRecords.length);
  updateRecordPaginationControls(records.length, totalPages, recordHistoryPage, startIndex, endIndex);

  recordHistoryBody.innerHTML = pageRecords.map((r, index) => `
    <tr class="${currentRecord && r.id === currentRecord.id ? 'is-current' : ''}">
      <td>${startIndex + index + 1}</td>
      <td>${formatRecordDate(r.date)}</td>
      <td>${escapeHtml(r.title || '—')}<br><small class="record-row-sub">${getRecordModeLabel(r.mode)}</small></td>
      <td>${escapeHtml(r.condition || '—')}</td>
      <td>${formatSeconds(getRecordDurationSeconds(r))}</td>
      <td>${getRecordCpmValue(r)}</td>
      <td>${getRecordAccuracyValue(r)}%</td>
      <td>${getRecordErrorValue(r)}</td>
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

  renderCurrentResult(currentRecord, store);
  updateRecordOverview(store);
  renderBestUpdateNotice(currentRecord, flags);
  renderBestCard('best-cpm', bests.cpm, r => String(getRecordCpmValue(r)));
  renderBestCard('best-accuracy', bests.accuracy, r => `${getRecordAccuracyValue(r)}%`);
  renderBestCard('best-error', bests.error, r => `${getRecordErrorValue(r)}件`);
  renderRecordRankings(store, currentRecord);
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
  return `${getRecordCpmValue(record)} CPM／正確率 ${getRecordAccuracyValue(record)}%／${formatSeconds(getRecordDurationSeconds(record))}／${formatRecordDate(record.date)}`;
}

function formatTextStatsSummary(textId) {
  const stats = getStatsForText(textId);
  if (!stats || !stats.count) return '練習回数：0回／最高CPM：—／最高正確率：—／最終練習：—';
  const bestCpm = stats.bestCpm ? `${getRecordCpmValue(stats.bestCpm)}` : '—';
  const bestAccuracy = stats.bestAccuracy ? `${getRecordAccuracyValue(stats.bestAccuracy)}%` : '—';
  const latestDate = stats.latest ? formatRecordDate(stats.latest.date) : '—';
  return `練習回数：${stats.count}回／最高CPM：${bestCpm}／最高正確率：${bestAccuracy}／最終練習：${latestDate}`;
}




let recordsReturnMode = 'home';

function showRecordsScreen(returnMode = 'home') {
  recordsReturnMode = returnMode === 'result' ? 'result' : 'home';
  const store = readRecordsStore();
  document.body.classList.remove('result-mode', 'focus-mode');
  document.body.classList.add('records-mode');
  if (typeof resultScreen !== 'undefined' && resultScreen) resultScreen.style.display = 'none';
  if (typeof recordsScreen !== 'undefined' && recordsScreen) recordsScreen.style.display = 'block';
  // canvas は非表示状態で描画すると clientWidth / clientHeight が正しく取れず、
  // 折れ線グラフがつぶれたり粗く見えたりする。表示後に描画する。
  const renderAfterVisible = () => {
    renderRecords(null, store, { saved: true });
    if (recordCurrentNote) {
      recordCurrentNote.textContent = store.history && store.history.length
        ? '保存済みの自己ベストと直近５０回の履歴を表示しています。'
        : 'まだ保存済みの履歴がありません。練習を終えると、この画面に記録が表示されます。';
    }
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    // display:block 直後は環境によって canvas の実寸が安定しないことがあるため、
    // 2フレーム待ってから描画する。
    window.requestAnimationFrame(() => window.requestAnimationFrame(renderAfterVisible));
  } else {
    renderAfterVisible();
  }
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
if (typeof btnRecordReset !== 'undefined' && btnRecordReset) {
  btnRecordReset.addEventListener('click', handleRecordsReset);
}
if (typeof btnRecordBackBottom !== 'undefined' && btnRecordBackBottom) {
  btnRecordBackBottom.addEventListener('click', () => closeRecordsScreen(false));
}
if (typeof btnRecordHomeBottom !== 'undefined' && btnRecordHomeBottom) {
  btnRecordHomeBottom.addEventListener('click', () => closeRecordsScreen(true));
}
if (typeof btnRecordResetBottom !== 'undefined' && btnRecordResetBottom) {
  btnRecordResetBottom.addEventListener('click', handleRecordsReset);
}



// 記録画面では、キーボードでも次の計測準備へ戻れるようにする。
// Ctrl+Enter / H で「最初の画面に戻る」。
if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (typeof recordsScreen === 'undefined' || !recordsScreen || recordsScreen.style.display !== 'block') return;

    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    const shouldReturnHome = (e.ctrlKey && e.key === 'Enter') || (!e.ctrlKey && !e.metaKey && !e.altKey && key === 'h');
    if (!shouldReturnHome) return;

    e.preventDefault();
    closeRecordsScreen(true);
  });
}

if (typeof recordFilterMode !== 'undefined' && recordFilterMode) {
  recordFilterMode.addEventListener('change', () => { resetRecordHistoryPage(); refreshRecordsView(); });
}
if (typeof recordSortMode !== 'undefined' && recordSortMode) {
  recordSortMode.addEventListener('change', () => { resetRecordHistoryPage(); refreshRecordsView(); });
}
if (typeof recordGraphMetric !== 'undefined' && recordGraphMetric) {
  recordGraphMetric.addEventListener('change', refreshRecordsView);
}
if (typeof recordPagePrev !== 'undefined' && recordPagePrev) {
  recordPagePrev.addEventListener('click', () => changeRecordHistoryPage(-1));
}
if (typeof recordPageNext !== 'undefined' && recordPageNext) {
  recordPageNext.addEventListener('click', () => changeRecordHistoryPage(1));
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
