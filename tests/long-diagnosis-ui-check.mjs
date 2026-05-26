import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

const requiredHtml = [
  'id="long-diagnosis-collapse"',
  'id="typing-trait-summary"',
  'id="section-analysis"',
  'id="long-diagnosis-list"',
  'id="long-diagnosis-support"'
];

const requiredCss = [
  '#long-diagnosis-collapse[open] #long-diagnosis-comment',
  '#long-diagnosis-collapse[open] .long-diagnosis-summary-text',
  '#long-diagnosis-collapse[open] .typing-trait-card',
  '#long-diagnosis-collapse[open] .long-diagnosis-list',
  '#long-diagnosis-collapse[open] .section-analysis-grid'
];

for (const marker of requiredHtml) {
  if (!html.includes(marker)) {
    throw new Error(`Missing long diagnosis HTML marker: ${marker}`);
  }
}

for (const marker of requiredCss) {
  if (!css.includes(marker)) {
    throw new Error(`Missing long diagnosis CSS marker: ${marker}`);
  }
}

console.log('long-diagnosis-ui-check: OK');
