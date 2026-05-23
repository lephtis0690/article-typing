import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const recordsCode = fs.readFileSync(path.join(root, 'js/modules/04-records.js'), 'utf8');
const elements = new Map();
const calls = [];
function makeCanvas() {
  return {
    id: 'record-line-chart', clientWidth: 900, clientHeight: 260, width: 0, height: 0, dataset: {},
    getAttribute(name) { return name === 'width' ? '900' : (name === 'height' ? '260' : ''); },
    getContext() {
      const ctx = new Proxy({
        fillText: (...args) => calls.push(['fillText', ...args]),
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, clearRect() {}, setTransform() {},
      }, { set(obj, prop, val) { obj[prop] = val; return true; }, get(obj, prop) { return prop in obj ? obj[prop] : (() => {}); } });
      return ctx;
    }
  };
}
function el(id) { const obj = { id, textContent: '', innerHTML: '', value: 'cpm', options: [{ textContent: 'すべて' }], selectedIndex: 0, addEventListener() {} }; elements.set(id, obj); return obj; }
['record-current-note','record-history-body','record-graph-title','record-graph-note','record-graph-legend','record-summary-count','record-summary-cpm','record-summary-accuracy','record-summary-error','record-history-title','best-cpm-value','best-cpm-meta','best-cpm-title','best-accuracy-value','best-accuracy-meta','best-accuracy-title','best-error-value','best-error-meta','best-error-title'].forEach(el);
elements.set('record-line-chart', makeCanvas());
elements.set('record-graph-metric', el('record-graph-metric'));

const context = {
  console,
  window: { devicePixelRatio: 1, addEventListener() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
  document: { body: {}, getElementById: id => elements.get(id) || null, querySelectorAll: () => [] },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  gameState: { texts: { currentId: '' } },
  formatSeconds: sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
  escapeHtml: value => String(value),
  canUseLocalStorage: () => true,
  niceCeil: value => Math.ceil(value / 10) * 10
};
vm.createContext(context);
vm.runInContext(`
var recordCurrentNote = document.getElementById('record-current-note');
var recordHistoryBody = document.getElementById('record-history-body');
var recordFilterMode = { value: 'all', options: [{ textContent: 'すべて' }], selectedIndex: 0, addEventListener() {} };
var recordSortMode = { value: 'dateDesc', addEventListener() {} };
var recordGraphMetric = document.getElementById('record-graph-metric');
var recordLineChart = document.getElementById('record-line-chart');
var recordGraphTitle = document.getElementById('record-graph-title');
var recordGraphNote = document.getElementById('record-graph-note');
var recordGraphLegend = document.getElementById('record-graph-legend');
var recordSummaryCount = document.getElementById('record-summary-count');
var recordSummaryCpm = document.getElementById('record-summary-cpm');
var recordSummaryAccuracy = document.getElementById('record-summary-accuracy');
var recordSummaryError = document.getElementById('record-summary-error');
var recordHistoryTitle = document.getElementById('record-history-title');
`, context);
vm.runInContext(recordsCode, context, { filename: '04-records.js' });
const records = [
  { date: '2026-05-23T19:42:00+09:00', title: 'zero', cpm: 0, accuracy: 0, errorTotal: 0, durationSeconds: 2 },
  { date: '2026-05-23T11:57:00+09:00', title: 'a', cpm: 187, accuracy: 100, errorTotal: 0, durationSeconds: 60 },
  { date: '2026-05-23T11:51:00+09:00', title: 'b', cpm: 213, accuracy: 100, errorTotal: 0, durationSeconds: 60 },
  { date: '2026-05-23T09:07:00+09:00', title: 'c', cpm: 207, accuracy: 100, errorTotal: 0, durationSeconds: 28 }
];
context.drawRecordLineChart(records);
const canvas = elements.get('record-line-chart');
if (canvas.dataset.recordGraphValues !== '207,213,187') {
  throw new Error(`CPM graph values should exclude 0 and preserve chronological positive CPMs, got ${canvas.dataset.recordGraphValues}`);
}
if (canvas.dataset.recordGraphSkipped !== '1') throw new Error('CPM zero record should be skipped only in graph');
if (!elements.get('record-graph-note').textContent.includes('CPM 0')) throw new Error('graph note should explain skipped CPM 0 records');
console.log('OK: record graph CPM value smoke test passed');
