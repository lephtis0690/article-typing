// 自己ベスト・直近50回履歴の保存
// localStorage には成績の要約だけを保存し、入力本文や課題文本文は保存しない。

const RECORDS_STORAGE_KEY = 'long-type:records:v1';
const HISTORY_LIMIT = 50;

function readRecordsStore() {
  if (typeof canUseLocalStorage === 'function' && !canUseLocalStorage()) {
    return { version: 1, bests: {}, history: [] };
  }
  try {
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return { version: 1, bests: {}, history: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, bests: {}, history: [] };
    return {
      version: 1,
      bests: parsed.bests && typeof parsed.bests === 'object' ? parsed.bests : {},
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, HISTORY_LIMIT) : []
    };
  } catch (error) {
    console.warn('成績履歴の読み込みに失敗しました。履歴を初期化します。', error);
    try { window.localStorage.removeItem(RECORDS_STORAGE_KEY); } catch (_) {}
    return { version: 1, bests: {}, history: [] };
  }
}

function writeRecordsStore(store) {
  if (typeof canUseLocalStorage === 'function' && !canUseLocalStorage()) return false;
  try {
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      bests: store.bests || {},
      history: Array.isArray(store.history) ? store.history.slice(0, HISTORY_LIMIT) : []
    }));
    return true;
  } catch (error) {
    console.warn('成績履歴の保存に失敗しました。', error);
    return false;
  }
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
    textId: currentTextId || '',
    title: currentTextTitle || '課題文',
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
    judge: metrics.isDisqualified ? '失格' : (metrics.errorTotal === 0 && metrics.net >= 1000 ? '正確賞' : '通常')
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

function isBetterError(a, b) {
  if (!b) return true;
  if (a.errorTotal !== b.errorTotal) return a.errorTotal < b.errorTotal;
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy;
  return a.cpm > b.cpm;
}

function saveResultRecord(metrics) {
  const record = createResultRecord(metrics);
  const store = readRecordsStore();
  const before = { ...store.bests };
  store.history = [record, ...store.history].slice(0, HISTORY_LIMIT);
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

function renderRecords(currentRecord, store, flags = {}) {
  const bests = store.bests || {};
  const bestMessages = [];
  if (flags.newCpmBest) bestMessages.push('最高CPM更新');
  if (flags.newAccuracyBest) bestMessages.push('最高正確率更新');
  if (flags.newErrorBest) bestMessages.push('最少エラー更新');
  setText(recordCurrentNote, flags.saved
    ? (bestMessages.length ? `今回の結果を保存しました。${bestMessages.join('・')}です。` : '今回の結果を保存しました。')
    : 'localStorage が利用できないため、この端末には保存できませんでした。');

  renderBestCard('best-cpm', bests.cpm, r => String(r.cpm));
  renderBestCard('best-accuracy', bests.accuracy, r => `${r.accuracy}%`);
  renderBestCard('best-error', bests.error, r => `${r.errorTotal}件`);

  if (!recordHistoryBody) return;
  const history = Array.isArray(store.history) ? store.history : [];
  if (!history.length) {
    recordHistoryBody.innerHTML = '<tr><td colspan="8" class="record-empty">まだ履歴がありません</td></tr>';
    return;
  }
  recordHistoryBody.innerHTML = history.map((r, index) => `
    <tr class="${currentRecord && r.id === currentRecord.id ? 'is-current' : ''}">
      <td>${index + 1}</td>
      <td>${formatRecordDate(r.date)}</td>
      <td>${escapeHtml(r.title || '—')}</td>
      <td>${escapeHtml(r.condition || '—')}</td>
      <td>${formatSeconds(getRecordDurationSeconds(r))}</td>
      <td>${r.cpm ?? 0}</td>
      <td>${r.accuracy ?? 0}%</td>
      <td>${r.errorTotal ?? 0}</td>
    </tr>
  `).join('');
}

function getRecordsForText(textId) {
  const store = readRecordsStore();
  const history = Array.isArray(store.history) ? store.history : [];
  return history.filter(record => record && record.textId === textId);
}

function getLatestRecordForText(textId) {
  return getRecordsForText(textId)[0] || null;
}

function getBestCpmRecordForText(textId) {
  return getRecordsForText(textId).reduce((best, record) => isBetterCpm(record, best) ? record : best, null);
}

function formatLibraryRecordSummary(record) {
  if (!record) return '記録なし';
  return `${record.cpm ?? 0} CPM／正確率 ${record.accuracy ?? 0}%／${formatSeconds(getRecordDurationSeconds(record))}／${formatRecordDate(record.date)}`;
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
