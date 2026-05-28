// 共通ユーティリティ・表示ラベル
// 画面表示に使う安全化処理やラベル定義をここへ集約する。

const TEXT_LENGTH_BAND_LABELS = {
  'under-500': '500字未満',
  'under-1000': '500〜999字',
  'under-1500': '1000〜1499字',
  'under-2000': '1500〜1999字',
  'under-2500': '2000〜2499字',
  'under-3000': '2500〜2999字',
  'under-3500': '3000〜3499字',
  'over-3500': '3500字以上',
};

const TEXT_DIFFICULTY_LABELS = {
  basic: '基礎',
  standard: '標準',
  advanced: '発展',
};

const TEXT_PRACTICE_LEVEL_LABELS = {
  beginner: '初心者向け',
  standard: '標準練習',
  advanced: '発展練習',
};

const TEXT_RHYTHM_LABELS = {
  stable: '安定型',
  mixed: '変化型',
  variable: '変化大',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeHtml(value) {
  return escapeHtml(value == null ? '' : value);
}

function getLabelValue(labels, value, fallback) {
  return labels[value] || fallback;
}

function getDifficultyLabel(value) {
  return getLabelValue(TEXT_DIFFICULTY_LABELS, value, '標準');
}

function getLengthBandLabel(value) {
  return getLabelValue(TEXT_LENGTH_BAND_LABELS, value, '文字数未分類');
}

function getPracticeLevelLabel(value) {
  return getLabelValue(TEXT_PRACTICE_LEVEL_LABELS, value, '標準練習');
}

function getRhythmLabel(value) {
  return getLabelValue(TEXT_RHYTHM_LABELS, value, '安定型');
}
