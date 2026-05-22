// 課題一覧モーダル
// 元ファイル: js/app.js から機能別に分割

// 単体テストでは 10-texts.js を読み込まない場合があるため、解析関数の最小フォールバックを持つ。
// ブラウザ実行時は 10-texts.js 側の実装が使われる。
if (typeof getAutoLengthBand !== 'function') {
  var getAutoLengthBand = function(count) {
    if (count < 2500) return 'short';
    if (count < 3500) return 'medium';
    return 'long';
  };
}

if (typeof getTextAnalysis !== 'function') {
  var getTextAnalysis = function(itemOrText) {
    if (itemOrText && typeof itemOrText === 'object' && itemOrText.analysis) return itemOrText.analysis;
    const text = itemOrText && typeof itemOrText === 'object' ? itemOrText.text : itemOrText;
    const rawChars = Array.from(String(text || ''));
    const chars = rawChars.filter(ch => !/\s/u.test(ch));
    const total = chars.length || 1;
    const count = pattern => chars.filter(ch => pattern.test(ch)).length;
    const kanji = count(/[\u3400-\u9FFF]/u);
    const alphabet = count(/[Ａ-Ｚａ-ｚA-Za-z]/u);
    const digit = count(/[０-９0-9]/u);
    const symbol = count(/[「」『』（）()【】\[\]・／/％%．.，,、。：:；;！？!?…―ー\-]/u);
    const rate = n => Math.round((n / total) * 1000) / 10;
    const difficultyScore = Math.min(10, Math.round((1 + Math.max(0, rate(kanji) - 25) / 6 + rate(symbol) / 3.5 + (rate(alphabet) + rate(digit)) / 1.8) * 10) / 10);
    const alphabetDigitRate = rate(alphabet) + rate(digit);
    const rhythmType = (rate(symbol) >= 4.0 || alphabetDigitRate >= 2.0) ? 'mixed' : 'stable';
    return {
      charCount: rawChars.length,
      kanjiRate: rate(kanji), alphabetRate: rate(alphabet), digitRate: rate(digit), symbolRate: rate(symbol),
      typeSwitchCount: 0, typeSwitchRate: 0, avgSentenceLength: total, sentenceStdDev: 0,
      rhythmType,
      difficultyScore,
      difficultyBand: difficultyScore >= 8 ? 'advanced' : (difficultyScore >= 7 ? 'standard' : 'basic')
    };
  };
}

function selectTextById(textId) {
  if (!textId || textId === RANDOM_TEXT_VALUE) {
    gameState.texts.selectionMode = 'random';
    applyRandomTextForStart();
    updateTextSelectionStatus();
    return;
  }
  gameState.texts.selectionMode = 'manual';
  applySelectedText(textId, false);
  updateTextSelectionStatus();
}

function calculateKanjiRatio(text) {
  const chars = Array.from(String(text || '').replace(/\s/g, ''));
  if (!chars.length) return 0;
  const kanjiCount = chars.filter(ch => /[\u3400-\u9FFF]/u.test(ch)).length;
  return Math.round((kanjiCount / chars.length) * 1000) / 10;
}

function getTextCharCount(item) {
  return getTextAnalysis(item).charCount;
}

function getLengthBand(item) {
  if (item && typeof item.lengthBand === 'string') return item.lengthBand;
  return getAutoLengthBand(getTextCharCount(item));
}

function getKanjiBand(item) {
  const ratio = getTextAnalysis(item).kanjiRate;
  if (ratio < 35) return 'low';
  if (ratio < 45) return 'middle';
  return 'high';
}

function estimateTextDifficulty(item) {
  return getTextAnalysis(item).difficultyBand;
}

function getTextDifficultyScore(item) {
  return getTextAnalysis(item).difficultyScore;
}
function getDifficultyLabel(value) {
  return { basic: '基礎', standard: '標準', advanced: '発展' }[value] || '標準';
}

function getTextRhythmType(item) {
  const analysis = getTextAnalysis(item);
  return analysis.rhythmType || item?.rhythmType || 'stable';
}

function makeTextAnalysisLine(item) {
  const a = getTextAnalysis(item);
  const rhythm = getRhythmLabel(getTextRhythmType(item));
  return `文字種切替 ${a.typeSwitchCount}回（${a.typeSwitchRate}%）／英字 ${a.alphabetRate}%／数字 ${a.digitRate}%／記号 ${a.symbolRate}%／平均文長 ${a.avgSentenceLength}字／リズム ${rhythm}`;
}


function getDifficultyReasonItems(item) {
  const a = getTextAnalysis(item);
  const reasons = [];

  if (a.kanjiRate >= 45) {
    reasons.push('漢字率が高めで、読み取り負荷が大きい');
  } else if (a.kanjiRate >= 38) {
    reasons.push('漢字率は標準域で、長文練習向き');
  } else {
    reasons.push('漢字率は控えめで、比較的リズムを保ちやすい');
  }

  if (a.typeSwitchRate >= 55) {
    reasons.push('文字種切替が多く、入力リズムが崩れやすい');
  } else if (a.typeSwitchRate >= 45) {
    reasons.push('文字種切替はやや多め');
  }

  const alphabetDigitRate = (a.alphabetRate || 0) + (a.digitRate || 0);
  if (alphabetDigitRate >= 2.5) {
    reasons.push('英字・数字が多く、運指切替が発生しやすい');
  } else if (alphabetDigitRate >= 1.0) {
    reasons.push('英字・数字を含み、部分的に切替負荷がある');
  }

  if (a.symbolRate >= 4.5) {
    reasons.push('句読点・カッコなどの記号が多め');
  } else if (a.symbolRate >= 3.0) {
    reasons.push('記号による小さなリズム変化がある');
  }

  if (a.avgSentenceLength >= 85) {
    reasons.push('平均文長が長く、視線維持と先読みが必要');
  } else if (a.avgSentenceLength >= 65) {
    reasons.push('一文がやや長く、集中維持が必要');
  }

  if (getTextRhythmType(item) === 'mixed') {
    reasons.push('文長や記号の変化があり、リズム切替が必要');
  } else if (reasons.length < 2) {
    reasons.push('リズムは安定型で、一定テンポを保ちやすい');
  }

  if (reasons.length === 0) {
    reasons.push('極端な負荷要素は少なく、標準的に練習しやすい');
  }

  return reasons.slice(0, 3);
}

function makeDifficultyReasonLine(item) {
  return `理由：${getDifficultyReasonItems(item).join('／')}`;
}

function getRhythmLabel(value) {
  return { stable: '安定型', mixed: '変化型', variable: '変化大' }[value] || '安定型';
}

function makeTextLibraryRecordLine(item) {
  if (typeof formatTextStatsSummary === 'function') {
    return formatTextStatsSummary(item.id);
  }
  if (typeof getLatestRecordForText !== 'function' || typeof getBestCpmRecordForText !== 'function') {
    return '練習回数：0回／最高CPM：—／最高正確率：—／最終練習：—';
  }
  const latest = getLatestRecordForText(item.id);
  const best = getBestCpmRecordForText(item.id);
  const latestText = typeof formatLibraryRecordSummary === 'function'
    ? formatLibraryRecordSummary(latest)
    : (latest ? `${latest.cpm ?? 0} CPM` : '記録なし');
  const bestText = typeof formatLibraryRecordSummary === 'function'
    ? formatLibraryRecordSummary(best)
    : (best ? `${best.cpm ?? 0} CPM` : '記録なし');
  return `直近記録：${latestText} ／ 自己ベスト：${bestText}`;
}

function getLibraryFilterElements() {
  return {
    keyword: document.getElementById('text-filter-keyword'),
    genre: document.getElementById('text-filter-genre'),
    length: document.getElementById('text-filter-length'),
    kanji: document.getElementById('text-filter-kanji'),
    difficulty: document.getElementById('text-filter-difficulty'),
    sort: document.getElementById('text-sort-mode'),
    summary: document.getElementById('text-library-filter-summary'),
    reset: document.getElementById('btn-reset-text-filters'),
  };
}

function ensureTextFilters() {
  if (!gameState.texts.filters) {
    gameState.texts.filters = { keyword: '', genre: 'all', length: 'all', kanji: 'all', difficulty: 'all', sort: 'default' };
  }
  return gameState.texts.filters;
}

function populateGenreFilter(items) {
  const { genre } = getLibraryFilterElements();
  if (!genre) return;
  const currentValue = ensureTextFilters().genre || 'all';
  const genres = new Map();
  (items || []).forEach(item => {
    const id = item.genre || 'other';
    const name = item.genreName || id;
    genres.set(id, name);
  });
  genre.innerHTML = '<option value="all">すべて</option>';
  [...genres.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ja')).forEach(([id, name]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    genre.appendChild(option);
  });
  genre.value = genres.has(currentValue) ? currentValue : 'all';
  ensureTextFilters().genre = genre.value;
}

function syncFilterControlsFromState() {
  const filters = ensureTextFilters();
  const els = getLibraryFilterElements();
  if (els.keyword) els.keyword.value = filters.keyword || '';
  ['genre', 'length', 'kanji', 'difficulty', 'sort'].forEach(key => {
    if (els[key]) els[key].value = filters[key] || 'all';
  });
}

function readFiltersFromControls() {
  const filters = ensureTextFilters();
  const els = getLibraryFilterElements();
  filters.keyword = els.keyword ? els.keyword.value.trim() : '';
  filters.genre = els.genre ? els.genre.value : 'all';
  filters.length = els.length ? els.length.value : 'all';
  filters.kanji = els.kanji ? els.kanji.value : 'all';
  filters.difficulty = els.difficulty ? els.difficulty.value : 'all';
  filters.sort = els.sort ? els.sort.value : 'default';
  return filters;
}

function resetTextFilters() {
  gameState.texts.filters = { keyword: '', genre: 'all', length: 'all', kanji: 'all', difficulty: 'all', sort: 'default' };
  syncFilterControlsFromState();
  renderTextLibrary(gameState.texts.items);
}

function isTextMatchedByFilters(item, filters) {
  if (!item) return false;
  const keyword = String(filters.keyword || '').toLowerCase();
  if (keyword) {
    const haystack = [item.title, item.genreName, item.genre, item.id, item.text]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  if (filters.genre !== 'all' && item.genre !== filters.genre) return false;
  if (filters.length !== 'all' && getLengthBand(item) !== filters.length) return false;
  if (filters.kanji !== 'all' && getKanjiBand(item) !== filters.kanji) return false;
  if (filters.difficulty !== 'all' && estimateTextDifficulty(item) !== filters.difficulty) return false;
  return true;
}

function updateFilterSummary(total, filtered) {
  const { summary } = getLibraryFilterElements();
  if (!summary) return;
  const filters = ensureTextFilters();
  const activeCount = ['genre', 'length', 'kanji', 'difficulty'].filter(key => filters[key] && filters[key] !== 'all').length
    + (filters.keyword ? 1 : 0);
  const sortLabel = filters.sort && filters.sort !== 'default' ? '／並び替え適用中' : '';
  summary.textContent = activeCount === 0
    ? `全${total}件を表示中${sortLabel}`
    : `絞り込み結果：${filtered}件 / 全${total}件${sortLabel}`;
}

function attachTextFilterEvents() {
  const els = getLibraryFilterElements();
  ['genre', 'length', 'kanji', 'difficulty', 'sort'].forEach(key => {
    const el = els[key];
    if (!el || el.dataset.filterBound === '1') return;
    el.dataset.filterBound = '1';
    el.addEventListener('change', () => {
      readFiltersFromControls();
      renderTextLibrary(gameState.texts.items);
    });
  });
  if (els.keyword && els.keyword.dataset.filterBound !== '1') {
    els.keyword.dataset.filterBound = '1';
    els.keyword.addEventListener('input', () => {
      readFiltersFromControls();
      renderTextLibrary(gameState.texts.items);
    });
  }
  if (els.reset && els.reset.dataset.filterBound !== '1') {
    els.reset.dataset.filterBound = '1';
    els.reset.addEventListener('click', resetTextFilters);
  }
}

function getDifficultyScore(value) {
  return { basic: 1, standard: 2, advanced: 3 }[value] || 2;
}

function sortTextLibraryItems(items, sortMode) {
  const list = [...(items || [])];
  switch (sortMode) {
    case 'title':
      return list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ja'));
    case 'length-asc':
      return list.sort((a, b) => getTextCharCount(a) - getTextCharCount(b));
    case 'length-desc':
      return list.sort((a, b) => getTextCharCount(b) - getTextCharCount(a));
    case 'kanji-desc':
      return list.sort((a, b) => getTextAnalysis(b).kanjiRate - getTextAnalysis(a).kanjiRate);
    case 'difficulty-desc':
      return list.sort((a, b) => getTextDifficultyScore(b) - getTextDifficultyScore(a) || getTextCharCount(b) - getTextCharCount(a));
    default:
      return list;
  }
}

// 別画面の課題一覧。基本はランダム出題のまま、必要なときだけ手動選択できる。
function renderTextLibrary(items) {
  if (!textLibraryList) return;
  const allItems = Array.isArray(items) ? items : [];
  populateGenreFilter(allItems);
  syncFilterControlsFromState();
  attachTextFilterEvents();

  const filters = readFiltersFromControls();
  const filteredItems = sortTextLibraryItems(allItems.filter(item => isTextMatchedByFilters(item, filters)), filters.sort);
  updateFilterSummary(allItems.length, filteredItems.length);

  textLibraryList.innerHTML = '';

  if (allItems.length === 0) {
    textLibraryList.innerHTML = '<p class="text-library-loading">表示できる課題文章がありません。</p>';
    return;
  }

  const randomButton = document.createElement('button');
  randomButton.type = 'button';
  randomButton.className = 'text-library-item text-library-random';
  randomButton.innerHTML = `
    <span class="text-library-title">ランダム（毎回）</span>
    <span class="text-library-meta">開始するたびに課題文章を自動で選びます。絞り込み条件は手動選択用です。</span>
  `;
  randomButton.addEventListener('click', () => {
    gameState.texts.selectionMode = 'random';
    applyRandomTextForStart();
    closeTextLibrary();
  });
  textLibraryList.appendChild(randomButton);

  if (filteredItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-library-loading';
    empty.textContent = '条件に合う課題文章がありません。絞り込み条件を変更してください。';
    textLibraryList.appendChild(empty);
    return;
  }

  filteredItems.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-library-item';
    if (item.id === gameState.texts.currentId && gameState.texts.selectionMode === 'manual') {
      button.classList.add('is-selected');
    }

    const charCount = getTextCharCount(item);
    const analysis = getTextAnalysis(item);
    const kanjiRatio = analysis.kanjiRate;
    const genreLabel = item.genreName && item.genreName !== 'other' ? `${item.genreName}／` : '';
    const difficulty = estimateTextDifficulty(item);
    const excerpt = (item.text || '').replace(/\s+/g, ' ').slice(0, 90);
    const recordLine = makeTextLibraryRecordLine(item);
    const analysisLine = makeTextAnalysisLine(item);
    const difficultyReasonLine = makeDifficultyReasonLine(item);

    button.innerHTML = `
      <span class="text-library-title"><strong>${index + 1}. ${escapeHtml(item.title)}</strong></span>
      <span class="text-library-meta">${escapeHtml(genreLabel)}${charCount.toLocaleString()}字程度／漢字含有率 ${kanjiRatio}%／推定難易度 ${analysis.difficultyScore}/10（${escapeHtml(getDifficultyLabel(difficulty))}）／リズム ${escapeHtml(getRhythmLabel(getTextRhythmType(item)))}</span>
      <span class="text-library-reason">${escapeHtml(difficultyReasonLine)}</span>
      <span class="text-library-analysis">${escapeHtml(analysisLine)}</span>
      <span class="text-library-records">${escapeHtml(recordLine)}</span>
      <span class="text-library-excerpt">${escapeHtml(excerpt)}${excerpt.length >= 90 ? '…' : ''}</span>
      <span class="text-library-select-label">この課題を選択</span>
    `;

    button.addEventListener('click', () => {
      selectTextById(item.id);
      closeTextLibrary();
    });
    textLibraryList.appendChild(button);
  });
}

function openTextLibrary() {
  if (!textLibraryModal) return;
  renderTextLibrary(gameState.texts.items);
  textLibraryModal.classList.remove('hidden');
  textLibraryModal.setAttribute('aria-hidden', 'false');
}

function closeTextLibrary() {
  if (!textLibraryModal) return;
  textLibraryModal.classList.add('hidden');
  textLibraryModal.setAttribute('aria-hidden', 'true');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
