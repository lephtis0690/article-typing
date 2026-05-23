// 表示欄・タイマー表示・UI補助
// 元ファイル: js/app.js から機能別に分割

function setConfigControlsDisabled(disabled) {
  timeSelect.disabled = disabled;
  startModeSelect.disabled = disabled;
  if (displayPresetModeSelect) displayPresetModeSelect.disabled = disabled;
  if (manualDetailModeCheckbox) manualDetailModeCheckbox.disabled = disabled;
  if (feedbackModeSelect) feedbackModeSelect.disabled = disabled;
  if (correctFeedbackModeSelect) correctFeedbackModeSelect.disabled = disabled;
  if (liveStatusModeSelect) liveStatusModeSelect.disabled = disabled;
  if (themeModeSelect) themeModeSelect.disabled = disabled;
  if (focusDisplayModeCheckbox) focusDisplayModeCheckbox.disabled = disabled;
  if (accessibilityModeSelect) accessibilityModeSelect.disabled = disabled;
  if (typingPositionModeSelect) typingPositionModeSelect.disabled = disabled;
  if (timeCallModeSelect) timeCallModeSelect.disabled = disabled;
  if (disqualifyLimitSelect) disqualifyLimitSelect.disabled = disabled;
  if (btnConfigToggle) btnConfigToggle.disabled = disabled;
  // 計測中・カウントダウン中は課題一覧を開けないようにする（課題切替の事故防止）。
  const btnLibrary = document.getElementById('btn-text-library');
  if (btnLibrary) btnLibrary.disabled = disabled;
  if (btnOpenRecordsHome) btnOpenRecordsHome.disabled = disabled;
  if (!disabled && typeof applyDisplayPresetMode === 'function') {
    applyDisplayPresetMode();
  }
}

function setAdvancedSettingsOpen(open) {
  if (!advancedSettings || !btnConfigToggle) return;
  advancedSettings.classList.toggle('is-collapsed', !open);
  btnConfigToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  btnConfigToggle.textContent = open ? '詳細設定 ▴' : '詳細設定 ▾';
}


function lineNumberAt(text, index) {
  let line = 0;
  const end = Math.max(0, Math.min(index, text.length));
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}


function isCompleteMode() {
  return timeSelect && timeSelect.value === 'complete';
}

function formatSeconds(sec) {
  const r = Math.max(0, Math.floor(sec));
  const m = Math.floor(r / 60);
  const s = r % 60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function resetTypingAreaForIdle() {
  if (!typingArea) return;
  // ブラウザのフォーム復元や課題切替直後の副作用で、
  // 表示用の課題タイトルが入力欄に残ることがあるため、
  // 待機状態へ戻す処理では必ず入力欄を空にする。
  typingArea.value = '';
  typingArea.placeholder = 'Escで開始...';
}

function isLikelyTaskTitleLeak(value) {
  if (!value || !gameState || !gameState.texts) return false;
  const title = String(gameState.texts.currentTitle || '').trim();
  const raw = String(value);
  const trimmed = raw.trim();
  if (!title || !trimmed) return false;
  const titleLabel = `// 課題文 — ${title}`;
  return trimmed === title
    || trimmed === titleLabel
    || trimmed === `課題文：${title}`
    || trimmed === `課題文: ${title}`
    || (trimmed.startsWith('// 課題文') && trimmed.includes(title));
}

function removeTaskTitleLeakFromTypingArea() {
  if (!typingArea) return false;
  if (!isLikelyTaskTitleLeak(typingArea.value)) return false;
  typingArea.value = '';
  typingArea.placeholder = 'Escで開始...';
  return true;
}

function initDisplay() {
  document.body.classList.remove('result-mode', 'records-mode');
  if (recordsScreen) recordsScreen.style.display = 'none';
  if (!gameState.session.running && !gameState.countdown.active) resetTypingAreaForIdle();
  if (taskTitle) taskTitle.textContent = `// 課題文 — ${gameState.texts.currentTitle}`;
  const completeMode = isCompleteMode();
  if (timerLabel) timerLabel.textContent = completeMode ? '経過' : 'TIME';
  if (completeMode) {
    timerDisplay.textContent = '0:00';
  } else {
    const secs = parseInt(timeSelect.value, 10) || 180;
    timerDisplay.textContent = formatSeconds(secs);
  }
  timerPill.classList.remove('danger');
  renderTextDisplay('');
  correctDisplay.textContent = '0';
  missDisplay.textContent = '0';
  cpmDisplay.textContent = '0';
  progressDisplay.textContent = '0%';
  progressBar.style.width = '0%';
  if (btnAbort) btnAbort.disabled = true;
}

timeSelect.addEventListener('change', () => { if (!gameState.session.running) initDisplay(); });

function renderTextDisplay(input, forceRevealErrors = false) {
  const target = gameState.texts.currentText;
  const showRealtimeMistakes = forceRevealErrors || !feedbackModeSelect || feedbackModeSelect.value === 'realtime';
  const showCorrectFeedback = forceRevealErrors || !correctFeedbackModeSelect || correctFeedbackModeSelect.value !== 'competition';
  const typedNeutralClass = showCorrectFeedback ? 'char-typed' : 'char-typed-neutral';
  const showTypingPosition = !forceRevealErrors && typingPositionModeSelect && typingPositionModeSelect.value === 'show';
  const currentLine = lineNumberAt(target, input.length);
  const nextLine = currentLine + 1;

  // 課題表示は固定文字数で強制改行せず、画面幅に合わせて自然に折り返す。
  // 右側の累積文字数欄は維持し、改行記号そのものは文字数に含めない。
  let html = '';

  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    const isNewline = ch === '\n';
    const disp = isNewline ? '&nbsp;' : escapeHtml(ch);
    const countAttr = isNewline ? ' data-countable="false"' : ' data-countable="true"';
    const lineClass = showTypingPosition
      ? (lineNumberAt(target, i) === currentLine ? ' char-current-line' : (lineNumberAt(target, i) === nextLine ? ' char-next-line' : ''))
      : '';

    if (i < input.length) {
      if (input[i] === ch) {
        html += `<span class="${typedNeutralClass}${lineClass}" data-index="${i + 1}"${countAttr}>${disp}</span>`;
      } else {
        const cls = forceRevealErrors ? 'char-result-error' : (showRealtimeMistakes ? 'char-wrong' : typedNeutralClass);
        html += `<span class="${cls}${lineClass}" data-index="${i + 1}"${countAttr}>${disp}</span>`;
      }
    } else if (i === input.length) {
      const cls = showTypingPosition ? `char-cursor${lineClass}` : 'char-untyped';
      html += `<span class="${cls}" data-index="${i + 1}" data-current-position="true"${countAttr}>${disp}</span>`;
    } else {
      html += `<span class="char-untyped${lineClass}" data-index="${i + 1}"${countAttr}>${disp}</span>`;
    }

    if (isNewline) {
      html += '<br>';
    }
  }
  textDisplay.innerHTML = `<div class="text-scroll-inner"><div id="text-content">${html}</div><div id="line-counts" aria-hidden="true"></div></div>`;

  // 文字を描画した後で、実際に画面上で折り返された各行を調べ、右側に累積文字数を表示する。
  requestAnimationFrame(rebuildLineCounters);

  // 入力が空（初期表示・リセット・ゲーム開始直後）は必ず一番上から見せる。
  // 入力が始まってから初めて、必要なときだけスクロール判定する。
  if (input.length === 0) {
    textDisplay.scrollTop = 0;
  } else {
    requestAnimationFrame(scrollToCursor);
  }
}

function rebuildLineCounters() {
  const content = document.getElementById('text-content');
  const counts = document.getElementById('line-counts');
  if (!content || !counts) return;

  const chars = Array.from(content.querySelectorAll('[data-index]'));
  const lines = [];

  chars.forEach(span => {
    // 改行記号そのものは右側の文字数に含めない。
    if (span.dataset.countable === 'false') return;
    const top = Math.round(span.offsetTop);
    let line = lines.find(item => Math.abs(item.top - top) <= 2);
    if (!line) {
      line = { top, count: 0 };
      lines.push(line);
    }
    line.count += 1;
  });

  lines.sort((a, b) => a.top - b.top);
  let cumulative = 0;
  counts.innerHTML = lines.map(line => {
    cumulative += line.count;
    return `<span class="line-count" style="top:${line.top}px">${cumulative}</span>`;
  }).join('');
}


let lineCounterResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(lineCounterResizeTimer);
  lineCounterResizeTimer = setTimeout(rebuildLineCounters, 120);
});

function scrollToCursor() {
  const cursor = textDisplay.querySelector('[data-current-position="true"], .char-cursor');
  if (!cursor) return;

  const wrapH = textDisplay.clientHeight;
  const scrollTop = textDisplay.scrollTop;

  // offsetTop は offsetParent 基準になり、親要素の位置が混ざって
  // 冒頭1文字目でも「下にはみ出した」と誤判定することがある。
  // getBoundingClientRect() で textDisplay 内部での相対位置に直してから判定する。
  const displayRect = textDisplay.getBoundingClientRect();
  const cursorRect = cursor.getBoundingClientRect();
  const cursorTop = cursorRect.top - displayRect.top + scrollTop;
  const cursorBottom = cursorRect.bottom - displayRect.top + scrollTop;

  const viewTop = scrollTop;
  const viewBottom = scrollTop + wrapH;

  // 現在行だけでなく、次の行も見えるようにする。
  // line-height は CSS の実値を使い、取得できない場合はカーソルの高さから推定する。
  const computed = getComputedStyle(textDisplay);
  const parsedLineHeight = parseFloat(computed.lineHeight);
  const cursorHeight = Math.max(1, cursorRect.height);
  const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : cursorHeight * 2.1;

  // 「カーソルの下に次の1行分の余白」が残っていれば、次の行が見える。
  // ただし小さい画面で極端に余白を取りすぎないよう、表示欄の45%を上限にする。
  const nextLineMargin = Math.min(lineHeight * 1.25, wrapH * 0.45);
  const desiredBottom = cursorBottom + nextLineMargin;

  // カーソル行と次行が表示範囲に収まっているなら何もしない。
  if (cursorTop >= viewTop && desiredBottom <= viewBottom) {
    return;
  }
  // カーソルが下側に近づいた場合、次の行が見える位置まで最小限スクロールする。
  if (desiredBottom > viewBottom) {
    textDisplay.scrollTop = desiredBottom - wrapH;
    return;
  }
  // カーソルが上にはみ出した場合、カーソルが上端に来るよう戻す。
  if (cursorTop < viewTop) {
    textDisplay.scrollTop = cursorTop;
  }
}

function updateStats(input) {
  const target = gameState.texts.currentText;
  let correct = 0, miss = 0;
  const len = Math.min(input.length, target.length);
  for (let i = 0; i < len; i++) {
    if (input[i] === target[i]) correct++;
    else miss++;
  }
  if (input.length > target.length) miss += input.length - target.length;
  gameState.session.correctCount = correct;
  gameState.session.missCount = miss;
  const elapsed = Math.max(1, (Date.now() - gameState.session.startTime) / 1000);
  const cpm = Math.round((correct / elapsed) * 60);
  const pct = Math.round((input.length / target.length) * 100);
  correctDisplay.textContent = correct;
  missDisplay.textContent = miss;
  cpmDisplay.textContent = cpm;
  progressDisplay.textContent = `${Math.min(pct, 100)}%`;
  progressBar.style.width = `${Math.min(pct, 100)}%`;
}

function hideTimeCall() {
  if (gameState.timer.timeCallTimer) {
    clearTimeout(gameState.timer.timeCallTimer);
    gameState.timer.timeCallTimer = null;
  }
  if (timeCall) {
    timeCall.classList.remove('active');
    timeCall.setAttribute('aria-hidden', 'true');
  }
}

function showTimeCall(message) {
  if (!timeCall || !timeCallModeSelect || timeCallModeSelect.value === 'hide') return;
  timeCall.textContent = message;
  timeCall.classList.remove('active');
  void timeCall.offsetWidth;
  timeCall.classList.add('active');
  timeCall.setAttribute('aria-hidden', 'false');
  if (gameState.timer.timeCallTimer) clearTimeout(gameState.timer.timeCallTimer);
  gameState.timer.timeCallTimer = setTimeout(() => {
    if (timeCall) {
      timeCall.classList.remove('active');
      timeCall.setAttribute('aria-hidden', 'true');
    }
    gameState.timer.timeCallTimer = null;
  }, 3500);
}

function updateTimer() {
  if (isCompleteMode()) {
    const elapsed = gameState.session.startTime ? (Date.now() - gameState.session.startTime) / 1000 : 0;
    if (timerLabel) timerLabel.textContent = '経過';
    timerDisplay.textContent = formatSeconds(elapsed);
    timerPill.classList.remove('danger');
    return;
  }
  const r = Math.max(0, gameState.session.remainSeconds);
  if (timerLabel) timerLabel.textContent = 'TIME';
  timerDisplay.textContent = formatSeconds(r);
  if (r <= 10) timerPill.classList.add('danger');
  else timerPill.classList.remove('danger');
}

