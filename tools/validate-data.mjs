import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const readText = (filePath) => fs.readFileSync(path.join(root, filePath), 'utf8');
const readJson = (filePath) => JSON.parse(readText(filePath));

const requiredCategoryKeys = ['id', 'name', 'file', 'count', 'sortOrder'];
const requiredTextKeys = ['id', 'title', 'genre', 'text'];
const recommendedTextKeys = ['charCount', 'kanjiRate', 'lengthBand', 'difficulty', 'rhythmType'];

function fail(message) {
  throw new Error(message);
}

function getDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

const index = readJson('data/index.json');
if (!Array.isArray(index)) fail('data/index.json は配列である必要があります。');

const categoryIds = index.map(item => item?.id);
const duplicateCategoryIds = getDuplicates(categoryIds);
if (duplicateCategoryIds.length) fail(`カテゴリIDが重複しています: ${duplicateCategoryIds.join(', ')}`);

const sortOrders = index.map(item => item?.sortOrder);
const duplicateSortOrders = getDuplicates(sortOrders);
if (duplicateSortOrders.length) fail(`sortOrder が重複しています: ${duplicateSortOrders.join(', ')}`);

let total = 0;
const allTextIds = [];
const warnings = [];

for (const category of index) {
  for (const key of requiredCategoryKeys) {
    if (category?.[key] === undefined || category?.[key] === null || category?.[key] === '') {
      fail(`data/index.json のカテゴリに ${key} がありません。`);
    }
  }
  if (!/^data\/texts\/[a-z0-9_-]+\.json$/i.test(category.file)) {
    fail(`読み込み対象外のパスです: ${category.file}`);
  }
  if (!fs.existsSync(path.join(root, category.file))) {
    fail(`カテゴリJSONが存在しません: ${category.file}`);
  }

  const texts = readJson(category.file);
  if (!Array.isArray(texts)) fail(`${category.file} は配列である必要があります。`);
  if (texts.length !== category.count) {
    warnings.push(`${category.name}: index count=${category.count}, actual=${texts.length}`);
  }
  total += texts.length;

  for (const [indexInFile, text] of texts.entries()) {
    for (const key of requiredTextKeys) {
      if (text?.[key] === undefined || text?.[key] === null || text?.[key] === '') {
        fail(`${category.file} の ${indexInFile + 1} 件目に ${key} がありません。`);
      }
    }
    if (text.genre !== category.id) {
      fail(`${category.file} の genre がカテゴリIDと一致しません: ${text.id}`);
    }
    allTextIds.push(text.id);
    for (const key of recommendedTextKeys) {
      if (text?.[key] === undefined || text?.[key] === null || text?.[key] === '') {
        warnings.push(`${category.file}: ${text.id} は ${key} を持っていません。画面上では自動算出されます。`);
      }
    }
    if (typeof text.text !== 'string') {
      warnings.push(`${category.file}: ${text.id} の本文が文字列ではありません。`);
    } else if (
      text.text.length < 1000 &&
      text.lengthBand !== 'short' &&
      text.difficulty !== 'beginner'
    ) {
      warnings.push(`${category.file}: ${text.id} は長文課題として短い可能性があります。`);
    }
  }
}

const duplicateTextIds = getDuplicates(allTextIds);
if (duplicateTextIds.length) fail(`課題文IDが重複しています: ${duplicateTextIds.join(', ')}`);

const fallbackSource = readText('js/modules/00-fallback-texts.js');
const fallbackMatch = fallbackSource.match(/const\s+TEXTS_FALLBACK\s*=\s*([\s\S]*);\s*$/);
if (!fallbackMatch) fail('TEXTS_FALLBACK が見つかりません。');
const fallbackItems = JSON.parse(fallbackMatch[1]);
if (fallbackItems.length !== total) {
  warnings.push(`内蔵フォールバック件数が外部JSON件数と一致しません: fallback=${fallbackItems.length}, data=${total}`);
}

console.log(`OK: ${index.length} categories, ${total} texts`);
if (warnings.length) {
  console.log('WARN:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
