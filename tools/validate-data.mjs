import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const readText = (filePath) => fs.readFileSync(path.join(root, filePath), 'utf8');
const readJson = (filePath) => JSON.parse(readText(filePath));
const exists = (filePath) => fs.existsSync(path.join(root, filePath));

const requiredCategoryKeys = ['id', 'name', 'file', 'count', 'sortOrder'];
const requiredTextKeys = ['id', 'title', 'genre', 'text'];
const recommendedTextKeys = ['charCount', 'kanjiRate', 'lengthBand', 'difficulty', 'rhythmType'];
const requiredAnalysisKeys = ['charCount', 'kanjiRate', 'difficultyScore', 'difficultyBand', 'rhythmType'];
const safeCategoryFile = /^data\/texts\/[a-z0-9_-]+\.json$/i;

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

function parseFallback() {
  const fallbackSource = readText('js/generated/fallback-texts.js');
  const fallbackMatch = fallbackSource.match(/const\s+TEXTS_FALLBACK\s*=\s*([\s\S]*);\s*$/);
  if (!fallbackMatch) fail('TEXTS_FALLBACK が見つかりません。');
  return JSON.parse(fallbackMatch[1]);
}

const index = readJson('data/index.json');
if (!Array.isArray(index)) fail('data/index.json は配列である必要があります。');

const dataTextFiles = fs.readdirSync(path.join(root, 'data/texts'));
const nonJsonInDataTexts = dataTextFiles.filter(name => !name.endsWith('.json'));
if (nonJsonInDataTexts.length) {
  fail(`data/texts にはカテゴリJSON以外を置かないでください: ${nonJsonInDataTexts.join(', ')}`);
}

const categoryIds = index.map(item => item?.id);
const duplicateCategoryIds = getDuplicates(categoryIds);
if (duplicateCategoryIds.length) fail(`カテゴリIDが重複しています: ${duplicateCategoryIds.join(', ')}`);

const sortOrders = index.map(item => item?.sortOrder);
const duplicateSortOrders = getDuplicates(sortOrders);
if (duplicateSortOrders.length) fail(`sortOrder が重複しています: ${duplicateSortOrders.join(', ')}`);

let total = 0;
const allTextIds = [];
const allItems = [];
const referencedFiles = new Set();
const warnings = [];

for (const category of index) {
  for (const key of requiredCategoryKeys) {
    if (category?.[key] === undefined || category?.[key] === null || category?.[key] === '') {
      fail(`data/index.json のカテゴリに ${key} がありません。`);
    }
  }
  if (!safeCategoryFile.test(category.file)) {
    fail(`読み込み対象外のパスです: ${category.file}`);
  }
  if (!exists(category.file)) {
    fail(`カテゴリJSONが存在しません: ${category.file}`);
  }
  referencedFiles.add(path.basename(category.file));

  const texts = readJson(category.file);
  if (!Array.isArray(texts)) fail(`${category.file} は配列である必要があります。`);
  if (texts.length !== category.count) {
    fail(`${category.name}: index count=${category.count}, actual=${texts.length}。npm run sync:texts を実行してください。`);
  }
  total += texts.length;

  for (const [indexInFile, text] of texts.entries()) {
    if (!text || typeof text !== 'object' || Array.isArray(text)) {
      fail(`${category.file} の ${indexInFile + 1} 件目が課題オブジェクトではありません。`);
    }
    for (const key of requiredTextKeys) {
      if (text?.[key] === undefined || text?.[key] === null || text?.[key] === '') {
        fail(`${category.file} の ${indexInFile + 1} 件目に ${key} がありません。`);
      }
    }
    if (text.genre !== category.id) {
      fail(`${category.file} の genre がカテゴリIDと一致しません: ${text.id}`);
    }
    allTextIds.push(text.id);
    allItems.push(text);
    for (const key of recommendedTextKeys) {
      if (text?.[key] === undefined || text?.[key] === null || text?.[key] === '') {
        warnings.push(`${category.file}: ${text.id} は ${key} を持っていません。画面上では自動算出されます。`);
      }
    }
    if (text.analysis !== undefined) {
      if (!text.analysis || typeof text.analysis !== 'object' || Array.isArray(text.analysis)) {
        fail(`${category.file}: ${text.id} の analysis がオブジェクトではありません。`);
      }
      for (const key of requiredAnalysisKeys) {
        if (text.analysis[key] === undefined || text.analysis[key] === null || text.analysis[key] === '') {
          fail(`${category.file}: ${text.id} の analysis.${key} が不足しています。`);
        }
      }
      if (!Number.isFinite(Number(text.analysis.charCount))) {
        fail(`${category.file}: ${text.id} の analysis.charCount が数値ではありません。`);
      }
      if (!Number.isFinite(Number(text.analysis.kanjiRate))) {
        fail(`${category.file}: ${text.id} の analysis.kanjiRate が数値ではありません。`);
      }
      if (!Number.isFinite(Number(text.analysis.difficultyScore))) {
        fail(`${category.file}: ${text.id} の analysis.difficultyScore が数値ではありません。`);
      }
    }
    if (typeof text.text !== 'string') {
      fail(`${category.file}: ${text.id} の本文が文字列ではありません。`);
    } else if (
      text.text.length < 1000 &&
      text.lengthBand !== 'short' &&
      text.difficulty !== 'beginner'
    ) {
      warnings.push(`${category.file}: ${text.id} は長文課題として短い可能性があります。`);
    }
  }
}

const orphanJsonFiles = dataTextFiles.filter(name => !referencedFiles.has(name));
if (orphanJsonFiles.length) {
  fail(`data/index.json から参照されていないカテゴリJSONがあります: ${orphanJsonFiles.join(', ')}`);
}

const duplicateTextIds = getDuplicates(allTextIds);
if (duplicateTextIds.length) fail(`課題文IDが重複しています: ${duplicateTextIds.join(', ')}`);

const legacyItems = readJson('texts.json');
if (!Array.isArray(legacyItems)) fail('texts.json は配列である必要があります。');
if (legacyItems.length !== total) {
  fail(`texts.json 件数が外部JSON件数と一致しません: texts.json=${legacyItems.length}, data=${total}`);
}
const legacyIds = legacyItems.map(item => item.id).join('\n');
const dataIds = allItems.map(item => item.id).join('\n');
if (legacyIds !== dataIds) {
  fail('texts.json の課題ID順が data/index.json + data/texts/*.json と一致しません。npm run sync:texts を実行してください。');
}

const fallbackItems = parseFallback();
if (fallbackItems.length !== total) {
  fail(`内蔵フォールバック件数が外部JSON件数と一致しません: fallback=${fallbackItems.length}, data=${total}`);
}
const fallbackIds = fallbackItems.map(item => item.id).join('\n');
if (fallbackIds !== dataIds) {
  fail('内蔵フォールバックの課題ID順が外部JSONと一致しません。npm run sync:texts を実行してください。');
}

console.log(`OK: ${index.length} categories, ${total} texts`);
if (warnings.length) {
  console.log('WARN:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
