import fs from 'node:fs';
import vm from 'node:vm';

const code10 = fs.readFileSync('js/modules/10-texts.js', 'utf8');
const code20 = fs.readFileSync('js/modules/20-library.js', 'utf8');
const context = {
  console,
  document: {
    body: { dataset: {} },
    getElementById: () => null,
    addEventListener: () => {},
  },
  gameState: { texts: { filters: {} } },
  textLibraryList: { dataset: {} },
};
vm.createContext(context);
vm.runInContext(code10, context);
vm.runInContext(code20, context);

const items = [
  context.normalizeTextItem({ id: 'short', title: '短文', genre: 'science', text: '　音は空気のふるえで伝わります。水面の波と同じように、近くから遠くへ広がります。' }, 0, { id: 'science', name: '科学' }),
  context.normalizeTextItem({ id: 'long', title: '長文', genre: 'society', text: '　社会の仕組みを考えるとき、制度、歴史、地域、産業、教育、文化、交通、金融など、多くの要素を結び付けて読む必要があります。'.repeat(70) }, 1, { id: 'society', name: '社会' }),
];

context.gameState.texts.filters = { keyword: '', genre: 'all', length: 'all', kanji: 'all', difficulty: 'all', practiceLevel: 'beginner', sort: 'default' };
const beginner = items.filter(item => context.isTextMatchedByFilters(item, context.gameState.texts.filters));
if (beginner.length !== 1 || beginner[0].id !== 'short') throw new Error('beginner practiceLevel filter failed');

context.gameState.texts.filters = { keyword: '', genre: 'society', length: 'over-3500', kanji: 'all', difficulty: 'all', practiceLevel: 'advanced', sort: 'default' };
const advanced = items.filter(item => context.isTextMatchedByFilters(item, context.gameState.texts.filters));
if (advanced.length !== 1 || advanced[0].id !== 'long') throw new Error('advanced combined filters failed');

console.log('OK: text library practice-level filter smoke test passed');
