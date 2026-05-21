// 課題一覧モーダル
// 元ファイル: js/app.js から機能別に分割

function selectTextById(textId) {
  if (!textId || textId === RANDOM_TEXT_VALUE) {
    textSelectionMode = 'random';
    applyRandomTextForStart();
    updateTextSelectionStatus();
    return;
  }
  textSelectionMode = 'manual';
  applySelectedText(textId, false);
  updateTextSelectionStatus();
}

// 別画面の課題一覧。基本はランダム出題のまま、必要なときだけ手動選択できる。
function renderTextLibrary(items) {
  if (!textLibraryList) return;
  textLibraryList.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    textLibraryList.innerHTML = '<p class="text-library-loading">表示できる課題文章がありません。</p>';
    return;
  }

  const randomButton = document.createElement('button');
  randomButton.type = 'button';
  randomButton.className = 'text-library-item text-library-random';
  randomButton.innerHTML = `
    <span class="text-library-title">ランダム（毎回）</span>
    <span class="text-library-meta">開始するたびに課題文章を自動で選びます。</span>
  `;
  randomButton.addEventListener('click', () => {
    textSelectionMode = 'random';
    applyRandomTextForStart();
    closeTextLibrary();
  });
  textLibraryList.appendChild(randomButton);

  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-library-item';
    if (item.id === currentTextId && textSelectionMode === 'manual') {
      button.classList.add('is-selected');
    }

    const charCount = item.text ? item.text.length : 0;
    const genreLabel = item.genreName && item.genreName !== 'other' ? `${item.genreName}／` : '';
    const excerpt = (item.text || '').replace(/\s+/g, ' ').slice(0, 90);

    button.innerHTML = `
      <span class="text-library-title">${index + 1}. ${escapeHtml(item.title)}</span>
      <span class="text-library-meta">${escapeHtml(genreLabel)}${charCount.toLocaleString()}字程度</span>
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
  renderTextLibrary(textItems);
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

