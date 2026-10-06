// 登録内容の検査（人間離れした速度の検出・名前・送信データの形式）

// 判定の基準値。wrangler.toml の [vars] で上書きできる。
export const DEFAULT_LIMITS = {
  // 制限時間全体の平均速度の上限（文字/分）。日本語の長文入力でこれを超えるのは人間離れしているとみなす。
  MAX_CPM: 500,
  // 1回の確定で増やせる文字数の上限。長い変換の一括確定は許すが、貼り付けのような大量入力は弾く。
  MAX_SINGLE_INSERT: 50,
  // 任意の5秒間に増やせる文字数の上限（1秒あたり12文字）。
  MAX_CHARS_PER_5SEC: 60,
  // 入力間隔のばらつき（変動係数）の下限。機械的に一定間隔で入力された記録を弾く。
  MIN_INTERVAL_CV: 0.12,
  // ばらつき判定を行う最小の入力回数。
  MIN_EVENTS_FOR_CV: 30
};

export function readLimits(env = {}) {
  const limits = { ...DEFAULT_LIMITS };
  Object.keys(limits).forEach(key => {
    const value = Number(env[key]);
    if (env[key] !== undefined && env[key] !== '' && Number.isFinite(value) && value > 0) limits[key] = value;
  });
  return limits;
}

export const NAME_MAX_LENGTH = 12;

// 簡易の禁止語。必要に応じて追加する（大文字小文字・全角半角は区別せずに照合）。
const NG_WORDS = ['http', 'www.', '.com', '死ね', '殺す', 'しね', 'ころす'];

export function normalizeName(raw) {
  if (typeof raw !== 'string') return { ok: false, message: '名前を入力してください。' };
  // 制御文字・改行を除き、前後の空白を取る。連続する空白は1つにまとめる。
  const name = raw.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();
  if (!name) return { ok: false, message: '名前を入力してください。' };
  if ([...name].length > NAME_MAX_LENGTH) return { ok: false, message: `名前は${NAME_MAX_LENGTH}文字以内にしてください。` };
  const folded = name.normalize('NFKC').toLowerCase().replace(/\s/g, '');
  if (NG_WORDS.some(word => folded.includes(word.normalize('NFKC').toLowerCase()))) {
    return { ok: false, message: 'この名前は登録できません。別の名前にしてください。' };
  }
  return { ok: true, name };
}

export function isValidClientId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(value);
}

// 送信データの形を確認する。中身の妥当性（速度など）は checkHumanPace で見る。
export function parseSubmission(body) {
  if (!body || typeof body !== 'object') return { ok: false, code: 'bad_request', message: '送信データが読み取れません。' };
  if (!isValidClientId(body.clientId)) return { ok: false, code: 'bad_request', message: '端末の識別番号が正しくありません。' };
  if (typeof body.input !== 'string') return { ok: false, code: 'bad_request', message: '入力内容がありません。' };
  if (body.input.length > 5000) return { ok: false, code: 'too_fast', message: '入力文字数が多すぎるため登録できません。' };
  const elapsedMs = Number(body.elapsedMs);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return { ok: false, code: 'bad_request', message: '計測時間が正しくありません。' };
  if (!Array.isArray(body.inputLog) || body.inputLog.length > 6000) {
    return { ok: false, code: 'bad_request', message: '入力の記録が正しくありません。' };
  }
  const log = [];
  for (const point of body.inputLog) {
    if (!Array.isArray(point) || point.length !== 2) return { ok: false, code: 'bad_request', message: '入力の記録が正しくありません。' };
    const t = Number(point[0]);
    const n = Number(point[1]);
    if (!Number.isInteger(t) || !Number.isInteger(n) || t < 0 || n < 0) {
      return { ok: false, code: 'bad_request', message: '入力の記録が正しくありません。' };
    }
    log.push([t, n]);
  }
  return { ok: true, clientId: body.clientId, name: body.name, input: body.input, elapsedMs, inputLog: log };
}

// 制限時間まで打ち切ったか、人間離れした入力でないかを確認する。
// 問題がなければ { ok: true }、あれば { ok: false, code, message }。
export function checkHumanPace({ input, inputLog, elapsedMs, timeLimitSeconds }, limits = DEFAULT_LIMITS) {
  const limitMs = timeLimitSeconds * 1000;
  if (elapsedMs < limitMs - 1500 || elapsedMs > limitMs + 5000) {
    return { ok: false, code: 'not_finished', message: '制限時間まで打ち切った記録だけを登録できます。' };
  }
  const chars = input.length;
  if (chars === 0) return { ok: false, code: 'empty', message: '入力がないため登録できません。' };

  // 入力の記録が時間順に並び、最後の文字数が入力内容と一致していること。
  let prevT = 0;
  for (const [t, n] of inputLog) {
    if (t < prevT || t > elapsedMs + 1000) return { ok: false, code: 'bad_log', message: '入力の記録が計測時間と一致しません。' };
    if (n > 5000) return { ok: false, code: 'bad_log', message: '入力の記録が正しくありません。' };
    prevT = t;
  }
  if (!inputLog.length || inputLog[inputLog.length - 1][1] !== chars) {
    return { ok: false, code: 'bad_log', message: '入力の記録が入力内容と一致しません。' };
  }

  // 1) 平均速度
  const cpm = chars / (timeLimitSeconds / 60);
  if (cpm > limits.MAX_CPM) {
    return { ok: false, code: 'too_fast', message: `入力速度が上限（毎分${limits.MAX_CPM}文字）を超えているため登録できません。` };
  }

  // 2) 1回あたりの増加量（貼り付けのような一括入力）
  const points = [[0, 0], ...inputLog];
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] - points[i - 1][1] > limits.MAX_SINGLE_INSERT) {
      return { ok: false, code: 'burst', message: '一度に大量の文字が入力されているため登録できません。' };
    }
  }

  // 3) 任意の5秒間の増加量。i 番目の入力から5秒以内に起きた入力で増えた文字数を、
  //    i 番目の入力の直前の文字数（points[i - 1]）を基準に数える。
  let j = 1;
  for (let i = 1; i < points.length; i++) {
    if (j < i) j = i;
    while (j + 1 < points.length && points[j + 1][0] - points[i][0] <= 5000) j++;
    const before = points[i - 1][1];
    let maxN = before;
    for (let k = i; k <= j; k++) if (points[k][1] > maxN) maxN = points[k][1];
    if (maxN - before > limits.MAX_CHARS_PER_5SEC) {
      return { ok: false, code: 'burst', message: '短時間に入力された文字数が多すぎるため登録できません。' };
    }
  }

  // 4) 機械的に一定な入力間隔
  const intervals = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] > points[i - 1][1]) intervals.push(points[i][0] - points[i - 1][0]);
  }
  if (intervals.length >= limits.MIN_EVENTS_FOR_CV) {
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv < limits.MIN_INTERVAL_CV) {
      return { ok: false, code: 'mechanical', message: '入力の間隔が機械的に一定なため登録できません。' };
    }
  }
  return { ok: true };
}

// 順位の比較。純字数が多い → エラーが少ない → 先に記録した、の順で上位。
export function compareEntries(a, b) {
  if (a.net !== b.net) return b.net - a.net;
  if (a.errorTotal !== b.errorTotal) return a.errorTotal - b.errorTotal;
  return String(a.achievedAt).localeCompare(String(b.achievedAt));
}
