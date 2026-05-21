// 開始・中断・入力イベント
// 元ファイル: js/app.js から機能別に分割

function startGame() {
  // 基本仕様はランダム出題。課題一覧で明示的に選んだ場合だけ、その課題を使う。
  // Escキーで開始した場合もこの startGame() を通るため、同じ仕様になる。
  if (textSelectionMode === 'random') {
    applyRandomTextForStart();
  } else if (currentTextId) {
    applySelectedText(currentTextId);
  }

  const completeMode = isCompleteMode();
  totalSeconds = completeMode ? 0 : (parseInt(timeSelect.value, 10) || 180);
  const mode = startModeSelect.value;

  // モード共通の前準備（結果画面を閉じる、課題文をリセット表示する、など）。
  // ただし入力欄を有効化するかどうかはモードごとに違うので、ここではまだ触らない。
  resultScreen.style.display = 'none';
  correctCount = 0;
  missCount = 0;
  backspaceCount = 0;
  remainSeconds = totalSeconds;
  renderTextDisplay('');
  correctDisplay.textContent = '0';
  missDisplay.textContent = '0';
  cpmDisplay.textContent = '0';
  progressDisplay.textContent = '0%';
  progressBar.style.width = '0%';
  timerPill.classList.remove('danger');
  twoMinuteCallShown = false;
  tenSecondCallShown = false;
  hideTimeCall();
  updateTimer();

  if (mode === 'countdown') {
    runCountdown(() => beginMeasurement());
  } else {
    beginMeasurement();
  }
}

// 3,2,1,START のカウントダウンを表示し、終わったら onDone を呼ぶ。
// この間は入力欄を有効にせず、制限時間タイマーも動かさない。
// 中断ボタンはこのフェーズでも押せるようにしておく。
function runCountdown(onDone) {
  countingDown = true;
  // ボタン状態: スタートは押せない、中断はカウントダウンを取り消すために有効。
  btnStart.disabled = true;
  btnAbort.disabled = false;
  setConfigControlsDisabled(true);
  // 入力欄はまだ無効のまま
  typingArea.disabled = true;
  typingArea.value = '';

  // オーバーレイ表示
  countdownOverlay.classList.add('active');

  const steps = [
    { label: '3', go: false, delay: 0 },
    { label: '2', go: false, delay: 1000 },
    { label: '1', go: false, delay: 2000 },
    { label: 'START', go: true, delay: 3000 },
  ];

  countdownTimers = [];
  steps.forEach(step => {
    const t = setTimeout(() => {
      // アニメーションをやり直すため、毎回新しい span に差し替える。
      const current = countdownOverlay.querySelector('.cd-num');
      const fresh = document.createElement('span');
      fresh.id = 'countdown-num';
      fresh.textContent = step.label;
      fresh.className = step.go ? 'cd-num go' : 'cd-num';
      if (current) current.replaceWith(fresh);
      else countdownOverlay.appendChild(fresh);
    }, step.delay);
    countdownTimers.push(t);
  });
  // 最後の START 表示から少し見せた後、計測開始
  const finishT = setTimeout(() => {
    countdownOverlay.classList.remove('active');
    countingDown = false;
    countdownTimers = [];
    onDone();
  }, 3500);
  countdownTimers.push(finishT);
}

// カウントダウン中に中断ボタンが押されたときの取消処理。
// 計測は始まっていないので採点はせず、スタート前の状態へ戻すだけ。
function cancelCountdown() {
  countdownTimers.forEach(clearTimeout);
  countdownTimers = [];
  countingDown = false;
  countdownOverlay.classList.remove('active');
  hideTimeCall();
  document.body.classList.remove('focus-mode');
  // 初期状態（スタート前）に戻す
  btnStart.disabled = false;
  btnAbort.disabled = true;
  setConfigControlsDisabled(false);
  typingArea.disabled = true;
  typingArea.value = '';
  initDisplay();
}

// 実際に計測を開始する処理。startTime をここで取得することで、
// CPM の計算もカウントダウン終了後の時刻を基準にできる。
function beginMeasurement() {
  const completeMode = isCompleteMode();
  totalSeconds = completeMode ? 0 : (parseInt(timeSelect.value, 10) || 180);
  remainSeconds = totalSeconds;
  correctCount = 0;
  missCount = 0;
  backspaceCount = 0;
  twoMinuteCallShown = false;
  tenSecondCallShown = false;
  hideTimeCall();
  startTime = Date.now();
  running = true;
  document.body.classList.add('focus-mode');
  // CPM 履歴をリセット。0秒時点は CPM=0 として起点を持たせておくと、
  // 折れ線が左端から立ち上がるのできれいに見える。
  cpmHistory = [{ time: 0, cpm: 0, correct: 0, instantCpm: 0 }];
  missHistory = [{ time: 0, miss: 0 }];
  lastRecordedSec = 0;
  typingArea.value = '';
  typingArea.disabled = false;
  typingArea.focus();
  btnStart.disabled = true;
  btnAbort.disabled = false;
  setConfigControlsDisabled(true);
  resultScreen.style.display = 'none';
  renderTextDisplay('');
  updateStats('');
  updateTimer();
  timerID = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    if (!isCompleteMode()) {
      const previousRemainSeconds = remainSeconds;
      remainSeconds = totalSeconds - Math.floor(elapsed);
      if (!twoMinuteCallShown && previousRemainSeconds > 120 && remainSeconds <= 120) {
        twoMinuteCallShown = true;
        showTimeCall('あと2分');
      }
      if (!tenSecondCallShown && previousRemainSeconds > 10 && remainSeconds <= 10) {
        tenSecondCallShown = true;
        showTimeCall('あと10秒');
      }
    }
    updateTimer();
    updateStats(typingArea.value);
    // 秒境界をまたいだときだけ CPM を記録する。
    // setInterval は 250ms 間隔なので、Math.floor を見て1秒進んだら push する。
    const sec = Math.floor(elapsed);
    if (sec > lastRecordedSec) {
      const cpmNow = parseInt(cpmDisplay.textContent, 10) || 0;
      const prevPoint = cpmHistory[cpmHistory.length - 1] || { time: 0, correct: 0 };
      const diffTime = Math.max(1, sec - prevPoint.time);
      const diffCorrect = Math.max(0, correctCount - (prevPoint.correct || 0));
      const instantCpm = Math.round((diffCorrect / diffTime) * 60);
      cpmHistory.push({ time: sec, cpm: cpmNow, correct: correctCount, instantCpm, miss: missCount });
      missHistory.push({ time: sec, miss: missCount });
      lastRecordedSec = sec;
    }
    if (!isCompleteMode() && remainSeconds <= 0) endGame();
  }, 250);
}

function endGame() {
  if (!running) return;
  running = false;
  document.body.classList.remove('focus-mode');
  clearInterval(timerID);
  hideTimeCall();

  // 終了ボタン直後やIME確定直後でも、最後の入力内容で必ず再集計する。
  // これにより、結果画面の基本数値と詳細採点の入力範囲がずれない。
  const finalInput = typingArea.value;
  updateStats(finalInput);

  typingArea.disabled = true;
  btnStart.disabled = false;
  btnAbort.disabled = true;
  setConfigControlsDisabled(false);
  const elapsed = Math.max(1, (Date.now() - startTime) / 1000);
  const total = correctCount + missCount;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const cpm = Math.round((correctCount / elapsed) * 60);
  const cps = (correctCount / elapsed).toFixed(1);
  resCorrect.textContent = correctCount;
  if (resBackspace) resBackspace.textContent = backspaceCount;
  resAccuracy.textContent = accuracy;
  resCpm.textContent = cpm;
  resCps.textContent = cps;
  if (resElapsed) resElapsed.textContent = formatSeconds(Math.floor(elapsed));
  if (resTaskTitle) resTaskTitle.textContent = `課題文：${currentTextTitle}`;
  if (resCondition) {
    resCondition.textContent = isCompleteMode()
      ? '終了条件：全文打ち切り'
      : `終了条件：${formatSeconds(parseInt(timeSelect.value, 10) || 180)}`;
  }
  // 詳細採点を先に計算しておく。
  // 前版では、ここで未定義の errorTotal を参照していたため、
  // ReferenceError が発生し、結果画面の表示処理まで到達しなかった。
  const detailedResult = runDetailedScoring(finalInput);
  const finalErrorTotal = detailedResult ? detailedResult.errorTotal : 0;
  if (resultSummaryText) {
    resultSummaryText.textContent = `正解 ${correctCount} 文字、エラー ${finalErrorTotal} 件、Backspace ${backspaceCount} 回、正確率 ${accuracy}%、CPM ${cpm}。`;
  }
  // 最終時点の CPM を履歴の末尾に追加して、グラフの右端をきっちり最終値で終わらせる。
  // 例えば 30 秒で終了した場合、最後の秒境界記録（時刻 30 のはず）の上に
  // 同じ秒の最終値を上書きすると重複するので、末尾と同じ秒なら置換する。
  const lastSec = Math.floor(elapsed);
  const prevFinalPoint = cpmHistory.length ? cpmHistory[cpmHistory.length - 1] : { time: 0, correct: 0 };
  const diffFinalTime = Math.max(1, lastSec - prevFinalPoint.time);
  const diffFinalCorrect = Math.max(0, correctCount - (prevFinalPoint.correct || 0));
  const finalInstantCpm = diffFinalCorrect > 0 ? Math.round((diffFinalCorrect / diffFinalTime) * 60) : (prevFinalPoint.instantCpm || 0);
  const finalPoint = { time: lastSec, cpm, correct: correctCount, instantCpm: finalInstantCpm, miss: missCount };
  if (cpmHistory.length && cpmHistory[cpmHistory.length - 1].time === lastSec) {
    cpmHistory[cpmHistory.length - 1] = finalPoint;
    if (missHistory.length) missHistory[missHistory.length - 1] = { time: lastSec, miss: missCount };
  } else {
    cpmHistory.push(finalPoint);
    missHistory.push({ time: lastSec, miss: missCount });
  }
  document.body.classList.add('result-mode');
  resultScreen.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // 結果画面を表示してから描画する。display:none の状態だと canvas の
  // clientWidth が 0 になり、解像度合わせがずれるため。
  cpmChartHoverIndex = -1;
  drawCPMChart();
  // 採点詳細は上で計算済み。ここでは結果画面用の課題文表示だけを更新する。
  if (feedbackModeSelect && feedbackModeSelect.value === 'result') {
    renderTextDisplay(finalInput, true);
  }
}


// === 不正入力防止 =========================================================
// 速度試験では、コピー＆ペーストや外部テキストのドラッグ投入を禁止したい。
// ブラウザ上で完全な不正防止はできないが、通常操作での貼り付けはここでまとめて抑止する。
// 対象:
//  - Ctrl+V / Cmd+V / Shift+Insert
//  - 右クリックメニューからの貼り付け
//  - paste イベント
//  - beforeinput の insertFromPaste / insertFromDrop
//  - ドラッグ＆ドロップによる文字投入
let blockedPasteCount = 0;

function showAntiCheatNotice(message) {
  blockedPasteCount++;
  const base = '貼り付け・ドラッグ投入は禁止です。手入力のみで行ってください。';
  const text = message || base;
  // 入力中に何度も alert が出ると操作性が悪いため、画面上のプレースホルダで知らせる。
  typingArea.placeholder = `${text}（検知 ${blockedPasteCount} 回）`;
}

function blockIllegalInput(e, message) {
  e.preventDefault();
  e.stopPropagation();
  showAntiCheatNotice(message);
  return false;
}

typingArea.addEventListener('paste', (e) => {
  blockIllegalInput(e);
});

typingArea.addEventListener('drop', (e) => {
  blockIllegalInput(e, 'ドラッグ＆ドロップによる入力は禁止です。手入力のみで行ってください。');
});

typingArea.addEventListener('dragover', (e) => {
  // drop を成立させないため、dragover も止めておく。
  e.preventDefault();
});

typingArea.addEventListener('contextmenu', (e) => {
  // 右クリックメニューからの貼り付けを抑止。
  blockIllegalInput(e, '右クリックメニューからの貼り付けは禁止です。');
});

typingArea.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') {
    blockIllegalInput(e);
  }
});

// IME変換中フラグ。日本語をローマ字入力する際、未確定文字（例: "d" や "n"）も
// textarea.value に入り input イベントが発火するため、変換中は表示・統計の更新を止める。
// 確定したタイミング（compositionend）で改めて更新する。
let isComposing = false;

typingArea.addEventListener('compositionstart', () => {
  isComposing = true;
});

// IME変換中の Enter キーが textarea に改行として挿入されるのを防ぐ。
// 一部のブラウザ／IMEでは変換確定のEnterが keydown として漏れて、textarea に \n を挿入し、
// その結果カーソル位置が課題文側で1つ余計に進んで自動スクロールしてしまう。
// keydown は compositionend より先に届くケースが多いため、event.isComposing / keyCode===229 をチェック。
typingArea.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  // 貼り付けショートカットを禁止する。
  // Ctrl+V / Cmd+V に加え、Windowsで使われる Shift+Insert も止める。
  if (running && e.key === 'Backspace') {
    backspaceCount++;
  }

  if (((e.ctrlKey || e.metaKey) && key === 'v') || (e.shiftKey && e.key === 'Insert')) {
    blockIllegalInput(e);
    return;
  }

  if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) {
    e.preventDefault();
  }
});

typingArea.addEventListener('compositionend', () => {
  isComposing = false;
  if (!running) return;
  // 念のため、確定直後に末尾の改行が紛れ込んでいたら除去する（保険）。
  if (typingArea.value.endsWith('\n')) {
    typingArea.value = typingArea.value.replace(/\n+$/, '');
  }
  const input = typingArea.value;
  renderTextDisplay(input);
  updateStats(input);
  if (input.length >= LONG_TEXT.length && (isCompleteMode() || input === LONG_TEXT)) endGame();
});

typingArea.addEventListener('input', (e) => {
  if (!running) return;
  // Chrome/Edge では input イベント側にも isComposing が立つことがある。
  // 「d」など未確定のローマ字1文字で課題文側を動かさないため、両方を見る。
  if (isComposing || e.isComposing) return; // 変換中は無視
  const input = typingArea.value;
  renderTextDisplay(input);
  updateStats(input);
  if (input.length >= LONG_TEXT.length && (isCompleteMode() || input === LONG_TEXT)) endGame();
});


// === キーボードショートカット =============================================
// Esc: 未開始ならスタート、カウントダウン中ならキャンセル、計測中なら中断して採点。
// Enter は日本語入力の変換確定や改行入力と衝突しやすいため、開始キーとしては使わない。
document.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;

  if (e.key !== 'Escape') return;

  e.preventDefault();

  if (countingDown) {
    cancelCountdown();
    return;
  }

  if (running) {
    endGame();
    return;
  }

  const resultVisible = resultScreen && resultScreen.style.display === 'block';
  if (resultVisible) return;

  startGame();
});

btnStart.addEventListener('click', startGame);
btnAbort.addEventListener('click', () => {
  // カウントダウン中なら計測を始める前の状態に戻すだけ。
  // 計測中なら従来通り「中断して採点」へ。
  if (countingDown) {
    cancelCountdown();
    return;
  }
  if (running) endGame();
});
function closeResultScreenForNextPractice() {
  // 結果画面から戻るときは、必ず「スタート前」の状態に戻す。
  // 再挑戦ボタンを押した直後に、前回のタイマーや入力可能状態が残って
  // そのまま計測が始まったように見えることを防ぐ。
  running = false;
  countingDown = false;
  clearInterval(timerID);
  timerID = null;
  countdownTimers.forEach(t => clearTimeout(t));
  countdownTimers = [];

  document.body.classList.remove('focus-mode', 'result-mode');
  if (countdownOverlay) countdownOverlay.classList.remove('active');
  if (resultScreen) resultScreen.style.display = 'none';
  if (typingArea) {
    typingArea.value = '';
    typingArea.disabled = true;
    typingArea.blur();
  }

  if (btnStart) btnStart.disabled = false;
  if (btnAbort) btnAbort.disabled = true;
  setConfigControlsDisabled(false);

  initDisplay();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restartSameText() {
  if (currentTextId) {
    // 「ランダム」で出た課題でも、同じ課題を確実に再利用できるように手動選択扱いへ切り替える。
    textSelectionMode = 'manual';
    applySelectedText(currentTextId);
  }
  // 再挑戦ボタンでは計測を開始しない。
  // 課題文をスタート前の状態に戻し、開始は通常のスタートボタンまたはEscキーに任せる。
  closeResultScreenForNextPractice();
}

function restartRandomText() {
  textSelectionMode = 'random';
  // ランダム課題を先に表示するだけで、計測は開始しない。
  // いきなりカウントダウンや計測が始まらないようにする。
  applyRandomTextForStart();
  closeResultScreenForNextPractice();
}

if (btnRetry) btnRetry.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  restartSameText();
  btnRetry.blur();
});
if (btnRetryRandom) btnRetryRandom.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  restartRandomText();
  btnRetryRandom.blur();
});
if (btnBackConfig) btnBackConfig.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeResultScreenForNextPractice();
  btnBackConfig.blur();
});

// === CPM 推移グラフ =========================================================
// 仕様:
//  - 横軸 = 経過秒数（0 〜 cpmHistory の最後の time）
//  - 縦軸 = CPM（0 〜 最大値を切り上げたキリのいい数字までで自動スケール）
//  - グリッド、軸ラベル、折れ線、データ点ドットを描画
