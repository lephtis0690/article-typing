// サーバー側の採点。ブラウザ側 js/modules/60-scoring.js と同じ計算を行う。
// ブラウザから送られた「純字数」は信用せず、入力文字列からここで計算し直す。
// 60-scoring.js の採点ロジックを変えたら、ここも同じように直すこと。
// （tests/ranking-scoring-parity-check.mjs が、両者の結果が一致することを確認している）

const FULLWIDTH_TO_HALF = (() => {
  const map = new Map();
  for (let i = 0; i < 10; i++) map.set(String.fromCharCode(0xFF10 + i), String(i));
  for (let i = 0; i < 26; i++) {
    map.set(String.fromCharCode(0xFF21 + i), String.fromCharCode(0x41 + i));
    map.set(String.fromCharCode(0xFF41 + i), String.fromCharCode(0x61 + i));
  }
  const symPairs = [
    ['！','!'],['＃','#'],['＄','$'],['％','%'],['＆','&'],['（','('],['）',')'],
    ['＊','*'],['＋','+'],['－','-'],['．','.'],['／','/'],['：',':'],['；',';'],
    ['＜','<'],['＝','='],['＞','>'],['？','?'],['＠','@'],['［','['],['］',']'],
    ['｛','{'],['｝','}'],['＾','^'],['＿','_'],['｜','|'],['～','~'],['　',' ']
  ];
  symPairs.forEach(([f, h]) => map.set(f, h));
  return map;
})();

function isSpaceChar(ch) {
  return ch === ' ' || ch === '\u3000' || ch === '\t';
}

function isWidthVariant(a, b) {
  if (a === b) return false;
  if (FULLWIDTH_TO_HALF.get(a) === b) return true;
  if (FULLWIDTH_TO_HALF.get(b) === a) return true;
  return false;
}

function isPunctuationVariant(a, b) {
  if (a === b) return false;
  const commas = new Set(['、','，',',']);
  const periods = new Set(['。','．','.']);
  if (commas.has(a) && commas.has(b)) return true;
  if (periods.has(a) && periods.has(b)) return true;
  return false;
}

export function computeEditScript(target, input) {
  const n = target.length, m = input.length;
  const dp = new Int32Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (target[i - 1] === input[j - 1]) {
        dp[i * W + j] = dp[(i - 1) * W + (j - 1)] + 1;
      } else {
        const a = dp[(i - 1) * W + j];
        const b = dp[i * W + (j - 1)];
        dp[i * W + j] = a > b ? a : b;
      }
    }
  }
  const raw = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (target[i - 1] === input[j - 1]) {
      raw.push({ op: 'eq', ti: i - 1, ii: j - 1, tch: target[i - 1], ich: input[j - 1] });
      i--; j--;
    } else if (dp[(i - 1) * W + j] >= dp[i * W + (j - 1)]) {
      raw.push({ op: 'del', ti: i - 1, ii: j, tch: target[i - 1], ich: '' });
      i--;
    } else {
      raw.push({ op: 'ins', ti: i, ii: j - 1, tch: '', ich: input[j - 1] });
      j--;
    }
  }
  while (i > 0) { raw.push({ op: 'del', ti: i - 1, ii: 0, tch: target[i - 1], ich: '' }); i--; }
  while (j > 0) { raw.push({ op: 'ins', ti: 0, ii: j - 1, tch: '', ich: input[j - 1] }); j--; }
  raw.reverse();

  const out = [];
  let k = 0;
  while (k < raw.length) {
    const cur = raw[k];
    if (cur.op === 'eq') { out.push(cur); k++; continue; }
    let blockEnd = k;
    while (blockEnd < raw.length && (raw[blockEnd].op === 'del' || raw[blockEnd].op === 'ins')) blockEnd++;
    const block = raw.slice(k, blockEnd);
    const dels = block.filter(x => x.op === 'del');
    const inss = block.filter(x => x.op === 'ins');
    const pairLen = Math.min(dels.length, inss.length);
    for (let p = 0; p < pairLen; p++) {
      out.push({ op: 'sub', ti: dels[p].ti, ii: inss[p].ii, tch: dels[p].tch, ich: inss[p].ich });
    }
    for (let p = pairLen; p < dels.length; p++) out.push(dels[p]);
    for (let p = pairLen; p < inss.length; p++) out.push(inss[p]);
    k = blockEnd;
  }
  return out;
}

// 60-scoring.js の classifyErrors() の件数部分だけを取り出したもの。
export function countErrors(target, input) {
  const counts = { misuse: 0, missing: 0, extra: 0, space: 0, newlineExtra: 0, newlineMiss: 0, width: 0, punct: 0 };
  for (const ev of computeEditScript(target, input)) {
    if (ev.op === 'eq') continue;
    if (ev.op === 'sub') {
      if (isWidthVariant(ev.tch, ev.ich)) counts.width++;
      else if (isPunctuationVariant(ev.tch, ev.ich)) counts.punct++;
      else counts.misuse++;
    } else if (ev.op === 'del') {
      if (ev.tch === '\n') counts.newlineMiss++;
      else counts.missing++;
    } else if (ev.op === 'ins') {
      if (ev.ich === '\n') counts.newlineExtra++;
      else if (isSpaceChar(ev.ich)) counts.space++;
      else counts.extra++;
    }
  }
  return counts;
}

// 採点範囲は「入力文字数ぶんの課題文先頭」（60-scoring.js の computeEffectiveTarget と同じ）。
export function scoreInput(target, input, disqualifyLimit) {
  const effectiveTarget = target.substring(0, Math.min(input.length, target.length));
  const counts = countErrors(effectiveTarget, input);
  const errorTotal = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const inputChars = input.length;
  const isDisqualified = errorTotal >= disqualifyLimit;
  const rawNet = Math.max(0, inputChars - errorTotal * 10);
  const net = isDisqualified ? 0 : rawNet;
  const nonErrorChars = Math.max(0, inputChars - errorTotal);
  const accuracy = inputChars > 0 ? Math.round((nonErrorChars / inputChars) * 100) : 0;
  return { inputChars, errorTotal, net, isDisqualified, accuracy, counts };
}

// 10-texts.js の applySelectedText() / normalizeTypingParagraphIndents() と同じ手順で、入力対象の本文を作る。
export function normalizeTypingParagraphIndents(text) {
  let normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  normalized = normalized.replace(/^(?:[ \t]*\n)+/u, '');
  normalized = normalized.split('\n').map(line => {
    if (/^[ \t]*$/u.test(line)) return '';
    return '　' + line.replace(/^[\u3000 \t]+/u, '');
  }).join('\n');
  return normalized;
}

export function buildTypingTarget(item) {
  const rawText = String(item.text || '');
  const rawTitle = String(item.title || '').trim();
  let typingTarget = rawText;
  if (rawTitle) {
    const normalized = rawText.replace(/^\uFEFF/, '');
    if (normalized.startsWith(rawTitle + '\n')) typingTarget = normalized.slice((rawTitle + '\n').length);
    else if (normalized.startsWith(rawTitle + '\r\n')) typingTarget = normalized.slice((rawTitle + '\r\n').length);
  }
  return normalizeTypingParagraphIndents(typingTarget);
}
