// 開始・中断・入力イベント
// 元ファイル: js/app.js から機能別に分割

function startGame() {
  // 計測開始操作が入った時点で、詳細設定が開いていれば自動で閉じる。
  // ここに置くことで、開始ボタン・Escキー・練習モード・本番モードのすべてに効く。
  if (typeof closeAdvancedSettingsForMeasurement === 'function') closeAdvancedSettingsForMeasurement();

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
  if (typeof hideFinishOverlay === 'function') hideFinishOverlay();
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
  if (typeof playWhistleSound === 'function') playWhistleSound('start');

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
  if (typeof hideFinishOverlay === 'function') hideFinishOverlay();
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
        endGame({ reason: 'timeout' });
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
    if (!isCompleteMode() && gameState.session.remainSeconds <= 0) endGame({ reason: 'timeout' });
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

function formatSectionSeconds(value) {
  return Number.isFinite(value) ? `${Math.max(1, Math.round(value))}秒` : '—';
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
  const labels = ['序盤', '中盤', '終盤'];
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
    return { label, chars, correct, errors, cpm, seconds };
  });

  sections.forEach((sec, idx) => {
    cpmEls[idx].textContent = formatSectionCpm(sec.cpm);
    if (detailEls[idx]) detailEls[idx].textContent = `${sec.chars}文字中 正解${sec.correct}／ミス${sec.errors}／${formatSectionSeconds(sec.seconds)}`;
  });

  const valid = sections.filter(s => Number.isFinite(s.cpm));
  if (sectionAnalysisSummary && valid.length >= 2) {
    const fastest = valid.reduce((a, b) => (a.cpm >= b.cpm ? a : b));
    const slowest = valid.reduce((a, b) => (a.cpm <= b.cpm ? a : b));
    const mostErrors = sections.reduce((a, b) => (a.errors >= b.errors ? a : b));
    const gap = Math.round(fastest.cpm - slowest.cpm);
    const stability = gap <= 30 ? '速度差は小さく、全体として安定しています。' : `最大で約${gap}CPMの差があります。`;
    sectionAnalysisSummary.textContent = `${fastest.label}が最も速く、${slowest.label}が最もゆっくりです。${stability} ミスは${mostErrors.label}に最も多く出ています。各区間のCPMは、正解文字数と到達時刻から概算しています。`;
  }
  return sections;
}


function renderTypingTrait(resultMetrics, sections, finalInput = '') {
  if (!typingTraitName || !typingTraitComment) return;

  const cpm = Number(resultMetrics && resultMetrics.cpm) || 0;
  const accuracy = Number(resultMetrics && resultMetrics.accuracy) || 0;
  const errorTotal = Number(resultMetrics && resultMetrics.errorTotal) || 0;
  const inputChars = Math.max(1, Number(resultMetrics && resultMetrics.inputChars) || 1);
  const backspace = Number(resultMetrics && resultMetrics.backspace) || 0;
  const backspaceRate = backspace / inputChars;
  const validSections = (Array.isArray(sections) ? sections : []).filter(sec => Number.isFinite(sec.cpm));
  const cpmValues = validSections.map(sec => sec.cpm);
  const maxCpm = cpmValues.length ? Math.max(...cpmValues) : cpm;
  const minCpm = cpmValues.length ? Math.min(...cpmValues) : cpm;
  const gap = Math.max(0, Math.round(maxCpm - minCpm));
  const avgSectionCpm = cpmValues.length ? cpmValues.reduce((sum, value) => sum + value, 0) / cpmValues.length : cpm;
  const gapRate = avgSectionCpm > 0 ? gap / avgSectionCpm : 0;

  // 第2段階では、文章の前半・後半構成に影響されやすい
  // 「序盤加速型」「後半安定型」は使わず、全体の入力傾向だけで判定する。
  let type = '安定型';
  let comment = '入力速度の波が比較的小さく、全体として安定したタイピングができています。';
  const tags = [];

  if (backspaceRate >= 0.06 && accuracy >= 95) {
    type = '修正依存型';
    comment = '細かく修正しながら、正確に入力する傾向があります。正確性を保てていますが、修正回数が速度を抑えている可能性があります。';
  } else if (backspaceRate <= 0.015 && cpm >= 300 && accuracy < 96) {
    type = '押し切り型';
    comment = '修正よりも入力の勢いを優先する傾向があります。高速入力に強みがありますが、正確率を少し上げると総合記録が伸びやすくなります。';
  } else if (accuracy >= 98 && cpm < 360 && backspaceRate < 0.05) {
    type = '慎重型';
    comment = '正確性を重視した入力傾向があります。丁寧に打てているため、リズムを保ったまま少しずつ速度を上げると伸びやすいです。';
  } else if (gapRate >= 0.28 || gap >= 90) {
    type = '爆発型';
    comment = '瞬間的に高い速度を出せるタイプです。速い区間の感覚を保てると、平均CPMの底上げにつながります。';
  } else if (accuracy >= 96 && gapRate < 0.22) {
    type = '安定型';
    comment = '速度と正確さのバランスが取れており、長文でも大きく崩れにくい傾向があります。';
  }

  if (accuracy >= 98) tags.push('高精度');
  if (backspaceRate >= 0.06) tags.push(`修正多め 約${Math.round(backspaceRate * 100)}%`);
  if (backspaceRate <= 0.015 && inputChars >= 100) tags.push('修正少なめ');
  if (gap >= 60) tags.push(`速度差 約${gap}CPM`);
  if (errorTotal >= 8 && accuracy < 96) tags.push('正確率に改善余地');

  const target = (typeof computeEffectiveTarget === 'function')
    ? computeEffectiveTarget(gameState.texts.currentText || '', finalInput || '')
    : String(gameState.texts.currentText || '').slice(0, String(finalInput || '').length);
  const classified = (target && finalInput && typeof classifyErrors === 'function')
    ? classifyErrors(target, finalInput)
    : null;
  const errorPositions = [];
  if (classified && classified.lists) {
    ['misuse', 'missing', 'extra'].forEach(key => {
      (classified.lists[key] || []).forEach(item => {
        if (Number.isFinite(item.pos)) errorPositions.push(Math.max(0, item.pos - 1));
      });
    });
    (classified.lists.spacing || []).forEach(item => {
      if (Number.isFinite(item.pos)) errorPositions.push(Math.max(0, item.pos - 1));
    });
    (classified.lists.widthPunct || []).forEach(item => {
      if (Number.isFinite(item.pos)) errorPositions.push(Math.max(0, item.pos - 1));
    });
  }

  const countNear = (pattern) => errorPositions.reduce((count, pos) => {
    const from = Math.max(0, pos - 1);
    const to = Math.min(target.length, pos + 2);
    return count + (pattern.test(target.slice(from, to)) ? 1 : 0);
  }, 0);
  const digitErrors = countNear(/[０-９0-9]/);
  const symbolErrors = countNear(/[、。,.，．・？！!?「」『』（）()［］\[\]【】〈〉《》…ー―\-／\/：:；;]/);

  if (digitErrors >= 2) tags.push('数字注意傾向');
  if (symbolErrors >= 2) tags.push('記号注意傾向');
  if (!tags.length) tags.push('大きな偏りは少なめ');

  typingTraitName.textContent = type;
  typingTraitComment.textContent = comment;
  if (typingTraitTags) {
    typingTraitTags.innerHTML = tags.map(tag => `<span>${escapeHtml(String(tag))}</span>`).join('');
  }
}


function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function gradeFromLongDiagnosisScore(score) {
  const value = clampNumber(score, 0, 100);
  if (value >= 90) return 'S';
  if (value >= 75) return 'A';
  if (value >= 60) return 'B';
  if (value >= 45) return 'C';
  return 'D';
}

function scoreAccuracyForLongDiagnosis(accuracy) {
  const value = Number(accuracy) || 0;
  if (value >= 99) return 100;
  if (value >= 98) return 92;
  if (value >= 96) return 82;
  if (value >= 93) return 68;
  if (value >= 88) return 52;
  return 35;
}

function countErrorsNearPattern(errorPositions, target, pattern) {
  if (!Array.isArray(errorPositions) || !target) return 0;
  return errorPositions.reduce((count, pos) => {
    const from = Math.max(0, pos - 1);
    const to = Math.min(target.length, pos + 2);
    return count + (pattern.test(target.slice(from, to)) ? 1 : 0);
  }, 0);
}

function buildErrorPositionsForDiagnosis(target, finalInput) {
  const positions = [];
  if (!target || !finalInput || typeof classifyErrors !== 'function') return positions;
  const classified = classifyErrors(target, finalInput);
  if (!classified || !classified.lists) return positions;
  ['misuse', 'missing', 'extra', 'spacing', 'widthPunct'].forEach(key => {
    (classified.lists[key] || []).forEach(item => {
      if (Number.isFinite(item.pos)) positions.push(Math.max(0, item.pos - 1));
    });
  });
  return positions;
}

function analyzeRecoveryForLongDiagnosis(errorTotal) {
  const history = (gameState.chart && Array.isArray(gameState.chart.cpmHistory)) ? gameState.chart.cpmHistory : [];
  if (!history.length || errorTotal < 2) {
    return { status: 'insufficient', label: '復帰力分析は行いません', detail: 'ミスが少ないため、ミス後の立て直しは今回の診断対象にしていません。' };
  }

  let firstMissIndex = -1;
  for (let i = 1; i < history.length; i++) {
    const prevMiss = Number(history[i - 1].miss || 0);
    const curMiss = Number(history[i].miss || 0);
    if (curMiss > prevMiss) {
      firstMissIndex = i;
      break;
    }
  }

  if (firstMissIndex < 0 || firstMissIndex >= history.length - 2) {
    return { status: 'insufficient', label: '復帰力分析は参考外', detail: 'ミス後の入力推移が短いため、今回は参考外です。' };
  }

  const before = history.slice(Math.max(0, firstMissIndex - 3), firstMissIndex)
    .map(point => Number(point.instantCpm || point.cpm || 0))
    .filter(value => Number.isFinite(value) && value > 0);
  const after = history.slice(firstMissIndex + 1, Math.min(history.length, firstMissIndex + 4))
    .map(point => Number(point.instantCpm || point.cpm || 0))
    .filter(value => Number.isFinite(value) && value > 0);

  if (!before.length || !after.length) {
    return { status: 'insufficient', label: '復帰力分析は参考外', detail: 'ミス前後の速度比較に必要な記録が足りません。' };
  }

  const beforeAvg = before.reduce((sum, value) => sum + value, 0) / before.length;
  const afterAvg = after.reduce((sum, value) => sum + value, 0) / after.length;
  const ratio = beforeAvg > 0 ? afterAvg / beforeAvg : 1;
  if (ratio >= 0.85) {
    return { status: 'good', label: '復帰は速め', detail: `ミス後も大きく失速せず、直前速度の約${Math.round(ratio * 100)}%を維持しています。` };
  }
  return { status: 'watch', label: 'ミス後の立て直しに注意', detail: `ミス後に速度低下が見られます。直前速度の約${Math.round(ratio * 100)}%です。` };
}


function renderLongDiagnosisTakeaways(items, hasEnoughSpecials) {
  if (typeof longDiagnosisTakeaways === 'undefined' || !longDiagnosisTakeaways) return;
  const safe = (value) => (typeof escapeHtml === 'function' ? escapeHtml(String(value)) : String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  if (!sorted.length) {
    longDiagnosisTakeaways.innerHTML = '';
    return;
  }

  const strength = sorted.find(item => item.grade === 'S' || item.grade === 'A') || sorted[0];
  const weakCandidates = sorted.filter(item => item.grade === 'C' || item.grade === 'D');
  const focus = weakCandidates.length ? weakCandidates[weakCandidates.length - 1] : sorted[sorted.length - 1];
  const balanceGap = Number(sorted[0].score || 0) - Number(sorted[sorted.length - 1].score || 0);
  const balanceText = balanceGap < 12
    ? '４軸の差が小さく、全体のバランスは比較的安定しています。'
    : `${focus.title}は今回の相対的な伸ばしどころです。`;
  const referenceText = hasEnoughSpecials
    ? '適応力は数字・記号を含む箇所も見て判定しています。'
    : '数字・記号が少ない課題のため、適応力は参考評価です。';

  longDiagnosisTakeaways.innerHTML = `
    <div class="long-diagnosis-takeaway"><span>強み</span><strong>${safe(strength.title)}</strong></div>
    <div class="long-diagnosis-takeaway"><span>確認点</span><strong>${safe(balanceText)}</strong></div>
    <div class="long-diagnosis-takeaway"><span>読み方</span><strong>総合ランクではなく、長文入力技能の４軸診断として見ます。${safe(referenceText)}</strong></div>
  `;
}

function renderLongDiagnosisSupport(analysis) {
  if (!longDiagnosisSupport) return;
  const safe = (value) => (typeof escapeHtml === 'function' ? escapeHtml(String(value)) : String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
  const notes = [];
  const metrics = analysis && analysis.metrics ? analysis.metrics : {};
  const inputChars = Number(metrics.inputChars || 0);
  const accuracy = Number(metrics.accuracy || 0);
  const cpm = Number(metrics.cpm || 0);
  const backspace = Number(metrics.backspace || 0);
  const errorTotal = Number(metrics.errorTotal || 0);
  const backspaceRate = inputChars > 0 ? backspace / inputChars : 0;

  if (inputChars < 80) {
    notes.push({ title: '補助分析は参考程度', text: '入力文字数が少ないため、癖の判定は控えめに見てください。' });
  }

  if (backspaceRate >= 0.06 && accuracy >= 95) {
    notes.push({ title: '修正依存傾向', text: `Backspaceが入力文字数の約${Math.round(backspaceRate * 100)}%あります。細かく直しながら正確性を保つ傾向です。` });
  } else if (backspaceRate <= 0.015 && errorTotal >= 5 && cpm >= 60) {
    notes.push({ title: '押し切り傾向', text: '修正回数が少ない一方でエラーが残っています。速度優先で進める傾向があります。' });
  }

  const digitCount = Number(analysis.digitCount || 0);
  const symbolCount = Number(analysis.symbolCount || 0);
  const digitErrors = Number(analysis.digitErrors || 0);
  const symbolErrors = Number(analysis.symbolErrors || 0);
  if (digitCount >= 3 && digitErrors >= 2) {
    notes.push({ title: '数字注意傾向', text: `数字周辺で${digitErrors}件のミスが見られます。数字を含む文ではリズムが崩れやすい可能性があります。` });
  }
  if (symbolCount >= 3 && symbolErrors >= 2) {
    notes.push({ title: '記号注意傾向', text: `記号周辺で${symbolErrors}件のミスが見られます。句読点や括弧の前後で確認が必要です。` });
  }

  const recovery = analyzeRecoveryForLongDiagnosis(errorTotal);
  notes.push({ title: recovery.label, text: recovery.detail });

  if (!notes.length) {
    notes.push({ title: '補助分析', text: '今回の結果では、特に大きな癖は検出されませんでした。' });
  }

  longDiagnosisSupport.innerHTML = `
    <details class="long-diagnosis-support-details">
      <summary>
        <span class="long-diagnosis-support-title">補助分析</span>
        <small>${notes.length}件の補足</small>
      </summary>
      <ul>
        ${notes.map(note => `<li><strong>${safe(note.title)}</strong><span>${safe(note.text)}</span></li>`).join('')}
      </ul>
    </details>
  `;
}

function renderLongInputDiagnosis(resultMetrics, sections, finalInput = '') {
  if (!longDiagnosisList || !longDiagnosisComment) return;

  const accuracy = Number(resultMetrics && resultMetrics.accuracy) || 0;
  const cpm = Number(resultMetrics && resultMetrics.cpm) || 0;
  const validSections = (Array.isArray(sections) ? sections : []).filter(sec => Number.isFinite(sec.cpm));
  const cpmValues = validSections.map(sec => sec.cpm);
  const maxCpm = cpmValues.length ? Math.max(...cpmValues) : cpm;
  const minCpm = cpmValues.length ? Math.min(...cpmValues) : cpm;
  const avgSectionCpm = cpmValues.length ? cpmValues.reduce((sum, value) => sum + value, 0) / cpmValues.length : maxCpm;
  const gap = Math.max(0, maxCpm - minCpm);
  const gapRate = avgSectionCpm > 0 ? gap / avgSectionCpm : 0;

  const stabilityScore = clampNumber(100 - (gapRate * 155) - Math.max(0, gap - 35) * 0.15, 20, 100);
  const accuracyScore = scoreAccuracyForLongDiagnosis(accuracy);

  const early = validSections.find(sec => sec.label === '序盤');
  const middle = validSections.find(sec => sec.label === '中盤');
  const late = validSections.find(sec => sec.label === '終盤');
  const baseCpm = [early, middle].filter(sec => sec && Number.isFinite(sec.cpm)).map(sec => sec.cpm);
  const beforeLate = baseCpm.length ? baseCpm.reduce((sum, value) => sum + value, 0) / baseCpm.length : avgSectionCpm;
  const lateRatio = (late && Number.isFinite(late.cpm) && beforeLate > 0) ? late.cpm / beforeLate : 1;
  const lateErrorPenalty = late && Number.isFinite(late.errors) ? Math.min(18, late.errors * 2) : 0;
  const continuityScore = clampNumber(70 + ((lateRatio - 0.85) * 110) - lateErrorPenalty, 20, 100);

  const target = (typeof computeEffectiveTarget === 'function')
    ? computeEffectiveTarget(gameState.texts.currentText || '', finalInput || '')
    : String(gameState.texts.currentText || '').slice(0, String(finalInput || '').length);
  const digitPattern = /[０-９0-9]/g;
  const symbolPattern = /[、。,.，．・？！!?「」『』（）()［］\[\]【】〈〉《》…ー―\-／\/：:；;]/g;
  const digitCount = (target.match(digitPattern) || []).length;
  const symbolCount = (target.match(symbolPattern) || []).length;
  const specialCount = digitCount + symbolCount;
  const errorPositions = buildErrorPositionsForDiagnosis(target, finalInput);
  const digitErrors = countErrorsNearPattern(errorPositions, target, /[０-９0-9]/);
  const symbolErrors = countErrorsNearPattern(errorPositions, target, /[、。,.，．・？！!?「」『』（）()［］\[\]【】〈〉《》…ー―\-／\/：:；;]/);
  const specialErrors = digitErrors + symbolErrors;
  const hasEnoughSpecials = specialCount >= 4;
  const specialErrorRate = hasEnoughSpecials ? specialErrors / specialCount : 0;
  const adaptabilityScore = hasEnoughSpecials
    ? clampNumber(95 - (specialErrorRate * 260) - Math.max(0, gapRate - 0.25) * 55, 20, 100)
    : clampNumber((accuracyScore * 0.65) + (stabilityScore * 0.35), 35, 92);

  const formatRatio = (value) => `${Math.round(value * 100)}%`;
  const formatCpmValue = (value) => Number.isFinite(value) ? `${Math.round(value)}CPM` : '—';
  const formatAccuracy = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';

  const items = [
    {
      title: '安定性',
      grade: gradeFromLongDiagnosisScore(stabilityScore),
      score: stabilityScore,
      detail: gapRate < 0.18 ? '速度の波が小さく、一定のリズムを保てています。' : '区間ごとの速度差があり、リズムに波が見られます。',
      reason: `区間CPM差 ${formatCpmValue(gap)}／平均比 ${formatRatio(gapRate)}`
    },
    {
      title: '正確性',
      grade: gradeFromLongDiagnosisScore(accuracyScore),
      score: accuracyScore,
      detail: accuracy >= 98 ? 'ミスをかなり抑えて入力できています。' : '正確率を上げると、長文全体の安定感が高まります。',
      reason: `正確率 ${formatAccuracy(accuracy)}`
    },
    {
      title: '継続性',
      grade: gradeFromLongDiagnosisScore(continuityScore),
      score: continuityScore,
      detail: lateRatio >= 0.95 ? '終盤でも大きく崩れず入力できています。' : '終盤でやや速度低下が見られます。',
      reason: `終盤CPMは前半〜中盤平均の ${formatRatio(lateRatio)}`
    },
    {
      title: '適応力',
      grade: gradeFromLongDiagnosisScore(adaptabilityScore),
      score: adaptabilityScore,
      detail: hasEnoughSpecials
        ? (specialErrors <= 1 ? '数字・記号を含む箇所でも大きな乱れは少なめです。' : '数字・記号付近でミスやリズムの乱れが見られます。')
        : '数字・記号が少ない課題のため、今回は参考評価です。',
      reason: hasEnoughSpecials
        ? `数字・記号 ${specialCount}か所中、周辺ミス ${specialErrors}件`
        : `数字・記号 ${specialCount}か所のため参考`
    }
  ];

  const safe = (value) => (typeof escapeHtml === 'function' ? escapeHtml(String(value)) : String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
  longDiagnosisList.innerHTML = items.map(item => `
    <div class="long-diagnosis-item">
      <div class="long-diagnosis-head">
        <span class="long-diagnosis-title">${safe(item.title)}</span>
        <strong class="long-diagnosis-grade">${safe(item.grade)}</strong>
      </div>
      <p class="long-diagnosis-detail">${safe(item.detail)}</p>
      <p class="long-diagnosis-reason"><span>根拠</span>${safe(item.reason)}</p>
    </div>
  `).join('');

  renderLongDiagnosisTakeaways(items, hasEnoughSpecials);

  const sorted = [...items].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const strong = items.filter(item => item.grade === 'S' || item.grade === 'A').map(item => item.title);
  const weak = items.filter(item => item.grade === 'C' || item.grade === 'D').map(item => item.title);

  let summary = '';
  if (strongest && weakest && strongest.title !== weakest.title) {
    summary = `総合所見：今回は${strongest.title}が最も強く出ています。`;
    if (weak.length) {
      summary += `${weakest.title}は相対的に伸ばしどころです。`;
    } else {
      summary += `大きな弱点は出ておらず、長文入力に必要な基礎技能は安定しています。`;
    }
  } else {
    summary = '総合所見：全体として大きな偏りは少なく、各軸のバランスを確認できる結果です。';
  }

  if (!hasEnoughSpecials) {
    summary += ' なお、数字・記号が少ない課題のため、適応力は参考評価です。';
  }

  if (weak.length) {
    const strengthText = strong.length ? `${strong.join('・')}が強みです。` : '';
    longDiagnosisComment.textContent = `${summary} ${strengthText}${weak.join('・')}に改善余地があります。`;
  } else if (strong.length) {
    longDiagnosisComment.textContent = `${summary} 特に${strong.join('・')}が強みです。`;
  } else {
    longDiagnosisComment.textContent = summary;
  }

  renderLongDiagnosisSupport({
    metrics: resultMetrics,
    digitCount,
    symbolCount,
    digitErrors,
    symbolErrors,
    specialCount,
    specialErrors,
    hasEnoughSpecials
  });
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


function getShareSiteUrl() {
  const canonicalUrl = 'https://article-typing.pages.dev/';
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
  if (isLocal) return canonicalUrl;
  return `${location.origin}${location.pathname}`;
}

function buildXShareText(resultMetrics) {
  const title = gameState.texts.currentTitle || '長文課題';
  const condition = isCompleteMode() ? '全文打ち切り' : (resCondition ? resCondition.textContent.replace('終了条件：', '') : '計測');
  const lines = [
    '長文タイピング結果',
    '',
    `課題：${title}`,
    `条件：${condition}`,
    `CPM：${resultMetrics.cpm}`,
    `正確率：${resultMetrics.accuracy}%`,
    `入力文字数：${resultMetrics.inputChars}`,
    `純字数：${resultMetrics.correct}`,
    `エラー：${resultMetrics.errorTotal}`,
    '',
    getShareSiteUrl(),
    '',
    '#長文タイピング #タイピング'
  ];
  return lines.join('\n');
}

function updateXShareButton(resultMetrics) {
  if (!btnShareX) return;
  const canShare = Boolean(resultMetrics && (resultMetrics.isCompleted || resultMetrics.isTimeoutFinish));
  btnShareX.hidden = !canShare;
  btnShareX.disabled = !canShare;
  if (resultActionNote) {
    resultActionNote.textContent = canShare
      ? '全文打ち切り、または制限時間終了による正規終了の結果です。結果をXに投稿できます。R／N／Hキーでも操作できます。'
      : '成績を確認したあと、すぐ次の練習へ移れます。R／N／Hキーでも操作できます。結果のX投稿は、全文打ち切りまたは制限時間終了時のみ表示されます。';
  }
  if (!canShare) {
    btnShareX.removeAttribute('data-share-text');
    return;
  }
  btnShareX.setAttribute('data-share-text', buildXShareText(resultMetrics));
}

function openXShareWindow() {
  if (!btnShareX || btnShareX.disabled) return;
  const text = btnShareX.getAttribute('data-share-text') || '';
  if (!text) return;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer,width=720,height=640');
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


function discardPendingImeCompositionForTimeout() {
  // 制限時間が0になった瞬間にIMEの未確定文字が残っていると、
  // textarea.value には入っているのに、利用者としてはまだ「確定入力」していない文字まで
  // 採点対象になってしまう。タイムアップ時だけ、compositionstart 時点の入力値へ戻して
  // 未確定部分を除外してから採点する。
  if (!isComposing) return typingArea.value;

  const before = typeof imeCompositionBaseValue === 'string' ? imeCompositionBaseValue : typingArea.value;
  typingArea.value = before;
  isComposing = false;
  imeCompositionBaseValue = '';
  imeCompositionStart = 0;
  imeCompositionEnd = 0;
  return typingArea.value;
}

function endGame(options = {}) {
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
  const isTimeoutFinish = options && options.reason === 'timeout';
  if (isTimeoutFinish) {
    if (typeof playWhistleSound === 'function') playWhistleSound('finish');
    if (typeof showFinishOverlay === 'function') showFinishOverlay();
  } else if (typeof hideFinishOverlay === 'function') {
    hideFinishOverlay();
  }

  // 終了ボタン直後やIME確定直後でも、最後の入力内容で必ず再集計する。
  // これにより、結果画面の基本数値と詳細採点の入力範囲がずれない。
  // ただしタイムアップ時にIMEの未確定文字が残っている場合は、未確定部分を採点対象から外す。
  const finalInput = isTimeoutFinish ? discardPendingImeCompositionForTimeout() : typingArea.value;
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
    isCompleted,
    isTimeoutFinish
  };
  updateXShareButton(resultMetrics);
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
  const sectionResult = renderSectionAnalysis(finalInput, elapsed);
  renderTypingTrait(resultMetrics, sectionResult, finalInput);
  renderLongInputDiagnosis(resultMetrics, sectionResult, finalInput);

  const showResultScreen = () => {
    if (typeof hideFinishOverlay === 'function') hideFinishOverlay();
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
  };

  if (isTimeoutFinish) {
    setTimeout(showResultScreen, 2000);
  } else {
    showResultScreen();
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
let imeCompositionBaseValue = '';
let imeCompositionStart = 0;
let imeCompositionEnd = 0;

typingArea.addEventListener('compositionstart', () => {
  isComposing = true;
  imeCompositionBaseValue = typingArea.value;
  imeCompositionStart = typeof typingArea.selectionStart === 'number' ? typingArea.selectionStart : typingArea.value.length;
  imeCompositionEnd = typeof typingArea.selectionEnd === 'number' ? typingArea.selectionEnd : imeCompositionStart;
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
  imeCompositionBaseValue = '';
  imeCompositionStart = 0;
  imeCompositionEnd = 0;
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
  if (typeof hideFinishOverlay === 'function') hideFinishOverlay();
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

  const activeElement = document.activeElement;
  const activeTagName = activeElement && activeElement.tagName ? activeElement.tagName.toUpperCase() : '';
  const isInteractiveFocus = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(activeTagName)
    || !!(activeElement && activeElement.isContentEditable);
  if (isInteractiveFocus) return;

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
bindResultAction(btnShareX, openXShareWindow);

// === CPM 推移グラフ =========================================================
// 仕様:
//  - 横軸 = 経過秒数（0 〜 gameState.chart.cpmHistory の最後の time）
//  - 縦軸 = CPM（0 〜 最大値を切り上げたキリのいい数字までで自動スケール）
//  - グリッド、軸ラベル、折れ線、データ点ドットを描画
