import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.join(root, filePath), 'utf8'));

const index = readJson('data/index.json');
const items = [];
for (const category of index) {
  const texts = readJson(category.file);
  for (const text of texts) items.push(text);
}

const output = `// 外部JSONが読み込めない場合の保険用課題文\n// 通常は data/index.json と data/texts/*.json を読み込む。\n// 更新する場合は npm run rebuild:fallback を実行する。\nconst TEXTS_FALLBACK = ${JSON.stringify(items, null, 2)};\n`;
fs.writeFileSync(path.join(root, 'js/modules/00-fallback-texts.js'), output, 'utf8');
console.log(`OK: rebuilt fallback with ${items.length} texts`);
