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

  // 手動調整を使わない通常時は、練習／本番のプリセットをそのまま反映する。
  // localStorage で手動調整が復元された場合は、保存済みの個別設定を上書きしない。
  if (!manualEnabled && mode === 'practice') {
    setSelectValue(liveStatusModeSelect, 'show');
    setSelectValue(typingPositionModeSelect, 'hide');
    setSelectValue(correctFeedbackModeSelect, 'normal');
  } else if (!manualEnabled && mode === 'competition') {
    setSelectValue(liveStatusModeSelect, 'hide');
    setSelectValue(typingPositionModeSelect, 'hide');
    setSelectValue(correctFeedbackModeSelect, 'competition');
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
  document.body.classList.toggle('manual-detail-enabled', manualEnabled);
  // 表示モードと強く連動する項目だけを、手動調整時に編集可能にする。
  [liveStatusModeSelect, typingPositionModeSelect, correctFeedbackModeSelect].forEach(select => {
    if (select) select.disabled = !manualEnabled || gameState.session.running;
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
}

// チェックボックスの変更をリッスン。結果画面表示前にも貼っておけば、
// 後から表示されてもチェック状態が反映される。
document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]').forEach(cb => {
  cb.addEventListener('change', applyDetailVisibility);
});

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
