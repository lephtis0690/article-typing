import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const scriptSrcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
for (const src of scriptSrcs) {
  const full = path.join(root, src);
  if (!fs.existsSync(full)) throw new Error(`script not found: ${src}`);
}

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const jsFiles = scriptSrcs.map(src => read(src));
const domRefs = new Set();
for (const js of jsFiles) {
  for (const m of js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) domRefs.add(m[1]);
}
const generatedIds = new Set(['text-content', 'line-counts']);
const missingIds = [...domRefs].filter(id => !htmlIds.has(id) && !generatedIds.has(id));
if (missingIds.length) throw new Error(`missing HTML id(s): ${missingIds.join(', ')}`);

const dataIndex = JSON.parse(read('data/index.json'));
if (!Array.isArray(dataIndex)) throw new Error('data/index.json must be an array');
for (const item of dataIndex) {
  if (!item.file) throw new Error('data/index.json item missing file');
  const data = JSON.parse(read(item.file));
  if (!Array.isArray(data)) throw new Error(`${item.file} must be an array`);
  for (const text of data) {
    for (const key of ['id', 'title', 'genre', 'text']) {
      if (!text[key]) throw new Error(`${item.file} item missing ${key}`);
    }
    if (text.genre !== item.id) throw new Error(`${item.file} genre mismatch: ${text.id}`);
    for (const key of ['charCount', 'kanjiRate', 'lengthBand', 'difficulty', 'rhythmType']) {
      if (text[key] === undefined || text[key] === null || text[key] === '') {
        throw new Error(`${item.file} item missing metadata ${key}: ${text.id}`);
      }
    }
  }
}

const updates = JSON.parse(read('data/updates.json'));
if (!updates.some(item => item.title === '目標達成ゲージを追加' && /目標純字数/.test(item.body || ''))) {
  throw new Error('goal gauge update information not found');
}
if (!updates.some(item => item.title === 'リズムインジケータを追加' && /緑/.test(item.body || ''))) {
  throw new Error('rhythm indicator update information not found');
}


const dataTextCount = dataIndex.reduce((sum, item) => {
  const data = JSON.parse(read(item.file));
  return sum + data.length;
}, 0);
const fallbackSource = read('js/generated/fallback-texts.js');
const fallbackMatch = fallbackSource.match(/const\s+TEXTS_FALLBACK\s*=\s*([\s\S]*);\s*$/);
if (!fallbackMatch) throw new Error('TEXTS_FALLBACK was not found');
const fallbackItems = JSON.parse(fallbackMatch[1]);
if (fallbackItems.length !== dataTextCount) {
  throw new Error(`fallback count should match data texts: fallback=${fallbackItems.length}, data=${dataTextCount}`);
}


const css = read('css/style.css');
if (!htmlIds.has('goal-gauge')) throw new Error('goal achievement gauge not found');
if (!htmlIds.has('goal-gauge-mode') || !htmlIds.has('goal-net-chars')) throw new Error('goal achievement gauge settings not found');
if (!htmlIds.has('rhythm-indicator') || !htmlIds.has('rhythm-indicator-mode')) throw new Error('rhythm indicator or setting not found');
if (!htmlIds.has('live-status-sticky')) throw new Error('sticky live-status container not found');
if (!/body\.focus-mode #live-status-sticky\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;/.test(css)) {
  throw new Error('live indicators must stick to the viewport top during measurement');
}
if (!/body\.hide-live-status #live-status-sticky/.test(css) || !/body\.competition-mode #live-status-sticky/.test(css)) {
  throw new Error('sticky live-status container must respect hidden and competition modes');
}
if ((html.match(/class="goal-gauge-cell"/g) || []).length !== 11) throw new Error('goal achievement gauge must have 11 cells');
const uiSource = read('js/modules/30-ui-render.js');
if (!/function\s+updateGoalGauge/.test(uiSource) || !/requiredCpm/.test(uiSource)) {
  throw new Error('goal achievement gauge calculation not found');
}
if (!/function\s+updateRhythmIndicator/.test(uiSource) || !/variation/.test(uiSource)) {
  throw new Error('rhythm indicator calculation not found');
}
const settingsSource = read('js/modules/70-settings-main.js');
const configBindingIndex = settingsSource.indexOf("btnConfigToggle.addEventListener('click'");
const libraryBindingIndex = settingsSource.indexOf("btnTextLibrary.addEventListener('click'");
const initializationIndex = settingsSource.indexOf("runInitialUiStep('保存設定'");
if (configBindingIndex < 0 || libraryBindingIndex < 0 || initializationIndex < 0
    || configBindingIndex > initializationIndex || libraryBindingIndex > initializationIndex) {
  throw new Error('primary control handlers must be bound before initialization');
}
const librarySource = read('js/modules/20-library.js');
const openLibrarySource = librarySource.slice(
  librarySource.indexOf('function openTextLibrary()'),
  librarySource.indexOf('function closeTextLibrary()')
);
if (openLibrarySource.indexOf("classList.remove('hidden')") > openLibrarySource.indexOf('renderTextLibrary(gameState.texts.items)')) {
  throw new Error('text library modal must open before rendering the list');
}
const practiceCursorOverride = css.match(/body\.practice-mode \.char-cursor,[\s\S]*?body\.practice-mode\.theme-light\.colorblind-mode \.char-cursor \{[\s\S]*?\}/);
if (!practiceCursorOverride) throw new Error('practice-mode cursor override not found');
const practiceCursorCss = practiceCursorOverride[0];
if (!/color:\s*var\(--reading-text\)\s*!important;/.test(practiceCursorCss)) {
  throw new Error('practice-mode cursor color must keep readable text and prevent white override');
}
if (!/background:\s*transparent\s*!important;/.test(practiceCursorCss)) {
  throw new Error('practice-mode cursor background must stay transparent');
}
const lightCursorIndex = css.indexOf('body.theme-light .char-cursor { color: #ffffff; }');
const practiceOverrideIndex = css.lastIndexOf('body.practice-mode .char-cursor,');
if (lightCursorIndex !== -1 && practiceOverrideIndex !== -1 && practiceOverrideIndex < lightCursorIndex) {
  throw new Error('practice-mode cursor override must come after light-theme cursor rule');
}

const chartSource = read('js/modules/50-chart.js');
if (!htmlIds.has('chart-current-moving-cpm')) throw new Error('chart-current-moving-cpm readout not found');
if (!/function\s+buildInstantMovingAverageHistory/.test(chartSource)) throw new Error('instant CPM moving-average helper not found');
if (!/5秒移動平均/.test(chartSource) || !/movingCpm/.test(chartSource)) {
  throw new Error('CPM chart should display the 5-second moving average line and tooltip value');
}
if (!htmlIds.has('cpm-chart-display-mode')) throw new Error('CPM chart display selector not found');
if (!/value="both"/.test(html) || !/value="avg"/.test(html) || !/value="moving"/.test(html)) {
  throw new Error('CPM chart display selector must offer both/avg/moving modes');
}
if (!/function\s+getCPMChartDisplayMode/.test(chartSource) || !/showAvgCpm/.test(chartSource) || !/showMovingCpm/.test(chartSource)) {
  throw new Error('CPM chart display mode switching logic not found');
}

console.log(`OK: ${scriptSrcs.length} scripts, ${domRefs.size} DOM refs, ${dataIndex.length} data files, ${dataTextCount} texts`);
