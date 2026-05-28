import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const storageCode = fs.readFileSync(path.join(root, 'js/modules/03-storage.js'), 'utf8');
const recordsCode = fs.readFileSync(path.join(root, 'js/modules/04-records.js'), 'utf8');
const utilsCode = fs.readFileSync(path.join(root, 'js/modules/05-utils.js'), 'utf8');
const libraryCode = fs.readFileSync(path.join(root, 'js/modules/20-library.js'), 'utf8');

const store = new Map();
const recordsStore = {
  version: 1,
  history: [
    { id: 'new', date: '2026-05-22T00:03:00.000Z', textId: 'sample-1', title: 'サンプル課題', condition: '3:00', durationSeconds: 180, cpm: 420, accuracy: 98, errorTotal: 2, correct: 1260 },
    { id: 'best', date: '2026-05-21T00:03:00.000Z', textId: 'sample-1', title: 'サンプル課題', condition: '3:00', durationSeconds: 180, cpm: 450, accuracy: 97, errorTotal: 3, correct: 1350 }
  ],
  bests: {}
};
store.set('long-type:records:v1', JSON.stringify(recordsStore));

const elements = new Map();
function makeElement(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    appendChild(child) { this.innerHTML += child.innerHTML || ''; },
    addEventListener() {}
  };
}
[
  'record-current-note', 'record-history-body',
  'best-cpm-value', 'best-cpm-meta', 'best-cpm-title',
  'best-accuracy-value', 'best-accuracy-meta', 'best-accuracy-title',
  'best-error-value', 'best-error-meta', 'best-error-title',
  'text-library-list'
].forEach(id => elements.set(id, makeElement(id)));

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
    querySelectorAll: () => [],
    createElement: tag => makeElement(tag)
  },
  timeSelect: { value: '180' },
  displayPresetModeSelect: { value: 'practice' },
  gameState: { texts: { currentId: 'sample-1', currentTitle: 'サンプル課題', selectionMode: 'random' } },
  RANDOM_TEXT_VALUE: '__random__',
  textLibraryList: elements.get('text-library-list'),
  textLibraryModal: makeElement('modal'),
  isCompleteMode: () => false,
  formatSeconds: sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
};

vm.createContext(context);
vm.runInContext(`
var recordCurrentNote = document.getElementById('record-current-note');
var recordHistoryBody = document.getElementById('record-history-body');
function applyRandomTextForStart() {}
function updateTextSelectionStatus() {}
function applySelectedText() {}
`, context);
vm.runInContext(storageCode, context, { filename: '03-storage.js' });
vm.runInContext(recordsCode, context, { filename: '04-records.js' });
vm.runInContext(utilsCode, context, { filename: '05-utils.js' });
vm.runInContext(libraryCode, context, { filename: '20-library.js' });

context.renderTextLibrary([{ id: 'sample-1', title: 'サンプル課題', genreName: 'テスト', text: '漢字ABCかな123' }]);
const html = elements.get('text-library-list').innerHTML;
if (!html.includes('漢字含有率')) throw new Error('kanji ratio was not rendered');
if (!html.includes('練習回数：2回')) throw new Error('practice count was not rendered');
if (!html.includes('最高CPM：450')) throw new Error('best CPM was not rendered');
if (!html.includes('最高正確率：98%')) throw new Error('best accuracy was not rendered');
if (!html.includes('最終練習：05/22')) throw new Error('latest practice date was not rendered');

console.log('OK: text library kanji/record/duration display smoke test passed');
