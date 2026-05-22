import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
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


const dataTextCount = dataIndex.reduce((sum, item) => {
  const data = JSON.parse(read(item.file));
  return sum + data.length;
}, 0);
const fallbackSource = read('js/modules/00-fallback-texts.js');
const fallbackMatch = fallbackSource.match(/const\s+TEXTS_FALLBACK\s*=\s*([\s\S]*);\s*$/);
if (!fallbackMatch) throw new Error('TEXTS_FALLBACK was not found');
const fallbackItems = JSON.parse(fallbackMatch[1]);
if (fallbackItems.length !== dataTextCount) {
  throw new Error(`fallback count should match data texts: fallback=${fallbackItems.length}, data=${dataTextCount}`);
}

console.log(`OK: ${scriptSrcs.length} scripts, ${domRefs.size} DOM refs, ${dataIndex.length} data files, ${dataTextCount} texts`);
