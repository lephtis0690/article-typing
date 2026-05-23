import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const code = fs.readFileSync(path.join(root, 'js/modules/03-storage.js'), 'utf8');

function makeSelect(id, values, value = values[0]) {
  return { id, value, options: values.map(v => ({ value: v })), addEventListener() {} };
}
function makeCheckbox(id, checked = true, dataset = {}) {
  return { id, checked, dataset, addEventListener() {} };
}

const elements = new Map();
[
  makeSelect('display-preset-mode', ['practice', 'competition'], 'practice'),
  makeSelect('time-select', ['180', '300', 'complete'], '180'),
  makeSelect('start-mode', ['immediate', 'countdown'], 'immediate'),
  makeSelect('theme-mode', ['light', 'dark'], 'light'),
  makeSelect('accessibility-mode', ['colorblind', 'standard'], 'colorblind'),
  makeSelect('live-status-mode', ['show', 'hide'], 'show'),
  makeSelect('typing-position-mode', ['hide', 'show'], 'hide'),
  makeSelect('correct-feedback-mode', ['normal', 'competition'], 'normal'),
  makeSelect('feedback-mode', ['realtime', 'off'], 'realtime'),
  makeSelect('time-call-mode', ['show', 'hide'], 'show'),
  makeSelect('disqualify-limit', ['5', '10', 'none'], '10'),
  makeCheckbox('manual-detail-mode', false)
].forEach(el => elements.set(el.id, el));

const detailToggles = [
  makeCheckbox('', true, { toggle: 'input-chars' }),
  makeCheckbox('', true, { toggle: 'error-total' })
];

const store = new Map();
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
    querySelectorAll: selector => selector === '#scoring-settings input[type="checkbox"][data-toggle]' ? detailToggles : []
  }
};
vm.createContext(context);
vm.runInContext(code, context, { filename: '03-storage.js' });

// 保存
context.document.getElementById('theme-mode').value = 'dark';
context.document.getElementById('time-select').value = 'complete';
context.document.getElementById('manual-detail-mode').checked = true;
detailToggles[0].checked = false;
if (!context.saveCurrentSettings()) throw new Error('saveCurrentSettings returned false');

// 初期値に戻してから復元
context.document.getElementById('theme-mode').value = 'light';
context.document.getElementById('time-select').value = '180';
context.document.getElementById('manual-detail-mode').checked = false;
detailToggles[0].checked = true;
if (!context.restoreSavedSettings()) throw new Error('restoreSavedSettings returned false');

if (context.document.getElementById('theme-mode').value !== 'dark') throw new Error('theme-mode was not restored');
if (context.document.getElementById('time-select').value !== 'complete') throw new Error('time-select was not restored');
if (context.document.getElementById('manual-detail-mode').checked !== true) throw new Error('manual-detail-mode was not restored');
if (detailToggles[0].checked !== false) throw new Error('detail toggle was not restored');

// 不正値は無視されることを確認
const saved = JSON.parse(store.get('long-type:user-settings:v1'));
saved.selects['theme-mode'] = 'invalid-value';
store.set('long-type:user-settings:v1', JSON.stringify(saved));
context.document.getElementById('theme-mode').value = 'light';
context.restoreSavedSettings();
if (context.document.getElementById('theme-mode').value !== 'light') throw new Error('invalid select value should be ignored');

console.log('OK: localStorage save/restore smoke test passed');
