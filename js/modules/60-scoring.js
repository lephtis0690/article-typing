// 採点・エラー分類・詳細表示
// 元ファイル: js/app.js から機能別に分割

const FULLWIDTH_TO_HALF = (() => {
  const map = new Map();
  // 全角数字 -> 半角数字
  for (let i = 0; i < 10; i++) {
    map.set(String.fromCharCode(0xFF10 + i), String(i));
  }
  // 全角英字 -> 半角英字（大文字・小文字）
  for (let i = 0; i < 26; i++) {
    map.set(String.fromCharCode(0xFF21 + i), String.fromCharCode(0x41 + i));
    map.set(String.fromCharCode(0xFF41 + i), String.fromCharCode(0x61 + i));
  }
  // 全角記号 -> 半角記号（よく出るもの）
  const symPairs = [
    ['！','!'],['＃','#'],['＄','$'],['％','%'],['＆','&'],['（','('],['）',')'],
    ['＊','*'],['＋','+'],['－','-'],['．','.'],['／','/'],['：',':'],['；',';'],
    ['＜','<'],['＝','='],['＞','>'],['？','?'],['＠','@'],['［','['],['］',']'],
    ['｛','{'],['｝','}'],['＾','^'],['＿','_'],['｜','|'],['～','~'],['　',' ']
  ];
  symPairs.forEach(([f, h]) => map.set(f, h));
  return map;
})();

// 文字が空白（半角スペース、全角スペース、タブ）かどうか。改行は別カテゴリ扱い。
function isSpaceChar(ch) {
  return ch === ' ' || ch === '\u3000' || ch === '\t';
}

// 「文字種は同じだが全角/半角が違う」ペアかどうか。
// 例: 'A' と 'Ａ'、'1' と '１'、'　' と ' '。
function isWidthVariant(a, b) {
  if (a === b) return false;
  if (FULLWIDTH_TO_HALF.get(a) === b) return true;
  if (FULLWIDTH_TO_HALF.get(b) === a) return true;
  return false;
}

// 句読点違い（読点同士、句点同士の表記揺れ）かどうか。
// 同一文字は除外し、別の句読点に置き換わっているケースだけ true。
function isPunctuationVariant(a, b) {
  if (a === b) return false;
  const commas = new Set(['、','，',',']);
  const periods = new Set(['。','．','.']);
  if (commas.has(a) && commas.has(b)) return true;
  if (periods.has(a) && periods.has(b)) return true;
  return false;
}

// 文字を一覧表示用に整形する。空白・改行・タブは可視化用のラベルに変換。
function glyphify(ch) {
  if (ch === ' ')    return '<span class="glyph">SP</span>';
  if (ch === '\u3000') return '<span class="glyph">全SP</span>';
  if (ch === '\t')   return '<span class="glyph">TAB</span>';
  if (ch === '\n')   return '<span class="glyph">↵</span>';
  if (ch === '')     return '<span class="glyph">―</span>';
  return escapeHtml(ch);
}

// LCS を計算し、編集スクリプト（'eq' / 'sub' / 'del' / 'ins'）を返す。
// 入力: target=正解文字列, input=ユーザー入力。
// 戻り値: [{ op, ti, ii, tch, ich }] の配列。
//   op  = 'eq'（一致）/ 'sub'（置換）/ 'del'（脱字＝targetだけにある）/ 'ins'（余字＝inputだけにある）
//   ti  = target 側のインデックス、ii = input 側のインデックス
//   tch = target 側の文字、    ich = input 側の文字
// なお置換 (sub) は LCS そのものでは出ないが、del+ins が隣接した場合に
// 後段で 1 つの sub にマージしている（編集距離的な見方に近づける）。
function computeEditScript(target, input) {
  const n = target.length, m = input.length;
  // DP テーブルが巨大化するのを抑えるため、上限を設ける。
  // 想定: gameState.texts.currentText は約 1700 文字、入力もそれ前後。1700×1700 = ~290 万セル。
  // 各セル整数1個なので Int32Array で十分高速・省メモリ。
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
  // バックトレース
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

  // del と ins の連続ブロックを 1 つの「置換ブロック」として扱い、
  // 対応する位置ペアを sub にマージする。これにより
  //   target=ABC123, input=ＡＢＣ１２３
  // のように共通部分が一切ない場合でも、隣り合った del/ins 群を
  // 順番に sub にできる（=> 各文字を「全角半角の置換」として認識できる）。
  const out = [];
  let k = 0;
  while (k < raw.length) {
    const cur = raw[k];
    // 'eq' はそのまま流す
    if (cur.op === 'eq') { out.push(cur); k++; continue; }

    // この k から続く del/ins の連続ブロックを集める
    let blockEnd = k;
    while (blockEnd < raw.length && (raw[blockEnd].op === 'del' || raw[blockEnd].op === 'ins')) {
      blockEnd++;
    }
    const block = raw.slice(k, blockEnd);
    // ブロック内の del 群と ins 群をそれぞれ取り出す（元の順序を保つ）
    const dels = block.filter(x => x.op === 'del');
    const inss = block.filter(x => x.op === 'ins');
    // 対応する index でペアを作って sub に。残りはそれぞれ del/ins として残す。
    const pairLen = Math.min(dels.length, inss.length);
    for (let p = 0; p < pairLen; p++) {
      const d = dels[p], i = inss[p];
      out.push({ op: 'sub', ti: d.ti, ii: i.ii, tch: d.tch, ich: i.ich });
    }
    for (let p = pairLen; p < dels.length; p++) out.push(dels[p]);
    for (let p = pairLen; p < inss.length; p++) out.push(inss[p]);

    k = blockEnd;
  }
  return out;
}


// ミスした箇所を文字種別に分類する。これは採点用のエラー数には影響させず、
// 結果画面で「どの種類の文字で崩れたか」を見るための分析専用データとして使う。
function getMissCharCategory(expected, actual) {
  const ch = expected || actual || '';
  if (ch === '\n') return 'newline';
  if (/[、。，．,.]/.test(ch)) return 'punct';
  if (/[0-9０-９]/.test(ch)) return 'digit';
  if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(ch)) return 'alpha';
  if (/^[!-/:-@[-`{-~！-／：-＠［-｀｛-～「」『』（）［］【】〈〉《》〔〕・￥〒※％＆＋＝＊＃＠＿｜〜…―ー－]$/.test(ch)) return 'symbol';
  return 'other';
}

function getMissCategoryLabel(category) {
  return {
    punct: '句読点',
    digit: '数字',
    alpha: '英字',
    symbol: '記号',
    newline: '改行',
    other: 'その他',
  }[category] || 'その他';
}

function buildMissAnalysis(script) {
  const counts = { punct: 0, digit: 0, alpha: 0, symbol: 0, newline: 0, other: 0 };
  const list = [];

  for (const ev of script) {
    if (ev.op === 'eq') continue;
    const expected = ev.tch || '';
    const actual = ev.ich || '';
    const category = getMissCharCategory(expected, actual);
    counts[category]++;
    list.push({
      pos: (ev.ti >= 0 ? ev.ti : ev.ii) + 1,
      category,
      expected,
      actual,
      op: ev.op,
    });
  }

  return { counts, list };
}

// 編集スクリプトを元に、入力文字列と正解文字列の差分を「採点項目」に分類する。
// 戻り値: { counts: {...}, lists: {...} }
//   counts.misuse / missing / extra / space / newlineExtra / newlineMiss / width / punct
//   lists.misuse / missing / extra / spacing / widthPunct
function classifyErrors(target, input) {
  const script = computeEditScript(target, input);

  const counts = {
    misuse: 0, missing: 0, extra: 0,
    space: 0, newlineExtra: 0, newlineMiss: 0,
    width: 0, punct: 0,
  };
  const lists = {
    misuse: [],     // {pos, expected, actual}
    missing: [],    // {pos, expected}
    extra: [],      // {pos, actual}
    spacing: [],    // {pos, kind, expected, actual}   kind: 'extra-space' / 'extra-newline' / 'missing-newline'
    widthPunct: [], // {pos, kind, expected, actual}   kind: 'width' / 'punct'
  };
  const missAnalysis = buildMissAnalysis(script);

  for (const ev of script) {
    if (ev.op === 'eq') continue;

    if (ev.op === 'sub') {
      // 置換: 中身を見て「全角半角違い」「句読点違い」「ただの誤字」に振り分ける。
      if (isWidthVariant(ev.tch, ev.ich)) {
        counts.width++;
        lists.widthPunct.push({
          pos: ev.ti + 1, kind: 'width', expected: ev.tch, actual: ev.ich,
        });
      } else if (isPunctuationVariant(ev.tch, ev.ich)) {
        counts.punct++;
        lists.widthPunct.push({
          pos: ev.ti + 1, kind: 'punct', expected: ev.tch, actual: ev.ich,
        });
      } else {
        counts.misuse++;
        lists.misuse.push({
          pos: ev.ti + 1, expected: ev.tch, actual: ev.ich,
        });
      }
    } else if (ev.op === 'del') {
      // del: target にあるが input にない = 打ち落とし。
      // 中身が改行なら「改行不足」、それ以外は脱字。
      if (ev.tch === '\n') {
        counts.newlineMiss++;
        lists.spacing.push({
          pos: ev.ti + 1, kind: 'missing-newline', expected: '\n', actual: '',
        });
      } else {
        counts.missing++;
        lists.missing.push({ pos: ev.ti + 1, expected: ev.tch });
      }
    } else if (ev.op === 'ins') {
      // ins: input にあるが target にない = 余分。
      // 改行なら「不要な改行」、空白なら「余分な空白」、それ以外は余字。
      if (ev.ich === '\n') {
        counts.newlineExtra++;
        lists.spacing.push({
          pos: ev.ii + 1, kind: 'extra-newline', expected: '', actual: '\n',
        });
      } else if (isSpaceChar(ev.ich)) {
        counts.space++;
        lists.spacing.push({
          pos: ev.ii + 1, kind: 'extra-space', expected: '', actual: ev.ich,
        });
      } else {
        counts.extra++;
        lists.extra.push({ pos: ev.ii + 1, actual: ev.ich });
      }
    }
  }
  return { counts, lists, missAnalysis };
}

// 採点結果を結果画面に流し込む。表示／非表示は applyDetailVisibility() が司る。
function renderDetailedScoring(input, classified, correctInScope) {
  const { counts, lists, missAnalysis } = classified;

  // --- 上部サマリのカード（入力文字数・エラー総数・純字数） ---
  resInput.textContent = input.length;

  const errorTotal =
    counts.misuse + counts.missing + counts.extra +
    counts.space + counts.newlineExtra + counts.newlineMiss +
    counts.width + counts.punct;
  resErrorTotal.textContent = errorTotal;

  // 純字数 = 入力文字数 - （エラー総数 × 10）。
  // 失格ラインに達した場合は純字数を 0 にし、判定を「失格」にする。
  // エラー 0 かつ純字数 1000 以上の場合は「正確賞」と表示する。
  const deduction = errorTotal * 10;
  const disqualifyLimit = disqualifyLimitSelect ? parseInt(disqualifyLimitSelect.value, 10) : 10;
  const isDisqualified = errorTotal >= disqualifyLimit;
  const rawNet = Math.max(0, input.length - deduction);
  const net = isDisqualified ? 0 : rawNet;

  resNet.textContent = net;
  if (resDeduction) resDeduction.textContent = deduction;

  if (resJudge) {
    resJudge.classList.remove('judge-ok', 'judge-prize', 'judge-disqualified');
    if (isDisqualified) {
      resJudge.textContent = '失格';
      resJudge.classList.add('judge-disqualified');
      if (resJudgeNote) resJudgeNote.textContent = `エラー数が${disqualifyLimit}件以上`;
    } else if (errorTotal === 0 && net >= 1000) {
      resJudge.textContent = '正確賞';
      resJudge.classList.add('judge-prize');
      if (resJudgeNote) resJudgeNote.textContent = 'エラー0・純字数1000以上';
    } else {
      resJudge.textContent = '通常';
      resJudge.classList.add('judge-ok');
      if (resJudgeNote) resJudgeNote.textContent = `失格ライン ${disqualifyLimit}件`;
    }
  }

  // --- エラー内訳カード ---
  errMisuseCount.textContent       = counts.misuse;
  errMissingCount.textContent      = counts.missing;
  errExtraCount.textContent        = counts.extra;
  errSpaceCount.textContent        = counts.space;
  errNewlineExtraCount.textContent = counts.newlineExtra;
  errNewlineMissCount.textContent  = counts.newlineMiss;
  errWidthCount.textContent        = counts.width;
  errPunctCount.textContent        = counts.punct;

  // --- 分類別ミス分析（採点仕様には影響しない分析表示） ---
  if (missAnalysis) {
    if (missPunctCount)   missPunctCount.textContent   = missAnalysis.counts.punct;
    if (missDigitCount)   missDigitCount.textContent   = missAnalysis.counts.digit;
    if (missAlphaCount)   missAlphaCount.textContent   = missAnalysis.counts.alpha;
    if (missSymbolCount)  missSymbolCount.textContent  = missAnalysis.counts.symbol;
    if (missNewlineCount) missNewlineCount.textContent = missAnalysis.counts.newline;
    if (missOtherCount)   missOtherCount.textContent   = missAnalysis.counts.other;
  }

  // --- 各一覧 ---
  // 一覧は最大件数までに制限（巨大な誤入力時のレンダリング負荷対策）。
  const MAX_LIST = 200;
  fillList(listMisuse, lists.misuse.slice(0, MAX_LIST), (e) =>
    `<span class="el-pos">#${e.pos}</span>
     <span class="el-expected"><span class="lbl">正</span>${glyphify(e.expected)}</span>
     <span class="el-actual"><span class="lbl">入</span>${glyphify(e.actual)}</span>`);

  fillList(listMissing, lists.missing.slice(0, MAX_LIST), (e) =>
    `<span class="el-pos">#${e.pos}</span>
     <span class="el-expected"><span class="lbl">正</span>${glyphify(e.expected)}</span>
     <span class="el-actual"><span class="lbl">入</span>${glyphify('')}</span>`);

  fillList(listExtra, lists.extra.slice(0, MAX_LIST), (e) =>
    `<span class="el-pos">#${e.pos}</span>
     <span class="el-expected"><span class="lbl">正</span>${glyphify('')}</span>
     <span class="el-actual"><span class="lbl">入</span>${glyphify(e.actual)}</span>`);

  fillList(listSpacing, lists.spacing.slice(0, MAX_LIST), (e) => {
    const kindLabel =
      e.kind === 'extra-space'    ? '余分な空白' :
      e.kind === 'extra-newline'  ? '不要な改行' :
      e.kind === 'missing-newline'? '改行不足' : e.kind;
    return `<span class="el-pos">#${e.pos} ${kindLabel}</span>
            <span class="el-expected"><span class="lbl">正</span>${glyphify(e.expected)}</span>
            <span class="el-actual"><span class="lbl">入</span>${glyphify(e.actual)}</span>`;
  });

  fillList(listWidthPunct, lists.widthPunct.slice(0, MAX_LIST), (e) => {
    const kindLabel = e.kind === 'width' ? '全角/半角' : '句読点';
    return `<span class="el-pos">#${e.pos} ${kindLabel}</span>
            <span class="el-expected"><span class="lbl">正</span>${glyphify(e.expected)}</span>
            <span class="el-actual"><span class="lbl">入</span>${glyphify(e.actual)}</span>`;
  });

  fillList(listMissAnalysis, (missAnalysis ? missAnalysis.list : []).slice(0, MAX_LIST), (e) => {
    const categoryLabel = getMissCategoryLabel(e.category);
    return `<span class="el-pos">#${e.pos} ${categoryLabel}</span>
            <span class="el-expected"><span class="lbl">正</span>${glyphify(e.expected)}</span>
            <span class="el-actual"><span class="lbl">入</span>${glyphify(e.actual)}</span>`;
  });

  return { errorTotal, deduction, net, isDisqualified };
}

// ul に <li> を埋める。空のときは「該当なし」を一行だけ表示。
function fillList(ulEl, items, formatter) {
  if (!ulEl) return;
  if (items.length === 0) {
    ulEl.innerHTML = '<li class="ds-empty" style="display:block;border:none;">該当なし</li>';
    return;
  }
  ulEl.innerHTML = items.map(item => `<li data-pos="${item.pos}">${formatter(item)}</li>`).join('');
  ulEl.querySelectorAll('li[data-pos]').forEach(li => {
    li.addEventListener('click', () => focusTextPosition(parseInt(li.dataset.pos, 10)));
  });
}

// 結果画面のエラー一覧をクリックしたとき、課題文表示欄の該当位置へ移動して強調する。
function focusTextPosition(pos) {
  if (!Number.isFinite(pos) || pos <= 0) return;
  const target = textDisplay.querySelector(`[data-index="${pos}"]`) || textDisplay.querySelector('.char-cursor');
  if (!target) return;
  textDisplay.querySelectorAll('.char-review-focus').forEach(el => el.classList.remove('char-review-focus'));
  target.classList.add('char-review-focus');
  target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

// 採点詳細の計算 → 描画 → 表示制御 を一括で行うエントリポイント。
// endGame の最後から呼ばれる。
function runDetailedScoring(input) {
  // ★ 採点範囲は「入力が終了した部分まで」とする。
  //    課題文全体（gameState.texts.currentText）と比較すると、未入力部分が全部「脱字」になってしまうため、
  //    入力末尾までに対応する正解側の長さを求めて、その範囲だけを採点対象にする。
  //
  //  実装方針:
  //    1) まず gameState.texts.currentText 全体と input で LCS を計算し、編集スクリプトを取る。
  //    2) スクリプトを末尾から走査して、「入力側 (ii) がもう登場しなくなった位置」を探す。
  //       そこから先の del（target だけ進む）は「まだ打っていない部分」なので採点から除外する。
  //    3) その境界の target インデックスまでを effectiveTarget とし、これに対して
  //       改めて分類を行う（スクリプトをトリムしてもよいが、再計算のほうがシンプル）。
  //
  //  例: target="あいうえお", input="あxいうえ" の場合
  //       入力が消化した target は "あいうえ" まで（5文字目「お」は未入力）。
  //       これにより「お」を脱字として誤検出しない。
  const effectiveTarget = computeEffectiveTarget(gameState.texts.currentText, input);
  const classified = classifyErrors(effectiveTarget, input);
  const correctInScope = countCorrectInScope(effectiveTarget, input);
  const result = renderDetailedScoring(input, classified, correctInScope);
  applyDetailVisibility();
  return result;
}

// 採点対象範囲内で一致している文字数を数える。
// 詳細採点の「純字数」用。未入力の残り部分はここにも含めない。
function countCorrectInScope(target, input) {
  let correct = 0;
  const len = Math.min(target.length, input.length);
  for (let i = 0; i < len; i++) {
    if (target[i] === input[i]) correct++;
  }
  return correct;
}

// 入力が「課題文のどこまで進んだか」を判定し、その範囲までの正解文字列を返す。
// LCS の編集スクリプトを末尾から見て、最後に入力側 (ii) が使われた位置 +1 を
// 「入力が到達した target 側の境界」とみなす。
function computeEffectiveTarget(target, input) {
  // 採点対象は「入力済みの文字数ぶん」だけに限定する。
  // ここで target 全文や LCS 由来の到達位置を使うと、まだ入力していない後続部分が
  // trailing del として残り、「脱字」「改行不足」に誤カウントされることがある。
  // そのため、入力文字数と同じ長さの課題文先頭部分だけを採点対象にする。
  //
  // 例:
  //   target = "あいう\nえお"
  //   input  = "あいう"
  //   effectiveTarget = "あいう"
  //   => まだ打っていない改行は「改行不足」にしない。
  //
  // 入力が課題文全文より長い場合は、課題文全文までを対象にし、超過分は classifyErrors 側で
  // 「余字」として扱う。
  const scopeLen = Math.min(input.length, target.length);
  return target.substring(0, scopeLen);
}

