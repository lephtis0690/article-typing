// 課題文読み込み・選択
// 元ファイル: js/app.js から機能別に分割

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
  const length = typeof item.length === 'number' ? item.length : item.text.length;
  return { id: baseId, title, genre, genreName, length, text: item.text };
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

async function loadTextsFromIndex() {
  const indexResponse = await fetch('data/index.json', { cache: 'no-store' });
  if (!indexResponse.ok) throw new Error(`data/index.json の読み込みに失敗しました: ${indexResponse.status}`);

  const categories = await indexResponse.json();
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('data/index.json に有効なカテゴリがありません。');
  }

  const loadedGroups = await Promise.all(categories.map(async (category) => {
    if (!category || typeof category.file !== 'string') return [];
    const safeFile = category.file.trim();
    if (!isSafeTextFilePath(safeFile)) {
      console.warn('安全でない課題JSONのパスをスキップしました。', category.file);
      return [];
    }
    const response = await fetch(safeFile, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${safeFile} の読み込みに失敗しました: ${response.status}`);
    const data = await response.json();
    const source = Array.isArray(data) ? data : data.texts;
    if (!Array.isArray(source)) return [];
    return source.map((item, index) => normalizeTextItem(item, index, category)).filter(Boolean);
  }));

  return dedupeTextIds(loadedGroups.flat());
}

async function loadTextsFromLegacyFile() {
  const response = await fetch('texts.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`texts.json の読み込みに失敗しました: ${response.status}`);
  const data = await response.json();
  const source = Array.isArray(data) ? data : data.texts;
  const loaded = Array.isArray(source)
    ? source.map((item, index) => normalizeTextItem(item, index)).filter(Boolean)
    : [];
  return dedupeTextIds(loaded);
}

const RANDOM_TEXT_VALUE = '__random__';

function populateTextSelect(items) {
  // 課題文プルダウンは廃止。課題選択は「課題一覧」モーダルに一本化する。
  // 既存の呼び出しとの互換性のため、関数名だけ残しておく。
}

function applySelectedText(textId, keepRandomSelection = false) {
  const selected = textItems.find(item => item.id === textId) || textItems[0];
  if (!selected) return;
  LONG_TEXT = selected.text;
  currentTextTitle = selected.title;
  currentTextId = selected.id;

  if (taskTitle) taskTitle.textContent = `// 課題文 — ${currentTextTitle}`;
  updateTextSelectionStatus();
  if (!running && !countingDown) {
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
  if (textSelectionMode === 'manual') {
    el.textContent = `出題: 手動選択中（${currentTextTitle}）`;
    el.classList.add('is-manual');
  } else {
    el.textContent = '出題: ランダム（毎回）';
    el.classList.remove('is-manual');
  }
}

// 登録済み課題文からランダムに1つ選ぶ。
// 2題以上ある場合は、直前と同じ課題文が連続しにくいようにする。
function applyRandomTextForStart() {
  if (!Array.isArray(textItems) || textItems.length === 0) return;

  let candidates = textItems;
  if (textItems.length > 1 && lastRandomTextId) {
    candidates = textItems.filter(item => item.id !== lastRandomTextId);
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)] || textItems[0];
  lastRandomTextId = selected.id;

  // 選択欄は「ランダム（毎回）」のままにして、実際の課題文だけを差し替える。
  applySelectedText(selected.id, true);
  // applySelectedText の中で updateTextSelectionStatus は呼ばれているが、
  // textSelectionMode の値で表示が決まるため、ここでもう一度呼んで
  // 「ランダム」と「手動選択中」の表示を正しく区別する。
  updateTextSelectionStatus();
}

async function loadTexts() {
  // 初期表示でも課題一覧が少なく見えないように、まず内蔵フォールバックを表示してから外部JSONで更新する。
  populateTextSelect(textItems);
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
    textItems = loaded;
    populateTextSelect(textItems);
    applyRandomTextForStart();

    // 読み込み完了後に課題一覧を開いている場合は、一覧も即座に更新する。
    if (textLibraryModal && !textLibraryModal.classList.contains('hidden')) {
      renderTextLibrary(textItems);
    }
  } else {
    console.warn('外部JSONを読み込めないため、内蔵の課題文で起動します。');
  }
}



const btnTextLibrary = document.getElementById('btn-text-library');
const textLibraryModal = document.getElementById('text-library-modal');
const textLibraryList = document.getElementById('text-library-list');
const btnCloseLibrary = document.getElementById('btn-close-library');

