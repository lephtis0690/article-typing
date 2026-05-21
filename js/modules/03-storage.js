// localStorage による設定保存
// 成績履歴や課題文本文は保存せず、利用者の表示・採点・開始条件の設定だけを保存する。

const SETTINGS_STORAGE_KEY = 'long-type:user-settings:v1';

const STORED_SELECT_IDS = [
  'display-preset-mode',
  'time-select',
  'start-mode',
  'theme-mode',
  'accessibility-mode',
  'live-status-mode',
  'typing-position-mode',
  'correct-feedback-mode',
  'feedback-mode',
  'time-call-mode',
  'disqualify-limit'
];

const STORED_CHECKBOX_IDS = [
  'manual-detail-mode'
];

function canUseLocalStorage() {
  try {
    const testKey = `${SETTINGS_STORAGE_KEY}:test`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

function readSavedSettings() {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    console.warn('設定の読み込みに失敗しました。保存設定を初期化します。', error);
    try { window.localStorage.removeItem(SETTINGS_STORAGE_KEY); } catch (_) {}
    return null;
  }
}

function isValidSelectValue(select, value) {
  if (!select || typeof value !== 'string') return false;
  return Array.from(select.options).some(option => option.value === value);
}

function restoreSavedSettings() {
  const saved = readSavedSettings();
  if (!saved) return false;

  const selects = saved.selects && typeof saved.selects === 'object' ? saved.selects : {};
  STORED_SELECT_IDS.forEach(id => {
    const select = document.getElementById(id);
    const value = selects[id];
    if (isValidSelectValue(select, value)) {
      select.value = value;
    }
  });

  const checkboxes = saved.checkboxes && typeof saved.checkboxes === 'object' ? saved.checkboxes : {};
  STORED_CHECKBOX_IDS.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox && typeof checkboxes[id] === 'boolean') {
      checkbox.checked = checkboxes[id];
    }
  });

  const detailToggles = saved.detailToggles && typeof saved.detailToggles === 'object' ? saved.detailToggles : {};
  document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]').forEach(checkbox => {
    const key = checkbox.dataset.toggle;
    if (typeof detailToggles[key] === 'boolean') {
      checkbox.checked = detailToggles[key];
    }
  });

  return true;
}

function collectCurrentSettings() {
  const selects = {};
  STORED_SELECT_IDS.forEach(id => {
    const select = document.getElementById(id);
    if (select) selects[id] = select.value;
  });

  const checkboxes = {};
  STORED_CHECKBOX_IDS.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) checkboxes[id] = checkbox.checked;
  });

  const detailToggles = {};
  document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]').forEach(checkbox => {
    detailToggles[checkbox.dataset.toggle] = checkbox.checked;
  });

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    selects,
    checkboxes,
    detailToggles
  };
}

function saveCurrentSettings() {
  if (!canUseLocalStorage()) return false;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(collectCurrentSettings()));
    return true;
  } catch (error) {
    console.warn('設定の保存に失敗しました。', error);
    return false;
  }
}

function attachSettingStorageListeners() {
  const ids = [...STORED_SELECT_IDS, ...STORED_CHECKBOX_IDS];
  ids.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.addEventListener('change', saveCurrentSettings);
  });

  document.querySelectorAll('#scoring-settings input[type="checkbox"][data-toggle]').forEach(checkbox => {
    checkbox.addEventListener('change', saveCurrentSettings);
  });
}
