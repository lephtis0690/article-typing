// 開始・中断・入力イベント
// 元ファイル: js/app.js から機能別に分割

function startGame() {
  // 基本仕様はランダム出題。課題一覧で明示的に選んだ場合だけ、その課題を使う。
  // Escキーで開始した場合もこの startGame() を通るため、同じ仕様になる。
  if (gameState.texts.selectionMode === 'random') {
    applyRandomTextForStart();
  } else if (gameState.texts.currentId) {
    applySelectedText(gameState.texts.currentId);
  }

  const completeMode = isCompleteMode();
  gameState.session.totalSeconds = completeMode ? 0 : (parseInt(timeSelect.value, 10) || 180);
  const mode = startModeSelect.value;

  // モード共通の前準備（結果画面を閉じる、課題文をリセット表示する、など）。
  // ただし入力欄を有効化するかどうかはモードごとに違うので、ここではまだ触らない。
  resultScreen.style.display = 'none';
  if (recordsScreen) recordsScreen.style.display = 'none';
  if (gameState.session.timerID) {
    clearInterval(gameState.session.timerID);
    gameState.session.timerID = null;
  }
  if (gameState.session.finishTimerID) {
    clearTimeout(gameState.session.finishTimerID);
    gameState.session.finishTimerID = null;
  }
  gameState.session.correctCount = 0;
  gameState.session.missCount = 0;
  gameState.session.backspaceCount = 0;
  gameState.session.remainSeconds = gameState.session.totalSeconds;
  renderTextDisplay('');
  correctDisplay.textContent = '0';
  missDisplay.textContent = '0';
  cpmDisplay.textContent = '0';
  progressDisplay.textContent = '0%';
  progressBar.style.width = '0%';
  timerPill.classList.remove('danger');
  gameState.timer.twoMinuteCallShown = false;
  gameState.timer.tenSecondCallShown = false;
  hideTimeCall();
  updateTimer();

  // 本番モードでは、詳細設定に関係なく実際の大会環境に合わせて3秒後に開始する。
  if (mode === 'countdown' || isCompetitionPresetMode()) {
    runCountdown(() => beginMeasurement());
  } else {
    beginMeasurement();
  }
}

// 3,2,1,START のカウントダウンを表示し、終わったら onDone を呼ぶ。
// この間は入力欄を有効にせず、制限時間タイマーも動かさない。
// 中断ボタンはこのフェーズでも押せるようにしておく。
function runCountdown(onDone) {
  gameState.countdown.active = true;
  // ボタン状態: スタートは押せない、中断はカウントダウンを取り消すために有効。
  btnStart.disabled = true;
  btnAbort.disabled = false;
  setConfigControlsDisabled(true);
  // 入力欄はまだ無効のまま
  typingArea.disabled = true;
  typingArea.value = '';
  typingArea.placeholder = 'Escで開始...';

  // オーバーレイ表示
  countdownOverlay.classList.add('active');

  const steps = [
    { label: '3', go: false, delay: 0 },
    { label: '2', go: false, delay: 1000 },
    { label: '1', go: false, delay: 2000 },
    { label: 'START', go: true, delay: 3000 },
  ];

  gameState.countdown.timers = [];
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
    gameState.countdown.timers.push(t);
  });
  // 最後の START 表示から少し見せた後、計測開始
  const finishT = setTimeout(() => {
    countdownOverlay.classList.remove('active');
    gameState.countdown.active = false;
    gameState.countdown.timers = [];
    onDone();
  }, 3500);
  gameState.countdown.timers.push(finishT);
}

// カウントダウン中に中断ボタンが押されたときの取消処理。
// 計測は始まっていないので採点はせず、スタート前の状態へ戻すだけ。
function cancelCountdown() {
  gameState.countdown.timers.forEach(clearTimeout);
  gameState.countdown.timers = [];
  gameState.countdown.active = false;
  countdownOverlay.classList.remove('active');
  if (gameState.session.finishTimerID) {
    clearTimeout(gameState.session.finishTimerID);
    gameState.session.finishTimerID = null;
  }
  hideTimeCall();
  document.body.classList.remove('focus-mode');
  // 初期状態（スタート前）に戻す
  btnStart.disabled = false;
  btnAbort.disabled = true;
  setConfigControlsDisabled(false);
  typingArea.disabled = true;
  typingArea.value = '';
  typingArea.placeholder = 'Escで開始...';
  initDisplay();
}

// 実際に計測を開始する処理。gameState.session.startTime をここで取得することで、
// CPM の計算もカウントダウン終了後の時刻を基準にできる。
function beginMeasurement() {
  const completeMode = isCompleteMode();
  gameState.session.totalSeconds = completeMode ? 0 : (parseInt(timeSelect.value, 10) || 180);
  gameState.session.remainSeconds = gameState.session.totalSeconds;
  gameState.session.correctCount = 0;
  gameState.session.missCount = 0;
  gameState.session.backspaceCount = 0;
  gameState.timer.twoMinuteCallShown = false;
  gameState.timer.tenSecondCallShown = false;
  hideTimeCall();
  gameState.session.startTime = Date.now();
  gameState.session.running = true;
  document.body.classList.add('focus-mode');
  // CPM 履歴をリセット。0秒時点は CPM=0 として起点を持たせておくと、
  // 折れ線が左端から立ち上がるのできれいに見える。
  gameState.chart.cpmHistory = [{ time: 0, cpm: 0, correct: 0, instantCpm: 0 }];
  gameState.chart.missHistory = [{ time: 0, miss: 0 }];
  gameState.chart.lastRecordedSec = 0;
  typingArea.value = '';
  typingArea.placeholder = 'ここに入力してください';
  typingArea.disabled = false;
  typingArea.focus();
  btnStart.disabled = true;
  btnAbort.disabled = false;
  setConfigControlsDisabled(true);
  resultScreen.style.display = 'none';
  renderTextDisplay('');
  updateStats('');
  updateTimer();

  // 制限時間終了による結果遷移は、画面更新用の setInterval だけに依存しない。
  // 本番モード／練習モードとも、指定時間が来たらこの one-shot タイマーで必ず endGame() を呼ぶ。
  // interval 側の判定も残しているため、通常はどちらか早い方で終了し、endGame の running ガードで二重終了を防ぐ。
  if (gameState.session.finishTimerID) clearTimeout(gameState.session.finishTimerID);
  gameState.session.finishTimerID = null;
  if (!completeMode && gameState.session.totalSeconds > 0) {
    gameState.session.finishTimerID = setTimeout(() => {
      gameState.session.finishTimerID = null;
      if (gameState.session.running) {
        gameState.session.remainSeconds = 0;
        updateTimer();
        endGame();
      }
    }, (gameState.session.totalSeconds * 1000) + 150);
  }

  gameState.session.timerID = setInterval(() => {
    const elapsed = (Date.now() - gameState.session.startTime) / 1000;
    if (!isCompleteMode()) {
      const previousRemainSeconds = gameState.session.remainSeconds;
      gameState.session.remainSeconds = gameState.session.totalSeconds - Math.floor(elapsed);
      if (!gameState.timer.twoMinuteCallShown && previousRemainSeconds > 120 && gameState.session.remainSeconds <= 120) {
        gameState.timer.twoMinuteCallShown = true;
        showTimeCall('あと2分');
      }
      if (!gameState.timer.tenSecondCallShown && previousRemainSeconds > 10 && gameState.session.remainSeconds <= 10) {
        gameState.timer.tenSecondCallShown = true;
        showTimeCall('あと10秒');
      }
    }
    updateTimer();
    updateStats(typingArea.value);
    // 秒境界をまたいだときだけ CPM を記録する。
    // setInterval は 250ms 間隔なので、Math.floor を見て1秒進んだら push する。
    const sec = Math.floor(elapsed);
    if (sec > gameState.chart.lastRecordedSec) {
      const cpmNow = parseInt(cpmDisplay.textContent, 10) || 0;
      const prevPoint = gameState.chart.cpmHistory[gameState.chart.cpmHistory.length - 1] || { time: 0, correct: 0 };
      const diffTime = Math.max(1, sec - prevPoint.time);
      const diffCorrect = Math.max(0, gameState.session.correctCount - (prevPoint.correct || 0));
      const instantCpm = Math.round((diffCorrect / diffTime) * 60);
      gameState.chart.cpmHistory.push({ time: sec, cpm: cpmNow, correct: gameState.session.correctCount, instantCpm, miss: gameState.session.missCount });
      gameState.chart.missHistory.push({ time: sec, miss: gameState.session.missCount });
      gameState.chart.lastRecordedSec = sec;
    }
    if (!isCompleteMode() && gameState.session.remainSeconds <= 0) endGame();
  }, 250);
}


function getTimeAtCorrectCount(targetCorrect) {
  const history = (gameState.chart && gameState.chart.cpmHistory) ? gameState.chart.cpmHistory : [];
  if (!targetCorrect || targetCorrect <= 0) return 0;
  if (!history.length) return null;

  let prev = history[0];
  for (let i = 1; i < history.length; i++) {
    const cur = history[i];
    const prevCorrect = Number(prev.correct || 0);
    const curCorrect = Number(cur.correct || 0);
    if (curCorrect >= targetCorrect) {
      if (curCorrect === prevCorrect) return Number(cur.time || 0);
      const ratio = Math.max(0, Math.min(1, (targetCorrect - prevCorrect) / (curCorrect - prevCorrect)));
      return Number(prev.time || 0) + (Number(cur.time || 0) - Number(prev.time || 0)) * ratio;
    }
    prev = cur;
  }
  return null;
}

function countErrorsInRange(classified, start, end) {
  if (!classified || !classified.lists) return 0;
  const lists = classified.lists;
  const all = [
    ...(lists.misuse || []),
    ...(lists.missing || []),
    ...(lists.extra || []),
    ...(lists.spacing || []),
    ...(lists.widthPunct || []),
  ];
  return all.filter(item => {
    const pos = Number(item.pos || 0);
    return pos >= start + 1 && pos <= end;
  }).length;
}

function countCorrectInRange(target, input, start, end) {
  let correct = 0;
  for (let i = start; i < end; i++) {
    if (input[i] && target[i] && input[i] === target[i]) correct++;
  }
  return correct;
}

function formatSectionCpm(value) {
  return Number.isFinite(value) ? `${Math.round(value)} CPM` : '—';
}

function renderSectionAnalysis(finalInput, elapsed) {
  if (!sectionEarlyCpm || !sectionMiddleCpm || !sectionLateCpm) return;

  const target = (typeof computeEffectiveTarget === 'function')
    ? computeEffectiveTarget(gameState.texts.currentText, finalInput)
    : gameState.texts.currentText.slice(0, finalInput.length);
  const scopeLength = Math.max(0, target.length);

  if (scopeLength < 3 || finalInput.length < 3) {
    sectionEarlyCpm.textContent = '—';
    sectionMiddleCpm.textContent = '—';
    sectionLateCpm.textContent = '—';
    if (sectionEarlyDetail) sectionEarlyDetail.textContent = '入力量不足';
    if (sectionMiddleDetail) sectionMiddleDetail.textContent = '入力量不足';
    if (sectionLateDetail) sectionLateDetail.textContent = '入力量不足';
    if (sectionAnalysisSummary) sectionAnalysisSummary.textContent = '入力文字数が少ないため、区間分析は表示できません。';
    return;
  }

  const classified = (typeof classifyErrors === 'function') ? classifyErrors(target, finalInput) : null;
  const bounds = [0, Math.floor(scopeLength / 3), Math.floor(scopeLength * 2 / 3), scopeLength];
  const labels = ['前半', '中盤', '後半'];
  const cpmEls = [sectionEarlyCpm, sectionMiddleCpm, sectionLateCpm];
  const detailEls = [sectionEarlyDetail, sectionMiddleDetail, sectionLateDetail];

  const totalCorrect = Number(gameState.session.correctCount || 0);
  const correctBounds = [0, Math.floor(totalCorrect / 3), Math.floor(totalCorrect * 2 / 3), totalCorrect];
  const timeBounds = [0, getTimeAtCorrectCount(correctBounds[1]), getTimeAtCorrectCount(correctBounds[2]), Math.max(1, elapsed)];

  const sections = labels.map((label, idx) => {
    const start = bounds[idx];
    const end = bounds[idx + 1];
    const chars = Math.max(0, end - start);
    const correct = countCorrectInRange(target, finalInput, start, end);
    const errors = countErrorsInRange(classified, start, end);
    const t0 = idx === 0 ? 0 : timeBounds[idx];
    const t1 = idx === 2 ? Math.max(1, elapsed) : timeBounds[idx + 1];
    const seconds = (Number.isFinite(t0) && Number.isFinite(t1)) ? Math.max(1, t1 - t0) : null;
    const cpm = seconds ? (correct / seconds) * 60 : null;
    return { label, chars, correct, errors, cpm };
  });

  sections.forEach((sec, idx) => {
    cpmEls[idx].textContent = formatSectionCpm(sec.cpm);
    if (detailEls[idx]) detailEls[idx].textContent = `${sec.chars}文字中 正解${sec.correct}／ミス${sec.errors}`;
  });

  const valid = sections.filter(s => Number.isFinite(s.cpm));
  if (sectionAnalysisSummary && valid.length >= 2) {
    const fastest = valid.reduce((a, b) => (a.cpm >= b.cpm ? a : b));
    const slowest = valid.reduce((a, b) => (a.cpm <= b.cpm ? a : b));
    const mostErrors = sections.reduce((a, b) => (a.errors >= b.errors ? a : b));
    const gap = Math.round(fastest.cpm - slowest.cpm);
    const stability = gap <= 30 ? '速度差は小さく、全体として安定しています。' : `最大で約${gap}CPMの差があります。`;
    sectionAnalysisSummary.textContent = `${fastest.label}が最も速く、${slowest.label}が最もゆっくりです。${stability} ミスは${mostErrors.label}に最も多く出ています。`;
  }
}


function averageRecords(records, key) {
  const list = (Array.isArray(records) ? records : [])
    .map(record => Number(record && record[key]))
    .filter(value => Number.isFinite(value));
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function formatSignedNumber(value, unit = '') {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value)}${unit}`;
}

function formatSignedFixed(value, digits = 1, unit = '') {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${unit}`;
}

function getRecentComparisonBase(store, currentTextId, limit = 10) {
  const history = Array.isArray(store && store.history) ? store.history : [];
  const sameText = history.filter(record => record && record.textId === currentTextId).slice(0, limit);
  if (sameText.length >= 2) return { records: sameText, label: '同じ課題の直近記録' };
  return { records: history.slice(0, limit), label: '全課題の直近記録' };
}

function renderRecentComparison(metrics, previousStore) {
  if (!recentCompareCpm || !recentCompareAccuracy || !recentCompareError) return;

  const store = previousStore || ((typeof readRecordsStore === 'function') ? readRecordsStore() : null);
  const base = getRecentComparisonBase(store, gameState.texts.currentId || '', 10);
  const records = base.records || [];

  if (!records.length) {
    recentCompareCpm.textContent = '—';
    recentCompareAccuracy.textContent = '—';
    recentCompareError.textContent = '—';
    if (recentCompareCpmDetail) recentCompareCpmDetail.textContent = '過去記録なし';
    if (recentCompareAccuracyDetail) recentCompareAccuracyDetail.textContent = '過去記録なし';
    if (recentCompareErrorDetail) recentCompareErrorDetail.textContent = '過去記録なし';
    if (recentComparisonSummary) recentComparisonSummary.textContent = 'まだ比較できる過去記録がありません。今回以降の記録が比較対象になります。';
    return;
  }

  const avgCpm = averageRecords(records, 'cpm');
  const avgAccuracy = averageRecords(records, 'accuracy');
  const avgError = averageRecords(records, 'errorTotal');
  const currentCpm = Number(metrics.cpm || 0);
  const currentAccuracy = Number(metrics.accuracy || 0);
  const currentError = Number(metrics.errorTotal || 0);
  const cpmDiff = currentCpm - avgCpm;
  const accuracyDiff = currentAccuracy - avgAccuracy;
  const errorDiff = currentError - avgError;

  recentCompareCpm.textContent = formatSignedNumber(cpmDiff, ' CPM');
  recentCompareAccuracy.textContent = formatSignedFixed(accuracyDiff, 1, '%');
  recentCompareError.textContent = formatSignedFixed(errorDiff, 1, ' 件');

  if (recentCompareCpmDetail) recentCompareCpmDetail.textContent = `今回 ${currentCpm} ／ 平均 ${Math.round(avgCpm)} CPM`;
  if (recentCompareAccuracyDetail) recentCompareAccuracyDetail.textContent = `今回 ${currentAccuracy}% ／ 平均 ${avgAccuracy.toFixed(1)}%`;
  if (recentCompareErrorDetail) recentCompareErrorDetail.textContent = `今回 ${currentError}件 ／ 平均 ${avgError.toFixed(1)}件`;

  const comments = [];
  if (cpmDiff >= 20) comments.push('速度は直近平均を上回っています');
  else if (cpmDiff <= -20) comments.push('速度は直近平均を下回っています');
  else comments.push('速度は直近平均とほぼ同水準です');

  if (accuracyDiff >= 0.5) comments.push('正確率は改善傾向です');
  else if (accuracyDiff <= -0.5) comments.push('正確率はやや低下しています');
  else comments.push('正確率は安定しています');

  if (errorDiff <= -1) comments.push('エラー数は少なめです');
  else if (errorDiff >= 1) comments.push('エラー数は多めです');
  else comments.push('エラー数は平均並みです');

  if (recentComparisonSummary) {
    recentComparisonSummary.textContent = `${base.label}${records.length}回平均との比較です。${comments.join('。')}。`;
  }
}

function endGame() {
  if (!gameState.session.running) return;
  gameState.session.running = false;
  document.body.classList.remove('focus-mode');
  if (gameState.session.timerID) {
    clearInterval(gameState.session.timerID);
    gameState.session.timerID = null;
  }
  if (gameState.session.finishTimerID) {
    clearTimeout(gameState.session.finishTimerID);
    gameState.session.finishTimerID = null;
  }
  hideTimeCall();

  // 終了ボタン直後やIME確定直後でも、最後の入力内容で必ず再集計する。
  // これにより、結果画面の基本数値と詳細採点の入力範囲がずれない。
  const finalInput = typingArea.value;
  const isCompleted = finalInput.length >= gameState.texts.currentText.length;
  updateStats(finalInput);

  typingArea.disabled = true;
  btnStart.disabled = false;
  btnAbort.disabled = true;
  setConfigControlsDisabled(false);
  const endTime = Date.now();
  const elapsed = Math.max(1, (endTime - gameState.session.startTime) / 1000);
  // 詳細採点を先に計算しておく。
  // 結果画面では「正解文字数」を独立表示しない。
  // 位置一致数は脱字・余字で大きく崩れやすいため、最終結果の速度と正確率は
  // 実入力文字数と詳細採点のエラー総数を基準にする。
  const detailedResult = runDetailedScoring(finalInput);
  const finalErrorTotal = detailedResult ? detailedResult.errorTotal : 0;
  const typedChars = finalInput.length;
  const nonErrorChars = Math.max(0, typedChars - finalErrorTotal);
  const accuracy = typedChars > 0 ? Math.round((nonErrorChars / typedChars) * 100) : 0;
  const cpm = Math.round((typedChars / elapsed) * 60);
  const cps = (typedChars / elapsed).toFixed(1);
  if (resCorrect) resCorrect.textContent = nonErrorChars;
  if (resBackspace) resBackspace.textContent = gameState.session.backspaceCount;
  resAccuracy.textContent = accuracy;
  resCpm.textContent = cpm;
  resCps.textContent = cps;
  if (resElapsed) resElapsed.textContent = formatSeconds(Math.floor(elapsed));
  if (resTaskTitle) resTaskTitle.textContent = `課題文：${gameState.texts.currentTitle}`;
  if (resCondition) {
    resCondition.textContent = isCompleteMode()
      ? '終了条件：全文打ち切り'
      : `終了条件：${formatSeconds(parseInt(timeSelect.value, 10) || 180)}`;
  }
  if (resultSummaryText) {
    resultSummaryText.textContent = `入力 ${typedChars} 文字、エラー ${finalErrorTotal} 件、Backspace ${gameState.session.backspaceCount} 回、正確率 ${accuracy}%、CPM ${cpm}。`;
  }
  const resultMetrics = {
    elapsed,
    durationSeconds: elapsed,
    startedAt: new Date(gameState.session.startTime).toISOString(),
    endedAt: new Date(endTime).toISOString(),
    inputChars: finalInput.length,
    correct: nonErrorChars,
    accuracy,
    cpm,
    cps,
    backspace: gameState.session.backspaceCount,
    errorTotal: finalErrorTotal,
    net: detailedResult ? detailedResult.net : 0,
    isDisqualified: detailedResult ? detailedResult.isDisqualified : false,
    isCompleted
  };
  const previousRecordStore = (typeof readRecordsStore === 'function') ? readRecordsStore() : null;
  renderRecentComparison(resultMetrics, previousRecordStore);
  if (typeof saveResultRecord === 'function') {
    saveResultRecord(resultMetrics);
  }
  // 最終時点の CPM を履歴の末尾に追加して、グラフの右端をきっちり最終値で終わらせる。
  // 例えば 30 秒で終了した場合、最後の秒境界記録（時刻 30 のはず）の上に
  // 同じ秒の最終値を上書きすると重複するので、末尾と同じ秒なら置換する。
  const lastSec = Math.floor(elapsed);
  const prevFinalPoint = gameState.chart.cpmHistory.length ? gameState.chart.cpmHistory[gameState.chart.cpmHistory.length - 1] : { time: 0, correct: 0 };
  const diffFinalTime = Math.max(1, lastSec - prevFinalPoint.time);
  const diffFinalCorrect = Math.max(0, gameState.session.correctCount - (prevFinalPoint.correct || 0));
  const finalInstantCpm = diffFinalCorrect > 0 ? Math.round((diffFinalCorrect / diffFinalTime) * 60) : (prevFinalPoint.instantCpm || 0);
  const finalPoint = { time: lastSec, cpm, correct: gameState.session.correctCount, instantCpm: finalInstantCpm, miss: gameState.session.missCount };
  if (gameState.chart.cpmHistory.length && gameState.chart.cpmHistory[gameState.chart.cpmHistory.length - 1].time === lastSec) {
    gameState.chart.cpmHistory[gameState.chart.cpmHistory.length - 1] = finalPoint;
    if (gameState.chart.missHistory.length) gameState.chart.missHistory[gameState.chart.missHistory.length - 1] = { time: lastSec, miss: gameState.session.missCount };
  } else {
    gameState.chart.cpmHistory.push(finalPoint);
    gameState.chart.missHistory.push({ time: lastSec, miss: gameState.session.missCount });
  }
  renderSectionAnalysis(finalInput, elapsed);
  document.body.classList.remove('records-mode');
  document.body.classList.add('result-mode');
  if (recordsScreen) recordsScreen.style.display = 'none';
  resultScreen.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // 結果画面を表示してから描画する。display:none の状態だと canvas の
  // clientWidth が 0 になり、解像度合わせがずれるため。
  if (typeof stopCPMAnimation === 'function') stopCPMAnimation();
  gameState.chart.hoverIndex = -1;
  if (typeof updateCPMAnimationReadout === 'function') updateCPMAnimationReadout();
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
  if (gameState.session.running && e.key === 'Backspace') {
    gameState.session.backspaceCount++;
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
  if (!gameState.session.running) return;
  // 念のため、確定直後に末尾の改行が紛れ込んでいたら除去する（保険）。
  if (typingArea.value.endsWith('\n')) {
    typingArea.value = typingArea.value.replace(/\n+$/, '');
  }
  if (typeof removeTaskTitleLeakFromTypingArea === 'function' && removeTaskTitleLeakFromTypingArea()) {
    renderTextDisplay('');
    updateStats('');
    return;
  }
  const input = typingArea.value;
  renderTextDisplay(input);
  updateStats(input);
  if (input.length >= gameState.texts.currentText.length && (isCompleteMode() || input === gameState.texts.currentText)) endGame();
});

typingArea.addEventListener('input', (e) => {
  if (!gameState.session.running) return;
  // Chrome/Edge では input イベント側にも isComposing が立つことがある。
  // 「d」など未確定のローマ字1文字で課題文側を動かさないため、両方を見る。
  if (isComposing || e.isComposing) return; // 変換中は無視
  if (typeof removeTaskTitleLeakFromTypingArea === 'function' && removeTaskTitleLeakFromTypingArea()) {
    renderTextDisplay('');
    updateStats('');
    return;
  }
  const input = typingArea.value;
  renderTextDisplay(input);
  updateStats(input);
  if (input.length >= gameState.texts.currentText.length && (isCompleteMode() || input === gameState.texts.currentText)) endGame();
});


// === キーボードショートカット =============================================
// Esc: 未開始ならスタート、カウントダウン中ならキャンセル、計測中なら中断して採点。
// Enter は日本語入力の変換確定や改行入力と衝突しやすいため、開始キーとしては使わない。
document.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;

  if (e.key !== 'Escape') return;

  e.preventDefault();

  // モーダル／独立画面が開いている場合は、Escで開始せず先に閉じる。
  // ライブラリ表示中に背後でタイピングが始まるUXバグを防ぐ。
  if (typeof textLibraryModal !== 'undefined' && textLibraryModal && !textLibraryModal.classList.contains('hidden')) {
    if (typeof closeTextLibrary === 'function') closeTextLibrary();
    return;
  }

  if (typeof recordsScreen !== 'undefined' && recordsScreen && recordsScreen.style.display === 'block') {
    if (typeof closeRecordsScreen === 'function') closeRecordsScreen();
    return;
  }

  if (gameState.countdown.active) {
    cancelCountdown();
    return;
  }

  if (gameState.session.running) {
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
  if (gameState.countdown.active) {
    cancelCountdown();
    return;
  }
  if (gameState.session.running) endGame();
});
function closeResultScreenForNextPractice() {
  // 結果画面から戻るときは、必ず「スタート前」の状態に戻す。
  // 再挑戦ボタンを押した直後に、前回のタイマーや入力可能状態が残って
  // そのまま計測が始まったように見えることを防ぐ。
  gameState.session.running = false;
  gameState.countdown.active = false;
  clearInterval(gameState.session.timerID);
  gameState.session.timerID = null;
  if (gameState.session.finishTimerID) {
    clearTimeout(gameState.session.finishTimerID);
    gameState.session.finishTimerID = null;
  }
  gameState.countdown.timers.forEach(t => clearTimeout(t));
  gameState.countdown.timers = [];

  document.body.classList.remove('focus-mode', 'result-mode', 'records-mode');
  if (countdownOverlay) countdownOverlay.classList.remove('active');
  if (resultScreen) resultScreen.style.display = 'none';
  if (recordsScreen) recordsScreen.style.display = 'none';
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
  if (gameState.texts.currentId) {
    // 「ランダム」で出た課題でも、同じ課題を確実に再利用できるように手動選択扱いへ切り替える。
    gameState.texts.selectionMode = 'manual';
    applySelectedText(gameState.texts.currentId);
  }
  // 再挑戦ボタンでは計測を開始しない。
  // 課題文をスタート前の状態に戻し、開始は通常のスタートボタンまたはEscキーに任せる。
  closeResultScreenForNextPractice();
}

function restartRandomText() {
  gameState.texts.selectionMode = 'random';
  // ランダム課題を先に表示するだけで、計測は開始しない。
  // いきなりカウントダウンや計測が始まらないようにする。
  applyRandomTextForStart();
  closeResultScreenForNextPractice();
}

function bindResultAction(button, action) {
  if (!button) return;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    button.blur();
  });
}


// 結果画面のショートカット。
// R: 同じ課題、N: ランダム課題、H: 設定へ戻る。
// 結果画面が表示されている時だけ有効にし、通常入力やIME操作とは衝突させない。
document.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const resultVisible = resultScreen && resultScreen.style.display === 'block';
  if (!resultVisible) return;

  const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (key === 'r') {
    e.preventDefault();
    restartSameText();
    return;
  }
  if (key === 'n') {
    e.preventDefault();
    restartRandomText();
    return;
  }
  if (key === 'h') {
    e.preventDefault();
    closeResultScreenForNextPractice();
  }
});

bindResultAction(btnRetry, restartSameText);
bindResultAction(btnRetryTop, restartSameText);
bindResultAction(btnRetryRandom, restartRandomText);
bindResultAction(btnRetryRandomTop, restartRandomText);
bindResultAction(btnBackConfig, closeResultScreenForNextPractice);
bindResultAction(btnBackConfigTop, closeResultScreenForNextPractice);

// === CPM 推移グラフ =========================================================
// 仕様:
//  - 横軸 = 経過秒数（0 〜 gameState.chart.cpmHistory の最後の time）
//  - 縦軸 = CPM（0 〜 最大値を切り上げたキリのいい数字までで自動スケール）
//  - グリッド、軸ラベル、折れ線、データ点ドットを描画
