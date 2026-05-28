import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const resolveRoot = (...parts) => path.join(root, ...parts);
const readJson = (filePath) => JSON.parse(fs.readFileSync(resolveRoot(filePath), 'utf8'));
const writeJson = (filePath, data) => {
  fs.writeFileSync(resolveRoot(filePath), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const safeCategoryFile = /^data\/texts\/[a-z0-9_-]+\.json$/i;
const index = readJson('data/index.json')
  .slice()
  .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));

const allItems = [];
const updatedIndex = [];

for (const category of index) {
  if (!safeCategoryFile.test(category.file || '')) {
    throw new Error(`読み込み対象外のカテゴリファイルです: ${category.file}`);
  }

  const texts = readJson(category.file);
  if (!Array.isArray(texts)) {
    throw new Error(`${category.file} は配列である必要があります。`);
  }

  for (const [i, item] of texts.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${category.file} の ${i + 1} 件目が課題オブジェクトではありません。`);
    }
    if (item.genre !== category.id) {
      throw new Error(`${category.file} の ${item.id || `${i + 1}件目`} は genre がカテゴリIDと一致しません。`);
    }
    allItems.push(item);
  }

  updatedIndex.push({
    ...category,
    count: texts.length,
  });
}

const fallback = `// 外部JSONが読み込めない場合の保険用課題文\n// 通常は data/index.json と data/texts/*.json を読み込む。\n// 更新する場合は npm run sync:texts を実行する。\nconst TEXTS_FALLBACK = ${JSON.stringify(allItems, null, 2)};\n`;

writeJson('data/index.json', updatedIndex);
writeJson('texts.json', allItems);
fs.writeFileSync(resolveRoot('js/generated/fallback-texts.js'), fallback, 'utf8');

console.log(`OK: synced ${updatedIndex.length} categories, ${allItems.length} texts`);
console.log('Updated: data/index.json, texts.json, js/generated/fallback-texts.js');
