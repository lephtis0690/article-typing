// 設定反映・イベント登録・初期化
// 元ファイル: js/app.js から機能別に分割

function setSelectValue(select, value) {
  if (!select) return;
  select.value = value;
}

function applyDisplayPresetMode() {
  const mode = displayPresetModeSelect ? displayPresetModeSelect.value : 'practice';
  const manualEnabled = manualDetailModeCheckbox ? manualDetailModeCheckbox.checked : false;

  document.body.classList.toggle('practice-mode', mode === 'practice');
  document.body.classList.toggle('competition-mode', mode === 'competition');

  if (mode === 'competition') {
    // 本番モードは大会環境を再現するため、手動調整の有無に関係なく核心仕様を固定する。
    // 画面上の時間・進捗・正誤表示は隠し、正誤の色分けも止める。
    setSelectValue(liveStatusModeSelect, 'hide');
    setSelectValue(typingPositionModeSelect, 'hide');
    setSelectValue(correctFeedbackModeSelect, 'competition');
    setSelectValue(feedbackModeSelect, 'result');
    // 一方、実際の大会に合わせて「残り時間コール」と「3秒後スタート」は必ず有効にする。
    setSelectValue(timeCallModeSelect, 'show');
    // 効果音は利用者の環境差が大きいため、本番モードでもオン／オフ設定を尊重する。
    setSelectValue(startModeSelect, 'countdown');
  } else if (!manualEnabled) {
    // 練習モードは練習用に現在状況を確認できる標準設定へ戻す。
    // ここが本番モードと同じ hide のままだと、モード変更しても違いが見えにくくなる。
    setSelectValue(liveStatusModeSelect, 'show');
    setSelectValue(typingPositionModeSelect, 'show');
    setSelectValue(correctFeedbackModeSelect, 'normal');
    setSelectValue(feedbackModeSelect, 'realtime');
    setSelectValue(timeCallModeSelect, 'show');
    if (timeCallSoundModeSelect) setSelectValue(timeCallSoundModeSelect, 'on');
    if (startFinishSoundModeSelect) setSelectValue(startFinishSoundModeSelect, 'on');
    setSelectValue(startModeSelect, 'immediate');
  }

  updateManualDetailControls();
  applyLiveStatusMode();
  applyTypingPositionMode();
  if (resultScreen.style.display !== 'block') {
    renderTextDisplay(typingArea ? typingArea.value : '');
  }
}

function updateManualDetailControls() {
  const manualEnabled = manualDetailModeCheckbox ? manualDetailModeCheckbox.checked : false;
  const isCompetitionMode = displayPresetModeSelect ? displayPresetModeSelect.value === 'competition' : false;
  document.body.classList.toggle('manual-detail-enabled', manualEnabled && !isCompetitionMode);
  // 本番モードでは、手動調整ONでも大会環境の核心仕様を固定する。
  // 練習モードの場合だけ、表示モードと強く連動する項目を編集可能にする。
  [liveStatusModeSelect, typingPositionModeSelect, correctFeedbackModeSelect].forEach(select => {
    if (select) select.disabled = !manualEnabled || isCompetitionMode || gameState.session.running;
  });
}

function applyDisplayMode() {
  // 結果画面が独立したため、結果は常に詳細表示を基本とする。
  // 個別の採点詳細は結果画面内のチェックボックスで調整する。
  document.body.classList.remove('simple-mode');
  applyDetailVisibility();
  if (resultScreen.style.display === 'block') {
    requestAnimationFrame(() => drawCPMChart(gameState.chart.hoverIndex));
  }
}

function applyThemeMode() {
  const mode = themeModeSelect ? themeModeSelect.value : 'light';
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('theme-light', mode !== 'dark');
  if (resultScreen.style.display === 'block') {
    requestAnimationFrame(() => drawCPMChart(gameState.chart.hoverIndex));
  }
}



function applyFocusDisplayMode() {
  const enabled = focusDisplayModeCheckbox ? focusDisplayModeCheckbox.checked : false;
  document.body.classList.toggle('focus-display-enabled', enabled);
}

function applyAccessibilityMode() {
  const mode = accessibilityModeSelect ? accessibilityModeSelect.value : 'colorblind';
  document.body.classList.toggle('colorblind-mode', mode === 'colorblind');
  if (resultScreen.style.display === 'block') {
    requestAnimationFrame(() => drawCPMChart(gameState.chart.hoverIndex));
  }
}


function applyTypingPositionMode() {
  const mode = typingPositionModeSelect ? typingPositionModeSelect.value : 'hide';
  document.body.classList.toggle('show-typing-position', mode === 'show');
  const currentInput = typingArea ? typingArea.value : '';
  if (resultScreen.style.display !== 'block') {
    renderTextDisplay(currentInput);
  }
}

function applyLiveStatusMode() {
  const mode = liveStatusModeSelect ? liveStatusModeSelect.value : 'show';
  document.body.classList.toggle('hide-live-status', mode === 'hide');
}

// チェックボックスの状態に応じて、対応する [data-detail-key] 要素を表示／非表示する。
// 表示するときは block / grid / list-item を style に頼らず、空文字に戻すだけでよい。
function updateDetailHiddenNotice(toggles) {
  const notice = document.getElementById('detail-hidden-notice');
  if (!notice) return;
  const list = toggles || document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]');
  const hasHidden = Array.from(list).some(cb => !cb.checked);
  notice.hidden = !hasHidden;
}

function applyDetailVisibility() {
  const toggles = document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]');
  toggles.forEach(cb => {
    const key = cb.dataset.toggle;
    // 同じキーを持つ要素が複数あってもよい（カード＆セクションをまとめて切り替える）。
    const targets = document.querySelectorAll(`[data-detail-key="${key}"]`);
    targets.forEach(el => {
      el.style.display = cb.checked ? '' : 'none';
    });
  });
  updateDetailHiddenNotice(toggles);
}

function resetDetailVisibilitySettings() {
  const toggles = document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]');
  toggles.forEach(cb => { cb.checked = true; });
  applyDetailVisibility();
  if (typeof saveCurrentSettings === 'function') saveCurrentSettings();
}

// チェックボックスの変更をリッスン。結果画面表示前にも貼っておけば、
// 後から表示されてもチェック状態が反映される。
document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]').forEach(cb => {
  cb.addEventListener('change', applyDetailVisibility);
});

const btnResetDetailVisibility = document.getElementById('btn-reset-detail-visibility');
if (btnResetDetailVisibility) {
  btnResetDetailVisibility.addEventListener('click', resetDetailVisibilitySettings);
}



const UPDATE_INFO_LIMIT = 20;
const UPDATE_INFO_FALLBACK = [
  {
    "date": "2026.05.24",
    "title": "更新情報ボタンを追加",
    "body": "画面右上に「更新情報を見る」ボタンを設置し、直近２０件の更新内容をモーダル表示できるようにしました。"
  },
  {
    "date": "2026.05.24",
    "title": "課題文章を追加",
    "body": "「生理痛の最新の治療法」を課題文章として追加しました。"
  },
  {
    "date": "2026.05.24",
    "title": "開始・終了効果音の試聴に対応",
    "body": "計測開始と計測終了の笛の効果音を、詳細設定から試聴できるようにしました。"
  },
  {
    "date": "2026.05.24",
    "title": "計測開始時の詳細設定自動クローズ",
    "body": "開始ボタンやＥｓｃキーで計測を始めたとき、詳細設定が開いていれば自動で閉じるようにしました。"
  },
  {
    "date": "2026.05.24",
    "title": "終了表示を追加",
    "body": "計測時間が０になったとき、画面中央に「終了！」を２秒間表示するようにしました。"
  },
  {
    "date": "2026.05.24",
    "title": "本番モードの挙動を調整",
    "body": "本番モードでは３秒後スタートと残り時間コールを維持し、大会環境に近い動きにしました。"
  },
  {
    "date": "2026.05.24",
    "title": "結果画面への遷移を修正",
    "body": "練習モード・本番モードで計測終了時に結果画面へ移らない場合がある不具合を修正しました。"
  },
  {
    "date": "2026.05.24",
    "title": "入力比較の全文表示を修正",
    "body": "入力比較画面で全文表示が途中で途切れる問題を修正しました。"
  },
  {
    "date": "2026.05.24",
    "title": "結果指標の配置を改善",
    "body": "入力文字数、減点、純字数、正確率を結果画面の上部に集約し、確認しやすくしました。"
  },
  {
    "date": "2026.05.24",
    "title": "結果指標を２段表示へ調整",
    "body": "ＣＰＭ欄などの幅を見直し、主要指標が２段で収まりやすい表示にしました。"
  },
  {
    "date": "2026.05.23",
    "title": "課題選択画面を改善",
    "body": "課題一覧の表示を整理し、１０件ごとのページ表示に対応しました。"
  },
  {
    "date": "2026.05.23",
    "title": "直近プレー課題の表示を改善",
    "body": "課題選択で直近にプレーした課題を確認しやすくしました。"
  },
  {
    "date": "2026.05.23",
    "title": "初心者モードを追加",
    "body": "短めで基礎寄りの課題を選びやすくする初心者モードを追加しました。"
  },
  {
    "date": "2026.05.23",
    "title": "記録画面の操作性を改善",
    "body": "記録画面の上部と下部に戻るボタンを配置し、スクロールせずに次の練習へ移れるようにしました。"
  },
  {
    "date": "2026.05.23",
    "title": "記録リセット機能を追加",
    "body": "この端末に保存された自己ベストや直近履歴を、確認操作つきでリセットできるようにしました。"
  },
  {
    "date": "2026.05.23",
    "title": "ＣＰＭ推移グラフを改善",
    "body": "記録画面と結果画面でＣＰＭ推移を確認しやすくし、表示条件を調整しました。"
  },
  {
    "date": "2026.05.23",
    "title": "自己ランキング表示を整理",
    "body": "ＣＰＭ推移グラフの後に自己ランキングを確認できる自然な順序へ変更しました。"
  },
  {
    "date": "2026.05.23",
    "title": "課題タイトルの入力混入を修正",
    "body": "入力欄に課題タイトルが入ってしまう問題を修正し、本文の出だしから入力する仕様にしました。"
  },
  {
    "date": "2026.05.23",
    "title": "色覚バリアフリー表示を調整",
    "body": "正誤表示やグラフの見え方を、色だけに頼りすぎない表示へ近づけました。"
  },
  {
    "date": "2026.05.22",
    "title": "データ管理構成を整理",
    "body": "課題文章データ、フォールバックデータ、検証用スクリプトの管理を整理しました。"
  }
];

function normalizeUpdateInfoItem(item) {
  if (!item || typeof item !== 'object') return null;
  const date = typeof item.date === 'string' ? item.date : '';
  const title = typeof item.title === 'string' ? item.title : '';
  const body = typeof item.body === 'string' ? item.body : '';
  if (!title && !body) return null;
  return { date, title: title || '更新', body: body || '' };
}

function renderUpdateInfoList(items) {
  if (!updateInfoList) return;
  const normalized = Array.isArray(items) ? items.map(normalizeUpdateInfoItem).filter(Boolean).slice(0, UPDATE_INFO_LIMIT) : [];
  if (!normalized.length) {
    updateInfoList.innerHTML = '<p class="update-info-empty">表示できる更新情報がありません。</p>';
    return;
  }
  updateInfoList.innerHTML = normalized.map(item => `
    <article class="update-log-item">
      <div class="update-log-head">
        <h3 class="update-log-title">${escapeHtml(item.title)}</h3>
        <time class="update-log-date">${escapeHtml(item.date)}</time>
      </div>
      <p class="update-log-body">${escapeHtml(item.body)}</p>
    </article>
  `).join('');
}

async function loadUpdateInfoList() {
  if (!updateInfoList) return;
  updateInfoList.innerHTML = '<p class="update-info-loading">更新情報を読み込んでいます。</p>';
  try {
    const response = await fetch('data/updates.json?v=20260524-update-modal', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderUpdateInfoList(Array.isArray(data) ? data : data.updates);
  } catch (error) {
    console.warn('更新情報の読み込みに失敗しました。内蔵の更新情報を表示します。', error);
    renderUpdateInfoList(UPDATE_INFO_FALLBACK);
  }
}

function openUpdateInfoModal() {
  if (!updateInfoModal) return;
  updateInfoModal.classList.remove('hidden');
  updateInfoModal.setAttribute('aria-hidden', 'false');
  loadUpdateInfoList();
}

function closeUpdateInfoModal() {
  if (!updateInfoModal) return;
  updateInfoModal.classList.add('hidden');
  updateInfoModal.setAttribute('aria-hidden', 'true');
}


function previewTimeCallSound(message) {
  if (typeof playTimeCallSound === 'function') {
    playTimeCallSound(message, { force: true });
  }
}

function previewStartFinishSound(kind) {
  if (typeof playWhistleSound === 'function') {
    playWhistleSound(kind, { force: true });
  }
}


if (btnOpenUpdates) {
  btnOpenUpdates.addEventListener('click', openUpdateInfoModal);
}

if (btnCloseUpdates) {
  btnCloseUpdates.addEventListener('click', closeUpdateInfoModal);
}

if (updateInfoModal) {
  updateInfoModal.addEventListener('click', (e) => {
    if (e.target === updateInfoModal) closeUpdateInfoModal();
  });
}

if (feedbackModeSelect) {
  feedbackModeSelect.addEventListener('change', () => {
    if (!gameState.session.running && resultScreen.style.display !== 'block') renderTextDisplay(typingArea ? typingArea.value : '');
  });
}

if (correctFeedbackModeSelect) {
  correctFeedbackModeSelect.addEventListener('change', () => {
    if (resultScreen.style.display !== 'block') {
      renderTextDisplay(typingArea ? typingArea.value : '');
    }
  });
}



if (btnPreviewTwoMin) {
  btnPreviewTwoMin.addEventListener('click', () => previewTimeCallSound('あと2分'));
}

if (btnPreviewTenSec) {
  btnPreviewTenSec.addEventListener('click', () => previewTimeCallSound('あと10秒'));
}

if (btnPreviewStartWhistle) {
  btnPreviewStartWhistle.addEventListener('click', () => previewStartFinishSound('start'));
}

if (btnPreviewFinishWhistle) {
  btnPreviewFinishWhistle.addEventListener('click', () => previewStartFinishSound('finish'));
}

if (displayPresetModeSelect) {
  displayPresetModeSelect.addEventListener('change', () => {
    applyDisplayPresetMode();
    saveCurrentSettings();
  });
}

if (manualDetailModeCheckbox) {
  manualDetailModeCheckbox.addEventListener('change', () => {
    if (!manualDetailModeCheckbox.checked) {
      applyDisplayPresetMode();
      return;
    }
    updateManualDetailControls();
    saveCurrentSettings();
  });
}

if (liveStatusModeSelect) {
  liveStatusModeSelect.addEventListener('change', applyLiveStatusMode);
}

if (themeModeSelect) {
  themeModeSelect.addEventListener('change', applyThemeMode);
}

if (focusDisplayModeCheckbox) {
  focusDisplayModeCheckbox.addEventListener('change', () => {
    applyFocusDisplayMode();
    saveCurrentSettings();
  });
}

if (accessibilityModeSelect) {
  accessibilityModeSelect.addEventListener('change', applyAccessibilityMode);
}

if (typingPositionModeSelect) {
  typingPositionModeSelect.addEventListener('change', applyTypingPositionMode);
}

if (btnConfigToggle) {
  btnConfigToggle.addEventListener('click', () => {
    const isOpen = advancedSettings && !advancedSettings.classList.contains('is-collapsed');
    setAdvancedSettingsOpen(!isOpen);
  });
}

restoreSavedSettings();
setAdvancedSettingsOpen(false);
loadTexts();
applyDisplayPresetMode();
applyDisplayMode();
applyLiveStatusMode();
applyThemeMode();
applyFocusDisplayMode();
applyAccessibilityMode();
applyTypingPositionMode();
applyDetailVisibility();
attachSettingStorageListeners();
saveCurrentSettings();
if (typeof renderStoredRecordsOnLoad === 'function') renderStoredRecordsOnLoad();

if (btnTextLibrary) {
  btnTextLibrary.addEventListener('click', openTextLibrary);
}
if (btnBeginnerMode) {
  btnBeginnerMode.addEventListener('click', toggleBeginnerMode);
  updateBeginnerModeView();
}
if (btnCloseLibrary) {
  btnCloseLibrary.addEventListener('click', closeTextLibrary);
}
if (textLibraryModal) {
  textLibraryModal.addEventListener('click', (e) => {
    if (e.target === textLibraryModal) closeTextLibrary();
  });
}
