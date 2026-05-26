// 課題一覧モーダル
// 元ファイル: js/app.js から機能別に分割

// 単体テストでは 10-texts.js を読み込まない場合があるため、解析関数の最小フォールバックを持つ。
// ブラウザ実行時は 10-texts.js 側の実装が使われる。
if (typeof getAutoLengthBand !== 'function') {
  var getAutoLengthBand = function(count) {
    const n = Number(count) || 0;
    if (n < 500) return 'under-500';
    if (n < 1000) return 'under-1000';
    if (n < 1500) return 'under-1500';
    if (n < 2000) return 'under-2000';
    if (n < 2500) return 'under-2500';
    if (n < 3000) return 'under-3000';
    if (n < 3500) return 'under-3500';
    return 'over-3500';
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


const GENRE_LABELS_JA = {
  society: '社会・教育',
  science_health: '科学・医療',
  technology: '技術・産業',
  culture: '文化・芸術',
  history: '歴史',
  business: '経済・金融',
  food: '食',
  nature: '自然・環境',
  sports_tourism: 'スポーツ・観光',
  daily_life: '暮らし・道具',
  // 旧カテゴリIDの記録や古いフォールバックが残っている場合の互換表示
  science: '科学',
  hobbies: '趣味'
};

const GENRE_DISPLAY_ORDER = ['society', 'science_health', 'technology', 'culture', 'history', 'business', 'food', 'nature', 'sports_tourism', 'daily_life', 'science', 'hobbies'];

function getGenreSortIndex(id) {
  const index = GENRE_DISPLAY_ORDER.indexOf(id);
  return index === -1 ? GENRE_DISPLAY_ORDER.length : index;
}


function isTextLibraryDeveloperMode() {
  return !!(document.body && document.body.dataset && document.body.dataset.textLibraryDeveloperMode === '1');
}

function setTextLibraryDeveloperMode(enabled) {
  if (!document.body || !document.body.dataset) return;
  if (enabled) {
    document.body.dataset.textLibraryDeveloperMode = '1';
  } else {
    delete document.body.dataset.textLibraryDeveloperMode;
  }
}

function clearTextLibraryDiagnostics() {
  const { diagnostics } = getLibraryFilterElements();
  if (!diagnostics) return;
  diagnostics.classList.remove('has-notice');
  diagnostics.innerHTML = '';
}

function getGenreLabelJa(value) {
  if (!value) return 'その他';
  const raw = String(value).trim();
  const key = raw.toLowerCase();
  return GENRE_LABELS_JA[raw] || GENRE_LABELS_JA[key] || raw || 'その他';
}

function getItemGenreLabel(item) {
  if (!item) return 'その他';
  return getGenreLabelJa(item.genre || item.genreName || 'other');
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
  // 文字数帯は表示・絞り込みの中心なので、保存済みメタ情報に古い値が残っていても
  // 実際の本文文字数から毎回再判定する。
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


function normalizePracticeLevelValue(value, item = null) {
  const raw = value == null ? '' : String(value).trim().toLowerCase();
  if (['beginner', 'easy', 'intro', 'basic', '1'].includes(raw)) return 'beginner';
  if (['standard', 'normal', 'middle', 'regular', '2'].includes(raw)) return 'standard';
  if (['advanced', 'hard', 'expert', '3'].includes(raw)) return 'advanced';

  const count = item ? getTextCharCount(item) : 0;
  const difficulty = item ? estimateTextDifficulty(item) : 'standard';
  const kanjiRate = item ? getTextAnalysis(item).kanjiRate : 0;
  const beginner = !!(item && item.beginner) || (count > 0 && count < 1000 && difficulty === 'basic' && kanjiRate <= 40);
  return beginner ? 'beginner' : ((difficulty === 'advanced' || count >= 3500) ? 'advanced' : 'standard');
}

function getPracticeLevel(item) {
  if (!item) return 'standard';
  return normalizePracticeLevelValue(item.practiceLevel, item);
}

function getPracticeLevelLabel(value) {
  return { beginner: '初心者向け', standard: '標準練習', advanced: '発展練習' }[value] || '標準練習';
}
function getDifficultyLabel(value) {
  return { basic: '基礎', standard: '標準', advanced: '発展' }[value] || '標準';
}

function getLengthBandLabel(value) {
  return {
    'under-500': '500字未満',
    'under-1000': '500〜999字',
    'under-1500': '1000〜1499字',
    'under-2000': '1500〜1999字',
    'under-2500': '2000〜2499字',
    'under-3000': '2500〜2999字',
    'under-3500': '3000〜3499字',
    'over-3500': '3500字超',
  }[value] || '文字数未分類';
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
  return `特徴：${getDifficultyReasonItems(item).join('／')}`;
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
    practiceLevel: document.getElementById('text-filter-practice-level'),
    sort: document.getElementById('text-sort-mode'),
    summary: document.getElementById('text-library-filter-summary'),
    diagnostics: document.getElementById('text-library-diagnostics'),
    browser: document.getElementById('text-library-browser'),
    reset: document.getElementById('btn-reset-text-filters'),
  };
}

function ensureTextFilters() {
  if (!gameState.texts.filters) {
    gameState.texts.filters = { keyword: '', genre: 'all', length: 'all', kanji: 'all', difficulty: 'all', practiceLevel: 'all', sort: 'default' };
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
    const name = getItemGenreLabel(item);
    genres.set(id, name);
  });
  genre.innerHTML = '<option value="all">すべて</option>';
  [...genres.entries()].sort((a, b) => getGenreSortIndex(a[0]) - getGenreSortIndex(b[0]) || a[1].localeCompare(b[1], 'ja')).forEach(([id, name]) => {
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
  ['genre', 'length', 'kanji', 'difficulty', 'practiceLevel', 'sort'].forEach(key => {
    if (els[key]) els[key].value = filters[key] || 'all';
  });
}

function countLibraryValues(items, getter) {
  return (items || []).reduce((acc, item) => {
    const key = getter(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function matchesLibraryFiltersExcept(item, filters, exceptKey) {
  const next = { ...(filters || {}) };
  if (exceptKey) next[exceptKey] = 'all';
  return isTextMatchedByFilters(item, next);
}

function countLibraryValuesWithCurrentFilters(items, getter, exceptKey) {
  const filters = ensureTextFilters();
  return countLibraryValues((items || []).filter(item => matchesLibraryFiltersExcept(item, filters, exceptKey)), getter);
}

function setOptionCountLabels(select, labels, counts) {
  if (!select) return;
  [...select.options].forEach(option => {
    if (option.value === 'all') {
      option.disabled = false;
      return;
    }
    const count = counts[option.value] || 0;
    const baseLabel = labels[option.value] || option.textContent.replace(/（.*?件）$/u, '');
    option.textContent = `${baseLabel}（${count}件）`;
    option.disabled = count === 0;
  });
}

function updateFilterOptionAvailability(items) {
  const els = getLibraryFilterElements();
  const filters = ensureTextFilters();
  // 件数表示は「現在の他条件を反映した件数」にする。
  // 以前は全課題の件数を表示していたため、別条件との組み合わせで0件になる条件でも
  // 「500字未満（○件）」のように表示され、選ぶと何も出ない状態になっていた。
  const lengthCounts = countLibraryValuesWithCurrentFilters(items, item => getLengthBand(item), 'length');
  const kanjiCounts = countLibraryValuesWithCurrentFilters(items, item => getKanjiBand(item), 'kanji');
  const difficultyCounts = countLibraryValuesWithCurrentFilters(items, item => estimateTextDifficulty(item), 'difficulty');
  const practiceLevelCounts = countLibraryValuesWithCurrentFilters(items, item => getPracticeLevel(item), 'practiceLevel');

  setOptionCountLabels(els.length, {
    'under-500': '500字未満',
    'under-1000': '500〜999字',
    'under-1500': '1000〜1499字',
    'under-2000': '1500〜1999字',
    'under-2500': '2000〜2499字',
    'under-3000': '2500〜2999字',
    'under-3500': '3000〜3499字',
    'over-3500': '3500字超',
  }, lengthCounts);
  setOptionCountLabels(els.kanji, {
    low: '低め（35％未満）',
    middle: '標準（35〜44.9％）',
    high: '高め（45％以上）',
  }, kanjiCounts);
  setOptionCountLabels(els.difficulty, {
    basic: '基礎',
    standard: '標準',
    advanced: '発展',
  }, difficultyCounts);
  setOptionCountLabels(els.practiceLevel, {
    beginner: '初心者向け',
    standard: '標準練習',
    advanced: '発展練習',
  }, practiceLevelCounts);

  ['length', 'kanji', 'difficulty', 'practiceLevel'].forEach(key => {
    const select = els[key];
    if (select && select.value !== 'all') {
      const selected = select.options[select.selectedIndex];
      if (selected && selected.disabled) {
        select.value = 'all';
        filters[key] = 'all';
      }
    }
  });
}

function renderTextLibraryDiagnostics(items) {
  const { diagnostics } = getLibraryFilterElements();
  if (!diagnostics) return;
  if (!isTextLibraryDeveloperMode()) {
    clearTextLibraryDiagnostics();
    return;
  }
  const summary = (gameState.texts.diagnostics && gameState.texts.diagnostics.summary)
    || (typeof summarizeTextCollection === 'function' ? summarizeTextCollection(items, []) : null);
  if (!summary) {
    diagnostics.classList.remove('has-notice');
    diagnostics.innerHTML = '';
    return;
  }

  const length = summary.length || {};
  const difficulty = summary.difficulty || {};
  const rhythm = summary.rhythm || {};
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const source = (gameState.texts.diagnostics && gameState.texts.diagnostics.source) || '課題データ';
  const warningList = warnings.length
    ? `<ul>${warnings.slice(0, 6).map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
    : '';

  diagnostics.classList.add('has-notice');
  diagnostics.innerHTML = `
    <div><strong>開発者向け：課題データ診断</strong>：${escapeHtml(source)} から ${summary.total || 0}件を読み込みました。</div>
    <div>文字数帯：500字未満 ${length['under-500'] || 0}件／1000字未満 ${length['under-1000'] || 0}件／1500字未満 ${length['under-1500'] || 0}件／2000字未満 ${length['under-2000'] || 0}件／2500字未満 ${length['under-2500'] || 0}件／3000字未満 ${length['under-3000'] || 0}件／3500字未満 ${length['under-3500'] || 0}件／3500字超 ${length['over-3500'] || 0}件</div>
    <div>難易度：基礎 ${difficulty.basic || 0}件／標準 ${difficulty.standard || 0}件／発展 ${difficulty.advanced || 0}件　リズム：安定型 ${rhythm.stable || 0}件／変化型 ${rhythm.mixed || 0}件</div>
    ${warningList}
  `;
}

function readFiltersFromControls() {
  const filters = ensureTextFilters();
  const els = getLibraryFilterElements();
  filters.keyword = els.keyword ? els.keyword.value.trim() : '';
  filters.genre = els.genre ? els.genre.value : 'all';
  filters.length = els.length ? els.length.value : 'all';
  filters.kanji = els.kanji ? els.kanji.value : 'all';
  filters.difficulty = els.difficulty ? els.difficulty.value : 'all';
  filters.practiceLevel = els.practiceLevel ? els.practiceLevel.value : 'all';
  filters.sort = els.sort ? els.sort.value : 'default';
  return filters;
}

function resetTextFilters() {
  gameState.texts.filters = { keyword: '', genre: 'all', length: 'all', kanji: 'all', difficulty: 'all', practiceLevel: 'all', sort: 'default' };
  if (textLibraryList && textLibraryList.dataset) delete textLibraryList.dataset.showAll;
  resetTextLibraryPage();
  syncFilterControlsFromState();
  renderTextLibrary(gameState.texts.items);
}

function isTextMatchedByFilters(item, filters) {
  if (!item) return false;
  const keyword = String(filters.keyword || '').toLowerCase();
  if (keyword) {
    const haystack = [item.title, item.genreName, item.genre, getItemGenreLabel(item), item.id, item.text]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  if (filters.genre !== 'all' && item.genre !== filters.genre) return false;
  if (filters.length !== 'all' && getLengthBand(item) !== filters.length) return false;
  if (filters.kanji !== 'all' && getKanjiBand(item) !== filters.kanji) return false;
  if (filters.difficulty !== 'all' && estimateTextDifficulty(item) !== filters.difficulty) return false;
  if (filters.practiceLevel && filters.practiceLevel !== 'all' && getPracticeLevel(item) !== filters.practiceLevel) return false;
  return true;
}


function getRecentTextIds(limit = 5) {
  if (typeof readRecordsStore !== 'function') return [];
  const store = readRecordsStore();
  const history = Array.isArray(store.history) ? store.history : [];
  const ids = [];
  history.forEach(record => {
    if (!record || !record.textId || ids.includes(record.textId)) return;
    ids.push(record.textId);
  });
  return ids.slice(0, limit);
}

function getRecentLibraryItems(items, limit = 5) {
  const source = Array.isArray(items) ? items : [];
  const byId = new Map(source.map(item => [item.id, item]));
  const recent = getRecentTextIds(limit).map(id => byId.get(id)).filter(Boolean);
  return recent.slice(0, limit);
}

function hasActiveLibraryFilters(filters) {
  const f = filters || ensureTextFilters();
  return !!(
    String(f.keyword || '').trim() ||
    (f.genre && f.genre !== 'all') ||
    (f.length && f.length !== 'all') ||
    (f.kanji && f.kanji !== 'all') ||
    (f.difficulty && f.difficulty !== 'all') ||
    (f.practiceLevel && f.practiceLevel !== 'all')
  );
}


function getActiveLibraryFilterChips(filters) {
  const f = filters || ensureTextFilters();
  const chips = [];
  if (String(f.keyword || '').trim()) chips.push({ key: 'keyword', label: `検索：${f.keyword}` });
  if (f.genre && f.genre !== 'all') chips.push({ key: 'genre', label: `分類：${getGenreLabelJa(f.genre)}` });
  if (f.length && f.length !== 'all') chips.push({ key: 'length', label: `文字数：${getLengthBandLabel(f.length)}` });
  if (f.kanji && f.kanji !== 'all') {
    chips.push({ key: 'kanji', label: `漢字率：${{ low: '低め', middle: '標準', high: '高め' }[f.kanji] || f.kanji}` });
  }
  if (f.difficulty && f.difficulty !== 'all') chips.push({ key: 'difficulty', label: `難易度：${getDifficultyLabel(f.difficulty)}` });
  if (f.practiceLevel && f.practiceLevel !== 'all') chips.push({ key: 'practiceLevel', label: `練習段階：${getPracticeLevelLabel(f.practiceLevel)}` });
  if (f.sort && f.sort !== 'default') {
    const sortLabels = {
      title: 'タイトル順',
      'length-asc': '短い順',
      'length-desc': '長い順',
      'kanji-desc': '漢字率順',
      'difficulty-desc': '難易度順'
    };
    chips.push({ key: 'sort', label: `並び：${sortLabels[f.sort] || f.sort}` });
  }
  return chips;
}

function clearLibraryFilterKey(key) {
  const filters = ensureTextFilters();
  if (key === 'keyword') filters.keyword = '';
  else if (key === 'sort') filters.sort = 'default';
  else if (['genre', 'length', 'kanji', 'difficulty', 'practiceLevel'].includes(key)) filters[key] = 'all';
  if (key === 'genre') filters.length = 'all';
  if (textLibraryList && textLibraryList.dataset) delete textLibraryList.dataset.showAll;
  resetTextLibraryPage();
  syncFilterControlsFromState();
  renderTextLibrary(gameState.texts.items);
}

function makeLibraryOverview(items) {
  const list = Array.isArray(items) ? items : [];
  const counts = {
    total: list.length,
    genre: getGenreGroups(list).length,
    short: list.filter(item => getTextCharCount(item) < 1000).length,
    long: list.filter(item => getTextCharCount(item) >= 3000).length,
    advanced: list.filter(item => estimateTextDifficulty(item) === 'advanced').length,
  };
  return `
    <div class="text-library-overview" aria-label="課題文章ライブラリの概要">
      <span><strong>${counts.total}</strong>件</span>
      <span>分類 <strong>${counts.genre}</strong></span>
      <span>1000字未満 <strong>${counts.short}</strong></span>
      <span>3000字以上 <strong>${counts.long}</strong></span>
      <span>発展 <strong>${counts.advanced}</strong></span>
    </div>
  `;
}

function makeActiveFilterChipHtml(filters) {
  const chips = getActiveLibraryFilterChips(filters);
  if (!chips.length) return '<div class="text-library-active-chips is-empty">条件なし：直近５件を中心に表示します。</div>';
  return `
    <div class="text-library-active-chips" aria-label="現在の絞り込み条件">
      ${chips.map(chip => `
        <button type="button" class="text-library-active-chip" data-clear-library-filter="${escapeHtml(chip.key)}">
          ${escapeHtml(chip.label)} <span aria-hidden="true">×</span>
        </button>
      `).join('')}
    </div>
  `;
}

function getGenreGroups(items) {
  const groups = new Map();
  (items || []).forEach(item => {
    const id = item.genre || 'other';
    const current = groups.get(id) || {
      id,
      name: getItemGenreLabel(item),
      count: 0,
      lengths: {},
      difficulties: {},
    };
    current.count += 1;
    const length = getLengthBand(item);
    const difficulty = estimateTextDifficulty(item);
    current.lengths[length] = (current.lengths[length] || 0) + 1;
    current.difficulties[difficulty] = (current.difficulties[difficulty] || 0) + 1;
    groups.set(id, current);
  });
  return [...groups.values()].sort((a, b) => getGenreSortIndex(a.id) - getGenreSortIndex(b.id) || b.count - a.count || a.name.localeCompare(b.name, 'ja'));
}

function renderTextLibraryBrowser(items) {
  const { browser } = getLibraryFilterElements();
  if (!browser) return;
  const filters = ensureTextFilters();
  const groups = getGenreGroups(items);
  const selectedGenre = filters.genre && filters.genre !== 'all' ? filters.genre : '';
  const selectedGroup = groups.find(group => group.id === selectedGenre);

  const categoryButtons = groups.map(group => `
    <button type="button" class="text-library-category-card${group.id === selectedGenre ? ' is-active' : ''}" data-library-genre="${escapeHtml(group.id)}">
      <strong>${escapeHtml(group.name)}</strong>
      <span>${group.count}件</span>
    </button>
  `).join('');

  const lengthOrder = ['under-500', 'under-1000', 'under-1500', 'under-2000', 'under-2500', 'under-3000', 'under-3500', 'over-3500'];
  const subcategory = selectedGroup ? `
    <div class="text-library-subcategory-row" aria-label="小分類：文字数帯">
      <span class="text-library-subcategory-label">小分類：文字数帯</span>
      <button type="button" class="text-library-subcategory-chip${filters.length === 'all' ? ' is-active' : ''}" data-library-length="all">すべて</button>
      ${lengthOrder.filter(key => selectedGroup.lengths[key]).map(key => `
        <button type="button" class="text-library-subcategory-chip${filters.length === key ? ' is-active' : ''}" data-library-length="${escapeHtml(key)}">
          ${escapeHtml(getLengthBandLabel(key))}（${selectedGroup.lengths[key]}件）
        </button>
      `).join('')}
    </div>
  ` : '<p class="text-library-browser-note">大分類を選ぶと、文字数帯の小分類でさらに絞り込めます。</p>';

  browser.innerHTML = `
    <div class="text-library-browser-head">
      <div>
        <strong>課題を探す</strong>
        <span>直近５件から始め、必要なときだけ検索・分類で広げます。</span>
      </div>
      <button type="button" id="btn-show-all-texts" class="text-library-mini-button">全課題を見る</button>
    </div>
    ${makeLibraryOverview(items)}
    <div class="text-library-category-grid">${categoryButtons}</div>
    ${subcategory}
    ${makeActiveFilterChipHtml(filters)}
  `;

  browser.querySelectorAll('[data-library-genre]').forEach(button => {
    button.addEventListener('click', () => {
      const filters = ensureTextFilters();
      const genre = button.getAttribute('data-library-genre');
      filters.genre = filters.genre === genre ? 'all' : genre;
      filters.length = 'all';
      resetTextLibraryPage();
      syncFilterControlsFromState();
      renderTextLibrary(gameState.texts.items);
    });
  });
  browser.querySelectorAll('[data-library-length]').forEach(button => {
    button.addEventListener('click', () => {
      ensureTextFilters().length = button.getAttribute('data-library-length') || 'all';
      resetTextLibraryPage();
      syncFilterControlsFromState();
      renderTextLibrary(gameState.texts.items);
    });
  });
  browser.querySelectorAll('[data-clear-library-filter]').forEach(button => {
    button.addEventListener('click', () => clearLibraryFilterKey(button.getAttribute('data-clear-library-filter')));
  });
  const showAll = browser.querySelector('#btn-show-all-texts');
  if (showAll) {
    showAll.addEventListener('click', () => {
      const filters = ensureTextFilters();
      filters.keyword = '';
      filters.genre = 'all';
      filters.length = 'all';
      filters.kanji = 'all';
      filters.difficulty = 'all';
      filters.practiceLevel = 'all';
      filters.sort = 'default';
      syncFilterControlsFromState();
      textLibraryList.dataset.showAll = '1';
      resetTextLibraryPage();
      renderTextLibrary(gameState.texts.items);
    });
  }
}

function updateFilterSummary(total, filtered, mode = 'filtered', currentPage = 1, totalPages = 1) {
  const { summary } = getLibraryFilterElements();
  if (!summary) return;
  const filters = ensureTextFilters();
  const activeCount = ['genre', 'length', 'kanji', 'difficulty', 'practiceLevel'].filter(key => filters[key] && filters[key] !== 'all').length
    + (filters.keyword ? 1 : 0);
  const sortLabel = filters.sort && filters.sort !== 'default' ? '／並び替え適用中' : '';
  const pageLabel = totalPages > 1 ? `／${currentPage}/${totalPages}ページ` : '';
  if (mode === 'recent') {
    summary.textContent = filtered > 0
      ? `直近に練習した課題：${filtered}件を表示中（全${total}件）`
      : `直近の練習記録がないため、最初の候補${Math.min(5, total)}件を表示中（全${total}件）`;
    return;
  }
  if (mode === 'all') {
    summary.textContent = `全${total}件を10件ずつ表示中${pageLabel}${sortLabel}`;
    return;
  }
  summary.textContent = activeCount === 0
    ? `全${total}件を10件ずつ表示中${pageLabel}${sortLabel}`
    : `絞り込み結果：${filtered}件 / 全${total}件を10件ずつ表示中${pageLabel}${sortLabel}`;
}

function attachTextFilterEvents() {
  const els = getLibraryFilterElements();
  ['genre', 'length', 'kanji', 'difficulty', 'practiceLevel', 'sort'].forEach(key => {
    const el = els[key];
    if (!el || el.dataset.filterBound === '1') return;
    el.dataset.filterBound = '1';
    el.addEventListener('change', () => {
      if (textLibraryList && textLibraryList.dataset) delete textLibraryList.dataset.showAll;
      readFiltersFromControls();
      resetTextLibraryPage();
      renderTextLibrary(gameState.texts.items);
    });
  });
  if (els.keyword && els.keyword.dataset.filterBound !== '1') {
    els.keyword.dataset.filterBound = '1';
    els.keyword.addEventListener('input', () => {
      if (textLibraryList && textLibraryList.dataset) delete textLibraryList.dataset.showAll;
      readFiltersFromControls();
      resetTextLibraryPage();
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


function getTextLibraryPage() {
  if (!textLibraryList || !textLibraryList.dataset) return 1;
  const page = parseInt(textLibraryList.dataset.page || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function setTextLibraryPage(page) {
  if (!textLibraryList || !textLibraryList.dataset) return;
  const normalized = parseInt(page, 10);
  textLibraryList.dataset.page = String(Number.isFinite(normalized) && normalized > 0 ? normalized : 1);
}

function resetTextLibraryPage() {
  setTextLibraryPage(1);
}

function renderTextLibraryPagination(totalItems, currentPage, pageSize) {
  if (!textLibraryList || totalItems <= pageSize) return;
  const totalPages = Math.ceil(totalItems / pageSize);
  const nav = document.createElement('nav');
  nav.className = 'text-library-pagination';
  nav.setAttribute('aria-label', '課題一覧のページ切り替え');

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'text-library-page-button';
  prev.textContent = '前へ';
  prev.disabled = currentPage <= 1;
  prev.addEventListener('click', () => {
    setTextLibraryPage(currentPage - 1);
    renderTextLibrary(gameState.texts.items);
  });
  nav.appendChild(prev);

  const status = document.createElement('span');
  status.className = 'text-library-page-status';
  status.textContent = `${currentPage} / ${totalPages}ページ`;
  nav.appendChild(status);

  const pageNumbers = document.createElement('span');
  pageNumbers.className = 'text-library-page-numbers';
  for (let page = 1; page <= totalPages; page += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `text-library-page-number${page === currentPage ? ' is-current' : ''}`;
    button.textContent = String(page);
    button.setAttribute('aria-label', `${page}ページ目を表示`);
    if (page === currentPage) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => {
      setTextLibraryPage(page);
      renderTextLibrary(gameState.texts.items);
    });
    pageNumbers.appendChild(button);
  }
  nav.appendChild(pageNumbers);

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'text-library-page-button';
  next.textContent = '次へ';
  next.disabled = currentPage >= totalPages;
  next.addEventListener('click', () => {
    setTextLibraryPage(currentPage + 1);
    renderTextLibrary(gameState.texts.items);
  });
  nav.appendChild(next);

  textLibraryList.appendChild(nav);
}


// 別画面の課題一覧。基本はランダム出題のまま、必要なときだけ手動選択できる。
function renderTextLibrary(items) {
  if (!textLibraryList) return;
  const allItems = Array.isArray(items) ? items : [];
  const pageSize = 10;
  populateGenreFilter(allItems);
  syncFilterControlsFromState();
  updateFilterOptionAvailability(allItems);
  attachTextFilterEvents();
  renderTextLibraryDiagnostics(allItems);

  renderTextLibraryBrowser(allItems);

  const filters = readFiltersFromControls();
  const showAll = !!(textLibraryList.dataset && textLibraryList.dataset.showAll === '1');
  const activeFilters = hasActiveLibraryFilters(filters);
  const filteredItemsAll = sortTextLibraryItems(allItems.filter(item => isTextMatchedByFilters(item, filters)), filters.sort);
  const recentItems = getRecentLibraryItems(allItems, 5);
  const sourceItems = (!activeFilters && !showAll)
    ? (recentItems.length ? recentItems : allItems.slice(0, 5))
    : filteredItemsAll;
  const displayMode = (!activeFilters && !showAll) ? 'recent' : (showAll && !activeFilters ? 'all' : 'filtered');

  let currentPage = displayMode === 'recent' ? 1 : getTextLibraryPage();
  const totalPages = Math.max(1, Math.ceil(sourceItems.length / pageSize));
  if (currentPage > totalPages) {
    currentPage = totalPages;
    setTextLibraryPage(currentPage);
  }
  const displayItems = displayMode === 'recent'
    ? sourceItems
    : sourceItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  updateFilterSummary(allItems.length, sourceItems.length, displayMode, currentPage, totalPages);

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
    <span class="text-library-meta">開始するたびに課題文章を自動で選びます。直近表示・検索・分類選択とは別に使えます。</span>
  `;
  randomButton.addEventListener('click', () => {
    gameState.texts.selectionMode = 'random';
    applyRandomTextForStart();
    closeTextLibrary();
  });
  textLibraryList.appendChild(randomButton);

  if (displayItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-library-loading';
    empty.textContent = '条件に合う課題文章がありません。件数が0件の条件は選べないようにしていますが、複数条件の組み合わせで0件になる場合があります。絞り込み条件を変更してください。';
    textLibraryList.appendChild(empty);
    return;
  }

  displayItems.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-library-item';
    if (item.id === gameState.texts.currentId && gameState.texts.selectionMode === 'manual') {
      button.classList.add('is-selected');
    }

    const charCount = getTextCharCount(item);
    const analysis = getTextAnalysis(item);
    const kanjiRatio = analysis.kanjiRate;
    const genreLabel = getItemGenreLabel(item);
    const difficulty = estimateTextDifficulty(item);
    const excerpt = (item.text || '').replace(/\s+/g, ' ').slice(0, 90);
    const recordLine = makeTextLibraryRecordLine(item);
    const analysisLine = makeTextAnalysisLine(item);
    const difficultyReasonLine = makeDifficultyReasonLine(item);
    const displayIndex = displayMode === 'recent' ? index + 1 : ((currentPage - 1) * pageSize) + index + 1;

    const lengthLabel = getLengthBandLabel(getLengthBand(item));
    const difficultyLabel = getDifficultyLabel(difficulty);
    const rhythmLabel = getRhythmLabel(getTextRhythmType(item));
    const primaryMetaLine = `${genreLabel || 'その他'}｜難易度 ${analysis.difficultyScore}/10（${difficultyLabel}）｜${lengthLabel}`;
    const secondaryMetaLine = `文字数 ${charCount.toLocaleString()}字｜漢字含有率 ${kanjiRatio}%｜${getPracticeLevelLabel(getPracticeLevel(item))}｜${rhythmLabel}`;

    button.innerHTML = `
      <span class="text-library-card-head">
        <span class="text-library-title"><strong>${displayIndex}. ${escapeHtml(item.title)}</strong></span>
        <span class="text-library-select-label">選択</span>
      </span>
      <span class="text-library-primary-meta" aria-label="課題の主要情報">${escapeHtml(primaryMetaLine)}</span>
      <span class="text-library-badges" aria-label="課題の補足情報">
        <span>${escapeHtml(secondaryMetaLine)}</span>
      </span>
      <span class="text-library-reason">${escapeHtml(difficultyReasonLine)}</span>
      <span class="text-library-records">${escapeHtml(recordLine)}</span>
      <span class="text-library-excerpt">${escapeHtml(excerpt)}${excerpt.length >= 90 ? '…' : ''}</span>
      <span class="text-library-analysis">${escapeHtml(analysisLine)}</span>
    `;

    button.addEventListener('click', () => {
      selectTextById(item.id);
      closeTextLibrary();
    });
    textLibraryList.appendChild(button);
  });

  if (displayMode !== 'recent') {
    renderTextLibraryPagination(sourceItems.length, currentPage, pageSize);
  }
}


function updateBeginnerModeView() {
  const active = !!(gameState && gameState.texts && gameState.texts.randomPracticeLevel === 'beginner');
  if (btnBeginnerMode) {
    btnBeginnerMode.classList.toggle('is-active', active);
    btnBeginnerMode.setAttribute('aria-pressed', active ? 'true' : 'false');
    const beginnerModeMain = btnBeginnerMode.querySelector('.beginner-mode-main');
    if (beginnerModeMain) {
      beginnerModeMain.textContent = active ? '初心者モード中' : '初心者モード';
    } else {
      btnBeginnerMode.textContent = active ? '初心者モード中' : '初心者モード';
    }
  }
  if (beginnerModeStatus) {
    beginnerModeStatus.hidden = !active;
    if (active) beginnerModeStatus.textContent = '初心者モード中：短め・基礎寄りの課題からランダム出題します。課題管理では初心者向けだけを確認できます。';
  }
}

function setBeginnerLibraryFilters() {
  const filters = ensureTextFilters();
  filters.keyword = '';
  filters.genre = 'all';
  filters.length = 'all';
  filters.kanji = 'all';
  filters.difficulty = 'all';
  filters.practiceLevel = 'beginner';
  filters.sort = 'length-asc';
  if (textLibraryList && textLibraryList.dataset) textLibraryList.dataset.showAll = '1';
  resetTextLibraryPage();
}

function activateBeginnerMode() {
  if (!gameState || !gameState.texts) return;
  gameState.texts.randomPracticeLevel = 'beginner';
  gameState.texts.selectionMode = 'random';
  gameState.texts.lastRandomTextId = null;
  setBeginnerLibraryFilters();
  applyRandomTextForStart();
  updateBeginnerModeView();
  renderTextLibrary(gameState.texts.items);
}

function deactivateBeginnerMode() {
  if (!gameState || !gameState.texts) return;
  gameState.texts.randomPracticeLevel = 'all';
  const filters = ensureTextFilters();
  if (filters.practiceLevel === 'beginner') filters.practiceLevel = 'all';
  if (filters.sort === 'length-asc') filters.sort = 'default';
  if (textLibraryList && textLibraryList.dataset) delete textLibraryList.dataset.showAll;
  resetTextLibraryPage();
  updateBeginnerModeView();
  renderTextLibrary(gameState.texts.items);
  updateTextSelectionStatus();
}

function toggleBeginnerMode() {
  if (gameState.texts.randomPracticeLevel === 'beginner') deactivateBeginnerMode();
  else activateBeginnerMode();
}

function openTextLibrary() {
  if (!textLibraryModal) return;
  renderTextLibrary(gameState.texts.items);
  textLibraryModal.classList.remove('hidden');
  textLibraryModal.setAttribute('aria-hidden', 'false');
  const keyword = document.getElementById('text-filter-keyword');
  if (gameState.texts.randomPracticeLevel === 'beginner') setBeginnerLibraryFilters();
  renderTextLibrary(gameState.texts.items);
  if (keyword) setTimeout(() => keyword.focus(), 0);
}

function closeTextLibrary() {
  if (!textLibraryModal) return;
  textLibraryModal.classList.add('hidden');
  textLibraryModal.setAttribute('aria-hidden', 'true');
}


if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !document.body?.dataset?.libraryEscapeBound) {
  if (document.body && document.body.dataset) document.body.dataset.libraryEscapeBound = '1';
  let libraryDeveloperKeyCount = 0;
  let libraryDeveloperKeyTimer = null;
  document.addEventListener('keydown', event => {
    const libraryOpen = !!(textLibraryModal && !textLibraryModal.classList.contains('hidden'));

    if (event.key === 'Escape' && libraryOpen) {
      closeTextLibrary();
      return;
    }

    const target = event.target;
    const isEditableTarget = !!(target && (
      target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(target.tagName || '').toUpperCase())
    ));

    // 隠し開発者表示は、誤作動を避けるため課題ライブラリを開いている時だけ有効にする。
    // 練習中や検索欄入力中に Shift + D が続いても反応させない。
    if (!libraryOpen || isEditableTarget) {
      libraryDeveloperKeyCount = 0;
      return;
    }

    if (event.shiftKey && String(event.key || '').toLowerCase() === 'd') {
      libraryDeveloperKeyCount += 1;
      clearTimeout(libraryDeveloperKeyTimer);
      libraryDeveloperKeyTimer = setTimeout(() => { libraryDeveloperKeyCount = 0; }, 1200);
      if (libraryDeveloperKeyCount >= 5) {
        const nextMode = !isTextLibraryDeveloperMode();
        setTextLibraryDeveloperMode(nextMode);
        libraryDeveloperKeyCount = 0;
        if (!nextMode) clearTextLibraryDiagnostics();
        renderTextLibrary(gameState.texts.items);
        console.info(`課題ライブラリ開発者表示: ${nextMode ? 'ON' : 'OFF'}`);
      }
    } else {
      libraryDeveloperKeyCount = 0;
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
