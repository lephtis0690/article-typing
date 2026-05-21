// DOM参照
// HTML側のID変更時は、まずこのファイルを確認する。

const timeSelect      = document.getElementById('time-select');
const taskTitle       = document.getElementById('task-title');
const startModeSelect = document.getElementById('start-mode');
const displayPresetModeSelect = document.getElementById('display-preset-mode');
const manualDetailModeCheckbox = document.getElementById('manual-detail-mode');
const feedbackModeSelect = document.getElementById('feedback-mode');
const correctFeedbackModeSelect = document.getElementById('correct-feedback-mode');
// 結果画面は独立画面で常時表示するため、ホーム画面の結果表示選択は廃止。
const liveStatusModeSelect = document.getElementById('live-status-mode');
const themeModeSelect = document.getElementById('theme-mode');
const accessibilityModeSelect = document.getElementById('accessibility-mode');
const typingPositionModeSelect = document.getElementById('typing-position-mode');
const timeCallModeSelect = document.getElementById('time-call-mode');
const btnConfigToggle = document.getElementById('btn-config-toggle');
const advancedSettings = document.getElementById('advanced-settings');
const disqualifyLimitSelect = document.getElementById('disqualify-limit');
const btnStart        = document.getElementById('btn-start');
const btnAbort        = document.getElementById('btn-abort');
const btnRetry        = document.getElementById('btn-retry');
const btnRetryRandom  = document.getElementById('btn-retry-random');
const btnBackConfig   = document.getElementById('btn-back-config');
const timerDisplay    = document.getElementById('timer-display');
const timerLabel      = document.getElementById('timer-label');
const timerPill       = document.getElementById('timer-pill');
const correctDisplay  = document.getElementById('correct-display');
const missDisplay     = document.getElementById('miss-display');
const cpmDisplay      = document.getElementById('cpm-display');
const progressDisplay = document.getElementById('progress-display');
const progressBar     = document.getElementById('progress-bar');
const textDisplay     = document.getElementById('text-display');
const typingArea      = document.getElementById('typing-area');
const resultScreen    = document.getElementById('result-screen');
const resCorrect      = document.getElementById('res-correct');
const resBackspace    = document.getElementById('res-backspace');
const resAccuracy     = document.getElementById('res-accuracy');
const resCpm          = document.getElementById('res-cpm');
const resCps          = document.getElementById('res-cps');
const resElapsed      = document.getElementById('res-elapsed');
const resTaskTitle    = document.getElementById('res-task-title');
const resCondition    = document.getElementById('res-condition');
const resultSummaryText = document.getElementById('result-summary-text');
const countdownOverlay = document.getElementById('countdown-overlay');
const timeCall = document.getElementById('time-call');
const cpmChart        = document.getElementById('cpm-chart');

const recordCurrentNote = document.getElementById('record-current-note');
const recordHistoryBody = document.getElementById('record-history-body');

// --- 採点詳細関連の DOM 参照 -----------------------------------------------
// 結果画面に追加した「採点詳細」「表示設定」関連の要素をまとめて取得しておく。
// 既存ロジックには触れず、これらは endGame の最後と表示設定変更時にだけ使う。
const resInput            = document.getElementById('res-input');
const resErrorTotal       = document.getElementById('res-error-total');
const resNet              = document.getElementById('res-net');
const resDeduction        = document.getElementById('res-deduction');
const resJudge            = document.getElementById('res-judge');
const resJudgeNote        = document.getElementById('res-judge-note');
const errMisuseCount      = document.getElementById('err-misuse-count');
const errMissingCount     = document.getElementById('err-missing-count');
const errExtraCount       = document.getElementById('err-extra-count');
const errSpaceCount       = document.getElementById('err-space-count');
const errNewlineExtraCount= document.getElementById('err-newline-extra-count');
const errNewlineMissCount = document.getElementById('err-newline-miss-count');
const errWidthCount       = document.getElementById('err-width-count');
const errPunctCount       = document.getElementById('err-punct-count');
const listMisuse          = document.getElementById('list-misuse');
const listMissing         = document.getElementById('list-missing');
const listExtra           = document.getElementById('list-extra');
const listSpacing         = document.getElementById('list-spacing');
const listWidthPunct      = document.getElementById('list-width-punct');

// 1秒ごとの CPM 推移。{ time: 経過秒, cpm: その時点の CPM } を push する。
// time=0 (計測開始直後) は CPM=0 で初期化しておく。
let cpmHistory = [];
// 各秒のミス数履歴。CPMグラフにミス発生地点を控えめに表示するために使う。
let missHistory = [];
// グラフ上の点の座標。マウスホバー時の当たり判定に使う。
let cpmChartPoints = [];
let cpmChartHoverIndex = -1;
// 直前に記録した秒数。秒境界をまたいだときだけ push するために使う。
let lastRecordedSec = -1;

// カウントダウン中（スタート押下後〜計測開始前）に立つフラグ。
// 計測は始まっていないので running は false のままだが、
// 中断ボタンでキャンセルできるよう、別フラグで管理する。
let countingDown = false;
let countdownTimers = [];

// 毎回スタート時に課題文をランダム選択するため、
// 直前に出題した課題文IDを保持して同じ課題文の連続出題をできるだけ避ける。
let lastRandomTextId = null;
// 課題文の選択状態。通常は random、課題一覧で選んだ場合だけ manual にする。
let textSelectionMode = 'random';

