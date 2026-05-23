// 課題文読み込み・選択
// 元ファイル: js/app.js から機能別に分割

// 課題文章の自動解析（第1段階）
// 文字数そのものは「体力負荷」として扱い、推定難易度の主成分には入れない。
function roundTo(value, digit = 1) {
  const base = 10 ** digit;
  return Math.round(value * base) / base;
}

function getTextCharType(ch) {
  if (/\s/u.test(ch)) return 'space';
  if (/[\u3400-\u9FFF]/u.test(ch)) return 'kanji';
  if (/[ぁ-ゖ]/u.test(ch)) return 'hiragana';
  if (/[ァ-ヺー]/u.test(ch)) return 'katakana';
  if (/[Ａ-Ｚａ-ｚA-Za-z]/u.test(ch)) return 'alphabet';
  if (/[０-９0-9]/u.test(ch)) return 'digit';
  if (/[「」『』（）()【】\[\]・／/％%．.，,、。：:；;！？!?…―ー\-]/u.test(ch)) return 'symbol';
  return 'other';
}

function analyzeTextMetrics(text) {
  const rawChars = Array.from(String(text || ''));
  const chars = rawChars.filter(ch => !/\s/u.test(ch));
  const total = chars.length || 1;
  const counts = {
    kanji: 0,
    hiragana: 0,
    katakana: 0,
    alphabet: 0,
    digit: 0,
    symbol: 0,
    other: 0,
  };

  let previousType = null;
  let typeSwitchCount = 0;
  chars.forEach(ch => {
    const type = getTextCharType(ch);
    if (counts[type] !== undefined) counts[type] += 1;
    if (type !== 'space' && previousType && previousType !== type) typeSwitchCount += 1;
    if (type !== 'space') previousType = type;
  });

  const sentenceParts = String(text || '')
    .split(/[。！？!?]+/u)
    .map(part => Array.from(part).filter(ch => !/\s/u.test(ch)).length)
    .filter(len => len > 0);
  const avgSentenceLength = sentenceParts.length
    ? sentenceParts.reduce((sum, len) => sum + len, 0) / sentenceParts.length
    : total;
  const sentenceVariance = sentenceParts.length
    ? sentenceParts.reduce((sum, len) => sum + ((len - avgSentenceLength) ** 2), 0) / sentenceParts.length
    : 0;
  const sentenceStdDev = Math.sqrt(sentenceVariance);

  const kanjiRate = (counts.kanji / total) * 100;
  const alphabetRate = (counts.alphabet / total) * 100;
  const digitRate = (counts.digit / total) * 100;
  const symbolRate = (counts.symbol / total) * 100;
  const typeSwitchRate = (typeSwitchCount / total) * 100;

  // 0〜10点の推定難易度。長文サイトの特性上、文字数そのものは加点しない。
  // 漢字率・文字種切替・記号/英字/数字・平均文長を合成する。
  const kanjiScore = Math.min(4.0, Math.max(0, (kanjiRate - 25) / 6));
  const switchScore = Math.min(2.2, typeSwitchRate / 8);
  const symbolScore = Math.min(1.2, symbolRate / 3.5);
  const alphabetDigitScore = Math.min(1.4, (alphabetRate + digitRate) / 1.8);
  const sentenceScore = Math.min(1.2, Math.max(0, (avgSentenceLength - 55) / 35));
  const difficultyScore = roundTo(Math.min(10, 1 + kanjiScore + switchScore + symbolScore + alphabetDigitScore + sentenceScore), 1);
  const difficultyBand = difficultyScore >= 8 ? 'advanced' : (difficultyScore >= 7 ? 'standard' : 'basic');

  // リズム型は「打鍵テンポの崩れやすさ」を示す補助指標。
  // 文長ばらつき、記号率、英数字率、文字種切替率から安定型／変化型を自動判定する。
  const alphabetDigitRate = alphabetRate + digitRate;
  const rhythmLoad =
    (typeSwitchRate >= 50 ? 1 : 0) +
    (symbolRate >= 4.0 ? 1 : 0) +
    (alphabetDigitRate >= 2.0 ? 1 : 0) +
    (sentenceStdDev >= 35 ? 1 : 0) +
    (avgSentenceLength >= 85 ? 1 : 0);
  const rhythmType = rhythmLoad >= 2 ? 'mixed' : 'stable';

  return {
    charCount: rawChars.length,
    countWithoutSpaces: chars.length,
    kanjiCount: counts.kanji,
    alphabetCount: counts.alphabet,
    digitCount: counts.digit,
    symbolCount: counts.symbol,
    kanjiRate: roundTo(kanjiRate, 1),
    alphabetRate: roundTo(alphabetRate, 1),
    digitRate: roundTo(digitRate, 1),
    symbolRate: roundTo(symbolRate, 1),
    typeSwitchCount,
    typeSwitchRate: roundTo(typeSwitchRate, 1),
    avgSentenceLength: roundTo(avgSentenceLength, 1),
    sentenceStdDev: roundTo(sentenceStdDev, 1),
    rhythmType,
    difficultyScore,
    difficultyBand,
  };
}

function getTextAnalysis(itemOrText) {
  if (itemOrText && typeof itemOrText === 'object' && itemOrText.analysis) return itemOrText.analysis;
  const text = itemOrText && typeof itemOrText === 'object' ? itemOrText.text : itemOrText;
  return analyzeTextMetrics(text);
}

function getAutoLengthBand(count) {
  const n = Number(count) || 0;
  if (n < 500) return 'under-500';
  if (n < 1000) return 'under-1000';
  if (n < 1500) return 'under-1500';
  if (n < 2000) return 'under-2000';
  if (n < 2500) return 'under-2500';
  if (n < 3000) return 'under-3000';
  if (n < 3500) return 'under-3500';
  return 'over-3500';
}

function normalizeTextItem(item, index, genreInfo = null) {
  if (!item || typeof item.text !== 'string') return null;
  const title = typeof item.title === 'string' && item.title.trim()
    ? item.title.trim()
    : `課題文 ${index + 1}`;
  const baseId = typeof item.id === 'string' && item.id.trim()
    ? item.id.trim()
    : `text-${index + 1}`;
  const genre = typeof item.genre === 'string' && item.genre.trim()
    ? item.genre.trim()
    : (genreInfo && genreInfo.id ? genreInfo.id : 'other');
  const genreName = genreInfo && genreInfo.name ? genreInfo.name : genre;
  const analysis = analyzeTextMetrics(item.text);
  const charCount = analysis.charCount;
  const length = typeof item.length === 'number' ? item.length : charCount;
  const kanjiRate = analysis.kanjiRate;
  const lengthBand = getAutoLengthBand(charCount);
  const difficulty = analysis.difficultyBand;
  const rhythmType = analysis.rhythmType;
  return {
    id: baseId,
    title,
    genre,
    genreName,
    length,
    charCount,
    kanjiRate,
    lengthBand,
    difficulty,
    difficultyScore: analysis.difficultyScore,
    rhythmType,
    hasNumbers: analysis.digitCount > 0,
    hasAlphabet: analysis.alphabetCount > 0,
    hasBrackets: /[「」『』（）()【】\[\]]/u.test(item.text),
    symbolCount: analysis.symbolCount,
    analysis,
    text: item.text
  };
}
function dedupeTextIds(items) {
  const seen = new Map();
  return items.map((item, index) => {
    const count = seen.get(item.id) || 0;
    seen.set(item.id, count + 1);
    if (count === 0) return item;
    return { ...item, id: `${item.id}-${count + 1}` };
  });
}


function isSafeTextFilePath(filePath) {
  // data/index.json はサイト管理者が編集する前提だが、念のため読み込み先を data/texts/*.json に限定する。
  // 外部URL、親ディレクトリ参照、別階層のファイルを読み込まないことで、将来の編集ミスにも強くする。
  return typeof filePath === 'string' && /^data\/texts\/[a-z0-9_-]+\.json$/i.test(filePath.trim());
}

function summarizeTextCollection(items, categories = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const countBy = getter => safeItems.reduce((acc, item) => {
    const key = getter(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const length = countBy(item => getLengthBand(item));
  const difficulty = countBy(item => estimateTextDifficulty(item));
  const rhythm = countBy(item => getTextRhythmType(item));
  const categoryWarnings = (categories || [])
    .filter(category => Number.isFinite(category.count) && category.actualCount !== category.count)
    .map(category => `${category.name || category.id}: index ${category.count}件 / 実数 ${category.actualCount}件`);

  const warnings = [...categoryWarnings];
  if (!length['over-3500']) warnings.push('3500字超の課題がありません。');
  if (!difficulty.advanced) warnings.push('推定難易度「発展」の課題がありません。');
  if (!rhythm.mixed && !rhythm.variable) warnings.push('リズム「変化型」の課題がありません。');

  return {
    total: safeItems.length,
    length,
    difficulty,
    rhythm,
    categories,
    warnings,
  };
}

async function loadTextsFromIndex() {
  const indexResponse = await fetch('data/index.json', { cache: 'no-store' });
  if (!indexResponse.ok) throw new Error(`data/index.json の読み込みに失敗しました: ${indexResponse.status}`);

  const categories = await indexResponse.json();
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('data/index.json に有効なカテゴリがありません。');
  }

  const loadedGroups = await Promise.all(categories.map(async (category) => {
    if (!category || typeof category.file !== 'string') return { category, items: [] };
    const safeFile = category.file.trim();
    if (!isSafeTextFilePath(safeFile)) {
      console.warn('安全でない課題JSONのパスをスキップしました。', category.file);
      return { category, items: [] };
    }
    const response = await fetch(safeFile, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${safeFile} の読み込みに失敗しました: ${response.status}`);
    const data = await response.json();
    const source = Array.isArray(data) ? data : data.texts;
    const items = Array.isArray(source)
      ? source.map((item, index) => normalizeTextItem(item, index, category)).filter(Boolean)
      : [];
    return {
      category: { ...category, actualCount: items.length },
      items,
    };
  }));

  const loaded = dedupeTextIds(loadedGroups.flatMap(group => group.items));
  if (typeof gameState !== 'undefined' && gameState.texts) {
    const categoryDiagnostics = loadedGroups.map(group => group.category).filter(Boolean);
    const summary = summarizeTextCollection(loaded, categoryDiagnostics);
    gameState.texts.diagnostics = {
      source: 'data/index.json',
      categories: categoryDiagnostics,
      summary,
      warnings: summary.warnings,
    };
    if (gameState.texts.diagnostics.warnings.length) {
      console.info('課題データ自己診断:', gameState.texts.diagnostics.warnings);
    }
  }
  return loaded;
}

async function loadTextsFromLegacyFile() {
  const response = await fetch('texts.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`texts.json の読み込みに失敗しました: ${response.status}`);
  const data = await response.json();
  const source = Array.isArray(data) ? data : data.texts;
  const loaded = Array.isArray(source)
    ? source.map((item, index) => normalizeTextItem(item, index)).filter(Boolean)
    : [];
  const deduped = dedupeTextIds(loaded);
  if (typeof gameState !== 'undefined' && gameState.texts) {
    const summary = summarizeTextCollection(deduped, []);
    gameState.texts.diagnostics = {
      source: 'texts.json',
      categories: [],
      summary,
      warnings: summary.warnings,
    };
  }
  return deduped;
}

const RANDOM_TEXT_VALUE = '__random__';

function populateTextSelect(items) {
  // 課題文プルダウンは廃止。課題選択は「課題一覧」モーダルに一本化する。
  // 既存の呼び出しとの互換性のため、関数名だけ残しておく。
}

function applySelectedText(textId, keepRandomSelection = false) {
  const selected = gameState.texts.items.find(item => item.id === textId) || gameState.texts.items[0];
  if (!selected) return;
  gameState.texts.currentText = selected.text;
  gameState.texts.currentTitle = selected.title;
  gameState.texts.currentId = selected.id;

  if (taskTitle) taskTitle.textContent = `// 課題文 — ${gameState.texts.currentTitle}`;
  updateTextSelectionStatus();
  if (!gameState.session.running && !gameState.countdown.active) {
    typingArea.value = '';
    resultScreen.style.display = 'none';
    initDisplay();
  }
}

// ホーム画面に「いま手動選択中／ランダム」を小さく表示するためのヘルパ。
// applySelectedText / applyRandomTextForStart / selectTextById から呼ばれる。
function updateTextSelectionStatus() {
  const el = document.getElementById('text-selection-status');
  if (!el) return;
  const currentItem = Array.isArray(gameState.texts.items)
    ? gameState.texts.items.find(item => item.id === gameState.texts.currentId)
    : null;
  const analysis = currentItem ? getTextAnalysis(currentItem) : null;
  const scoreText = analysis ? `／推定難易度 ${analysis.difficultyScore}/10` : '';
  const rhythmText = currentItem && typeof getTextRhythmType === 'function' && typeof getRhythmLabel === 'function'
    ? `／リズム ${getRhythmLabel(getTextRhythmType(currentItem))}`
    : '';
  const reasonText = currentItem && typeof makeDifficultyReasonLine === 'function'
    ? `／${makeDifficultyReasonLine(currentItem)}`
    : '';

  if (gameState.texts.selectionMode === 'manual') {
    el.textContent = `出題: 手動選択中（${gameState.texts.currentTitle}${scoreText}${rhythmText}）${reasonText}`;
    el.classList.add('is-manual');
  } else {
    el.textContent = currentItem
      ? `出題: ランダム（毎回）／現在の課題: ${gameState.texts.currentTitle}${scoreText}${rhythmText}${reasonText}`
      : '出題: ランダム（毎回）';
    el.classList.remove('is-manual');
  }
}

// 登録済み課題文からランダムに1つ選ぶ。
// 2題以上ある場合は、直前と同じ課題文が連続しにくいようにする。
function applyRandomTextForStart() {
  if (!Array.isArray(gameState.texts.items) || gameState.texts.items.length === 0) return;

  let candidates = gameState.texts.items;
  if (gameState.texts.items.length > 1 && gameState.texts.lastRandomTextId) {
    candidates = gameState.texts.items.filter(item => item.id !== gameState.texts.lastRandomTextId);
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)] || gameState.texts.items[0];
  gameState.texts.lastRandomTextId = selected.id;

  // 選択欄は「ランダム（毎回）」のままにして、実際の課題文だけを差し替える。
  applySelectedText(selected.id, true);
  // applySelectedText の中で updateTextSelectionStatus は呼ばれているが、
  // gameState.texts.selectionMode の値で表示が決まるため、ここでもう一度呼んで
  // 「ランダム」と「手動選択中」の表示を正しく区別する。
  updateTextSelectionStatus();
}

async function loadTexts() {
  // 初期表示でも課題一覧が少なく見えないように、まず内蔵フォールバックを表示してから外部JSONで更新する。
  populateTextSelect(gameState.texts.items);
  applyRandomTextForStart();

  let loaded = [];

  try {
    loaded = await loadTextsFromIndex();
  } catch (indexError) {
    console.warn('ジャンル別JSONを読み込めませんでした。texts.json を確認します。', indexError);
  }

  // data/index.json が読めなかった場合だけ、旧 texts.json を予備として使う。
  // 両方を常に併読すると同じ課題が重複表示されるため、正規ルートは data/index.json に一本化する。
  if (!Array.isArray(loaded) || loaded.length === 0) {
    try {
      loaded = await loadTextsFromLegacyFile();
    } catch (legacyError) {
      console.warn('texts.json を読み込めませんでした。', legacyError);
    }
  }

  if (Array.isArray(loaded) && loaded.length > 0) {
    // loadTextsFromIndex / loadTextsFromLegacyFile の中で dedupe 済みなので、
    // ここで再度 dedupeTextIds をかける必要はない。
    gameState.texts.items = loaded;
    populateTextSelect(gameState.texts.items);
    applyRandomTextForStart();

    // 読み込み完了後に課題一覧を開いている場合は、一覧も即座に更新する。
    if (textLibraryModal && !textLibraryModal.classList.contains('hidden')) {
      renderTextLibrary(gameState.texts.items);
    }
  } else {
    console.warn('外部JSONを読み込めないため、内蔵の課題文で起動します。');
  }
}



const btnTextLibrary = document.getElementById('btn-text-library');
const textLibraryModal = document.getElementById('text-library-modal');
const textLibraryList = document.getElementById('text-library-list');
const btnCloseLibrary = document.getElementById('btn-close-library');

