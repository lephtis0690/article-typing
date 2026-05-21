// アプリ全体の状態変数
// 画面部品の取得は 02-dom.js、課題文フォールバックは 00-fallback-texts.js に分離。

let textItems = [...TEXTS_FALLBACK];
let LONG_TEXT = TEXTS_FALLBACK[0].text;
let currentTextTitle = TEXTS_FALLBACK[0].title;
let currentTextId = TEXTS_FALLBACK[0].id;

let totalSeconds = 180;
let remainSeconds = 0;
let timerID = null;
let startTime = null;
let running = false;
let correctCount = 0;
let missCount = 0;
let backspaceCount = 0;
let twoMinuteCallShown = false;
let tenSecondCallShown = false;
let timeCallTimer = null;

