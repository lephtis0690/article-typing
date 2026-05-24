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
    setSelectValue(startModeSelect, 'countdown');
  } else if (!manualEnabled) {
    // 練習モードは練習用に現在状況を確認できる標準設定へ戻す。
    // ここが本番モードと同じ hide のままだと、モード変更しても違いが見えにくくなる。
    setSelectValue(liveStatusModeSelect, 'show');
    setSelectValue(typingPositionModeSelect, 'show');
    setSelectValue(correctFeedbackModeSelect, 'normal');
    setSelectValue(feedbackModeSelect, 'realtime');
    setSelectValue(timeCallModeSelect, 'show');
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
