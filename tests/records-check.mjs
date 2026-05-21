import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const storageCode = fs.readFileSync(path.join(root, 'js/modules/03-storage.js'), 'utf8');
const recordsCode = fs.readFileSync(path.join(root, 'js/modules/04-records.js'), 'utf8');

const store = new Map();
const elements = new Map();
function el(id) {
  const obj = { id, textContent: '', innerHTML: '' };
  elements.set(id, obj);
  return obj;
}
[
  'record-current-note', 'record-history-body',
  'best-cpm-value', 'best-cpm-meta', 'best-cpm-title',
  'best-accuracy-value', 'best-accuracy-meta', 'best-accuracy-title',
  'best-error-value', 'best-error-meta', 'best-error-title'
].forEach(el);

const context = {
  console,
  window: {
    localStorage: {
      setItem: (key, value) => store.set(key, String(value)),
      getItem: key => store.has(key) ? store.get(key) : null,
      removeItem: key => store.delete(key)
    }
  },
  document: {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: () => []
  },
  timeSelect: { value: '180' },
  displayPresetModeSelect: { value: 'practice' },
  currentTextId: 'sample-1',
  currentTextTitle: 'サンプル課題',
  isCompleteMode: () => false,
  formatSeconds: sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
  escapeHtml: value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
};
vm.createContext(context);
vm.runInContext(`
var recordCurrentNote = document.getElementById('record-current-note');
var recordHistoryBody = document.getElementById('record-history-body');
`, context);
vm.runInContext(storageCode, context, { filename: '03-storage.js' });
vm.runInContext(recordsCode, context, { filename: '04-records.js' });

for (let i = 0; i < 55; i++) {
  context.saveResultRecord({
    elapsed: 180,
    durationSeconds: 180,
    startedAt: '2026-05-22T00:00:00.000Z',
    endedAt: '2026-05-22T00:03:00.000Z',
    inputChars: 1000 + i,
    correct: 900 + i,
    accuracy: 90 + (i % 5),
    cpm: 300 + i,
    cps: 5,
    backspace: i,
    errorTotal: Math.max(0, 12 - i),
    net: 880 + i,
    isDisqualified: false
  });
}
const parsed = JSON.parse(store.get('long-type:records:v1'));
if (parsed.history.length !== 50) throw new Error(`history length should be 50, got ${parsed.history.length}`);
if (parsed.bests.cpm.cpm !== 354) throw new Error('best CPM was not updated');
if (parsed.bests.error.errorTotal !== 0) throw new Error('best error was not updated');
if (parsed.history[0].durationSeconds !== 180) throw new Error('durationSeconds was not saved');
if (!parsed.history[0].startedAt || !parsed.history[0].endedAt) throw new Error('startedAt/endedAt were not saved');
if (!elements.get('record-history-body').innerHTML.includes('is-current')) throw new Error('current record row was not rendered');

console.log('OK: records save/best/history smoke test passed');
