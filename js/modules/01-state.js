// アプリ全体の状態管理
// 既存機能を変えず、ゲーム状態を gameState に集約する。
// 各モジュールは gameState の各プロパティを参照・更新する。

const gameState = {
  texts: {
    items: [...TEXTS_FALLBACK],
    currentText: TEXTS_FALLBACK[0].text,
    currentTitle: TEXTS_FALLBACK[0].title,
    currentId: TEXTS_FALLBACK[0].id,
    selectionMode: 'random',
    lastRandomTextId: null,
    filters: {
      keyword: '',
      genre: 'all',
      length: 'all',
      kanji: 'all',
      difficulty: 'all',
      sort: 'default',
    },
    diagnostics: {
      source: 'fallback',
      categories: [],
      warnings: [],
      summary: null,
    },
  },
  session: {
    totalSeconds: 180,
    remainSeconds: 0,
    timerID: null,
    startTime: null,
    running: false,
    correctCount: 0,
    missCount: 0,
    backspaceCount: 0,
  },
  timer: {
    twoMinuteCallShown: false,
    tenSecondCallShown: false,
    timeCallTimer: null,
  },
  countdown: {
    active: false,
    timers: [],
  },
  chart: {
    cpmHistory: [],
    missHistory: [],
    points: [],
    hoverIndex: -1,
    lastRecordedSec: -1,
  },
};

// ブラウザのコンソールや簡易テストから状態を確認しやすくする。
// 実装本体は同じ gameState オブジェクトを参照するため、挙動は変わらない。
if (typeof window !== 'undefined') window.gameState = gameState;

function resetSessionStats() {
  gameState.session.correctCount = 0;
  gameState.session.missCount = 0;
  gameState.session.backspaceCount = 0;
}

function resetTimeCallFlags() {
  gameState.timer.twoMinuteCallShown = false;
  gameState.timer.tenSecondCallShown = false;
}

function resetChartState() {
  gameState.chart.cpmHistory = [{ time: 0, cpm: 0, correct: 0, instantCpm: 0 }];
  gameState.chart.missHistory = [{ time: 0, miss: 0 }];
  gameState.chart.points = [];
  gameState.chart.hoverIndex = -1;
  gameState.chart.lastRecordedSec = 0;
}
