import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const gameSource = read('js/modules/40-game.js');
const labelMatch = gameSource.match(/const\s+labels\s*=\s*\[([^\]]+)\]/);
if (!labelMatch) throw new Error('section labels were not found');
const labels = [...labelMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const expectedLabels = ['序盤', '中盤', '終盤'];
if (labels.join(',') !== expectedLabels.join(',')) {
  throw new Error(`section labels must match diagnosis labels: ${labels.join(',')}`);
}
for (const label of expectedLabels) {
  if (!gameSource.includes(`sec.label === '${label}'`)) {
    throw new Error(`diagnosis lookup is missing label: ${label}`);
  }
}
if (/sec\.label\s*===\s*'前半'|sec\.label\s*===\s*'後半'/.test(gameSource)) {
  throw new Error('diagnosis must not look up obsolete 前半/後半 labels');
}

const settingsSource = read('js/modules/70-settings-main.js');
if (!/classList\.toggle\('theme-dark'/.test(settingsSource)) {
  throw new Error('theme switch must toggle body.theme-dark');
}
const css = read('css/style.css');
if (/body\.dark-mode\b/.test(css)) {
  throw new Error('diagnosis dark-theme CSS must target body.theme-dark, not body.dark-mode');
}
for (const selector of ['.typing-trait-card', '.long-diagnosis-item', '.long-diagnosis-support']) {
  if (!css.includes(`body.theme-dark ${selector}`)) {
    throw new Error(`dark theme selector missing for ${selector}`);
  }
}

console.log('OK: diagnosis labels and dark-theme selectors');
