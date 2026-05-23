// CPMグラフ描画
// 元ファイル: js/app.js から機能別に分割

function drawCPMChart(hoverIndex = -1, limitIndex = null) {
  const canvas = cpmChart;
  if (!canvas || !gameState.chart.cpmHistory || gameState.chart.cpmHistory.length === 0) return;
  const fullHistory = gameState.chart.cpmHistory;
  const endIndex = Number.isInteger(limitIndex) ? Math.max(0, Math.min(limitIndex, fullHistory.length - 1)) : fullHistory.length - 1;
  const visibleHistory = fullHistory.slice(0, endIndex + 1);

  // CSS 上のサイズ（px）と DPR を取り、内部バッファを高解像度に。
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW === 0 || cssH === 0) return; // 非表示中などのガード
  canvas.width  = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 以降の描画は CSS 座標で書ける
  ctx.clearRect(0, 0, cssW, cssH);
  gameState.chart.points = [];

  // テーマ色（:root の CSS 変数から取得して、テーマ変更にも追従させる）
  const styles = getComputedStyle(document.body);
  const colAccent  = styles.getPropertyValue('--accent').trim()   || '#4fd1c5';
  const colAccent2 = styles.getPropertyValue('--accent2').trim()  || '#f6ad55';
  const colBorder  = styles.getPropertyValue('--border').trim()   || '#2a3045';
  const colDim     = styles.getPropertyValue('--text-dim').trim() || '#718096';

  // 描画領域の余白（軸ラベルのスペース）
  const padL = 44; // 左: Y 軸ラベル
  const padR = 14;
  const padT = 12;
  const padB = 28; // 下: X 軸ラベル
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  if (plotW <= 0 || plotH <= 0) return;

  // データの範囲
  const maxTime = Math.max(1, fullHistory[fullHistory.length - 1].time);
  const rawMaxCpm = fullHistory.reduce((m, p) => Math.max(m, p.cpm), 0);
  // 縦軸の上端は、最大値より少し上のキリのいい数字に切り上げる。
  // 例: 最大 173 なら 200、最大 38 なら 50、最大 0 なら 60。
  const niceMax = niceCeil(rawMaxCpm > 0 ? rawMaxCpm * 1.1 : 60);

  // 座標変換
  const xOf = (t) => padL + (t / maxTime) * plotW;
  const yOf = (c) => padT + plotH - (c / niceMax) * plotH;

  // ホバー判定用に、各データ点の canvas 上の座標を保存しておく。
  gameState.chart.points = fullHistory.map((p, index) => ({
    index,
    time: p.time,
    avgCpm: p.cpm,
    instantCpm: typeof p.instantCpm === 'number' ? p.instantCpm : p.cpm,
    miss: typeof p.miss === 'number' ? p.miss : 0,
    x: xOf(p.time),
    y: yOf(p.cpm)
  }));

  // --- グリッド & 軸ラベル ---
  ctx.lineWidth = 1;
  ctx.font = '10px "Share Tech Mono", monospace';
  ctx.fillStyle = colDim;

  // 横グリッド（Y 方向、CPM のキリの良い目盛り）。5 等分。
  const ySteps = 5;
  ctx.strokeStyle = colBorder;
  for (let i = 0; i <= ySteps; i++) {
    const v = (niceMax / ySteps) * i;
    const y = yOf(v);
    ctx.globalAlpha = i === 0 ? 0.8 : 0.35; // 軸線(底辺)だけ濃く
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(v)), padL - 6, y);
  }

  // 縦グリッド（X 方向、経過秒数）。最大時間を見て妥当な間隔を選ぶ。
  const xStep = chooseTimeStep(maxTime);
  ctx.strokeStyle = colBorder;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let t = 0; t <= maxTime + 0.0001; t += xStep) {
    const x = xOf(t);
    ctx.globalAlpha = t === 0 ? 0.8 : 0.25;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(formatSec(t), x, padT + plotH + 6);
  }

  // 軸の左端線（縦軸）
  ctx.strokeStyle = colBorder;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // --- 平均CPMの補助線（最終平均値） ---
  const finalAvgCpm = gameState.chart.cpmHistory[gameState.chart.cpmHistory.length - 1]?.cpm || 0;
  if (finalAvgCpm > 0) {
    const avgY = yOf(finalAvgCpm);
    ctx.save();
    ctx.strokeStyle = colAccent2;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padL, avgY);
    ctx.lineTo(padL + plotW, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillStyle = colAccent2;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`AVG ${finalAvgCpm}`, padL + plotW - 4, avgY - 4);
    ctx.restore();
  }

  // --- 折れ線塗りつぶし（アクセントカラーのグラデで薄く） ---
  if (visibleHistory.length >= 2) {
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, hexToRgba(colAccent, 0.32));
    grad.addColorStop(1, hexToRgba(colAccent, 0.02));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xOf(visibleHistory[0].time), padT + plotH);
    visibleHistory.forEach(p => ctx.lineTo(xOf(p.time), yOf(p.cpm)));
    ctx.lineTo(xOf(visibleHistory[visibleHistory.length - 1].time), padT + plotH);
    ctx.closePath();
    ctx.fill();
  }

  // --- 折れ線本体 ---
  ctx.strokeStyle = colAccent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  visibleHistory.forEach((p, i) => {
    const x = xOf(p.time);
    const y = yOf(p.cpm);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // --- データ点ドット ---
  // 点が多すぎると団子になるので、5秒以上の計測のときは間引く。
  const dotEvery = visibleHistory.length > 60 ? Math.ceil(visibleHistory.length / 60) : 1;
  ctx.fillStyle = colAccent;
  visibleHistory.forEach((p, i) => {
    if (i % dotEvery !== 0 && i !== visibleHistory.length - 1) return;
    ctx.beginPath();
    ctx.arc(xOf(p.time), yOf(p.cpm), 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- 最終ポイントを強調 ---
  const last = visibleHistory[visibleHistory.length - 1];
  ctx.fillStyle = colAccent2;
  ctx.beginPath();
  ctx.arc(xOf(last.time), yOf(last.cpm), 3.5, 0, Math.PI * 2);
  ctx.fill();

  // --- ホバー中の点とツールチップ ---
  if (hoverIndex >= 0 && gameState.chart.points[hoverIndex]) {
    drawCPMTooltip(ctx, gameState.chart.points[hoverIndex], cssW, cssH, colAccent2, colBorder);
  }
}

// グラフの点にマウスポインタを重ねたときに表示するツールチップ。
// 瞬間CPM = 直前の記録点からその点までの1秒ごとの速度、平均CPM = 開始からその点までの平均速度。
function drawCPMTooltip(ctx, point, cssW, cssH, colAccent2, colBorder) {
  const lines = [
    `時刻: ${formatSec(point.time)}`,
    `瞬間CPM: ${point.instantCpm}`,
    `平均CPM: ${point.avgCpm}`
  ];
  ctx.save();

  ctx.font = '12px "Noto Sans JP", sans-serif';
  const paddingX = 10;
  const paddingY = 8;
  const lineH = 18;
  const boxW = Math.max(...lines.map(line => ctx.measureText(line).width)) + paddingX * 2;
  const boxH = lines.length * lineH + paddingY * 2;

  let boxX = point.x + 12;
  let boxY = point.y - boxH - 12;
  if (boxX + boxW > cssW - 4) boxX = point.x - boxW - 12;
  if (boxY < 4) boxY = point.y + 12;
  if (boxY + boxH > cssH - 4) boxY = cssH - boxH - 4;

  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--tooltip-bg').trim() || 'rgba(13, 15, 20, 0.92)';
  ctx.strokeStyle = colBorder;
  ctx.lineWidth = 1;
  roundRect(ctx, boxX, boxY, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();

  // 対象点を強調。
  ctx.fillStyle = colAccent2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--tooltip-text').trim() || '#e2e8f0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, boxX + paddingX, boxY + paddingY + i * lineH);
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function findNearestCPMPoint(clientX, clientY) {
  if (!cpmChart || !gameState.chart.points.length) return -1;
  const rect = cpmChart.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let nearest = -1;
  let bestDist = Infinity;
  const hitRadius = 10;
  gameState.chart.points.forEach(point => {
    const dist = Math.hypot(point.x - x, point.y - y);
    if (dist <= hitRadius && dist < bestDist) {
      nearest = point.index;
      bestDist = dist;
    }
  });
  return nearest;
}

// 補助: 値を「キリのいい上限」に切り上げる（10/20/50/100/200/500...）
function niceCeil(v) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  let nice;
  if (n <= 1)      nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 5) nice = 5;
  else             nice = 10;
  return nice * pow;
}

// 補助: 経過秒数の最大値に応じた目盛り間隔を返す
function chooseTimeStep(maxTime) {
  if (maxTime <= 10)  return 2;
  if (maxTime <= 30)  return 5;
  if (maxTime <= 60)  return 10;
  if (maxTime <= 180) return 30;
  if (maxTime <= 300) return 60;
  return 120;
}

// 補助: 秒を "mm:ss" もしくは "Ns" 表記に
function formatSec(sec) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 補助: CSS 変数経由で取得した色（hex想定）を rgba にする
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}


function updateCPMAnimationReadout(index = null) {
  const history = gameState.chart.cpmHistory || [];
  if (!history.length) return;
  const safeIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, history.length - 1)) : history.length - 1;
  const point = history[safeIndex];
  if (chartCurrentTime) chartCurrentTime.textContent = formatSec(point.time || 0);
  if (chartCurrentAvgCpm) chartCurrentAvgCpm.textContent = String(Math.round(point.cpm || 0));
  if (chartCurrentInstantCpm) chartCurrentInstantCpm.textContent = String(Math.round(point.instantCpm || 0));
}

function stopCPMAnimation(resetLabel = true) {
  const anim = gameState.chart.animation;
  if (anim && anim.frameId) cancelAnimationFrame(anim.frameId);
  gameState.chart.animation = { playing: false, index: gameState.chart.animation?.index ?? null, frameId: null, lastFrameTime: null };
  if (resetLabel && btnCpmPlay) btnCpmPlay.textContent = '▶ 再生';
}

function resetCPMAnimation() {
  stopCPMAnimation();
  gameState.chart.animation.index = 0;
  gameState.chart.hoverIndex = -1;
  updateCPMAnimationReadout(0);
  drawCPMChart(-1, 0);
}

function playCPMAnimation() {
  const history = gameState.chart.cpmHistory || [];
  if (history.length <= 1) return;
  stopCPMAnimation(false);
  const anim = gameState.chart.animation;
  anim.playing = true;
  anim.index = Number.isInteger(anim.index) && anim.index < history.length - 1 ? anim.index : 0;
  anim.lastFrameTime = null;
  if (btnCpmPlay) btnCpmPlay.textContent = '⏸ 停止';

  const step = (timestamp) => {
    const current = gameState.chart.animation;
    if (!current.playing) return;
    if (current.lastFrameTime === null) current.lastFrameTime = timestamp;
    const elapsed = timestamp - current.lastFrameTime;
    if (elapsed >= 80) {
      current.index = Math.min((current.index || 0) + 1, history.length - 1);
      current.lastFrameTime = timestamp;
      updateCPMAnimationReadout(current.index);
      drawCPMChart(-1, current.index);
      if (current.index >= history.length - 1) {
        stopCPMAnimation();
        current.index = history.length - 1;
        drawCPMChart();
        updateCPMAnimationReadout(history.length - 1);
        return;
      }
    }
    current.frameId = requestAnimationFrame(step);
  };
  anim.frameId = requestAnimationFrame(step);
}

function toggleCPMAnimation() {
  const anim = gameState.chart.animation;
  if (anim && anim.playing) {
    stopCPMAnimation();
    return;
  }
  playCPMAnimation();
}

// グラフ上の点にマウスを重ねたら、その時点の瞬間CPMと平均CPMを表示する。
if (cpmChart) {
  cpmChart.addEventListener('mousemove', (e) => {
    if (gameState.chart.animation?.playing) return;
    if (resultScreen.style.display !== 'block' || !gameState.chart.cpmHistory.length) return;
    const nearest = findNearestCPMPoint(e.clientX, e.clientY);
    cpmChart.style.cursor = nearest >= 0 ? 'pointer' : 'default';
    if (nearest !== gameState.chart.hoverIndex) {
      gameState.chart.hoverIndex = nearest;
      drawCPMChart(gameState.chart.hoverIndex);
    }
  });

  cpmChart.addEventListener('mouseleave', () => {
    if (gameState.chart.hoverIndex !== -1) {
      gameState.chart.hoverIndex = -1;
      cpmChart.style.cursor = 'default';
      drawCPMChart();
    }
  });
}

if (btnCpmPlay) btnCpmPlay.addEventListener('click', toggleCPMAnimation);
if (btnCpmReset) btnCpmReset.addEventListener('click', resetCPMAnimation);

// 結果画面が表示中にウィンドウサイズが変わったら、グラフを再描画する。
// 結果画面が非表示の間は何もしない（cssW=0 ガードでも防がれるが念のため）。
window.addEventListener('resize', () => {
  if (resultScreen.style.display === 'block' && gameState.chart.cpmHistory.length > 0) {
    drawCPMChart(gameState.chart.hoverIndex);
  }
});

// =============================================================================
// 採点詳細（エラー分析）エンジン
// -----------------------------------------------------------------------------
// 入力文字列と正解文字列を比較して、以下のカテゴリに分類してカウント・一覧化する。
//   - 誤字           : 問題と異なる文字を打った
//   - 脱字           : 打ち落とした文字
//   - 余字           : 余分に挟み込まれた文字
//   - 余分な空白     : 正解にない場所に挿入された空白（全角・半角どちらも）
//   - 不要な改行     : 正解にない場所に挿入された改行
//   - 改行不足       : 必要な改行を打っていない
//   - 全角/半角違い  : 正解と「文字種は同じだが幅が違う」（例: A↔Ａ、1↔１）
//   - 句読点違い     : 正解と「読点同士の違い」「句点同士の違い」など
//                       例: 「、」↔「，」、「。」↔「．」、「,」↔「、」など
//
// 計算は LCS (Longest Common Subsequence) で位置合わせし、その編集スクリプトを
// もとに「置換 = 誤字寄り」「削除 = 脱字」「挿入 = 余字」と分類していく。
// PDF p.3 の速度採点基準（誤字＝1文字減、脱字／余字＝該当文字数分の減）を
// 簡易化した形で踏襲する。級判定は行わない（仕様による）。
// =============================================================================

// 全角→半角の対応表（数字・英字・記号の代表的なもの）。判定にのみ使う、置換はしない。
