-- ランキングの登録（1端末・1期間につき1件。より良い記録のときだけ記録を上書き）
CREATE TABLE IF NOT EXISTS entries (
  challenge_id TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  net          INTEGER NOT NULL,
  error_total  INTEGER NOT NULL,
  accuracy     INTEGER NOT NULL,
  input_chars  INTEGER NOT NULL,
  achieved_at  TEXT NOT NULL,   -- 今の記録を出した日時（同点時は早い方が上位）
  updated_at   TEXT NOT NULL,
  submit_count INTEGER NOT NULL DEFAULT 1,
  hidden       INTEGER NOT NULL DEFAULT 0,  -- 1 にするとランキングに表示しない（管理者が不適切な登録を隠す用）
  PRIMARY KEY (challenge_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_entries_rank ON entries (challenge_id, hidden, net DESC, error_total ASC, achieved_at ASC);

-- 送信の記録（受け付けなかったものも含む）。速度判定の基準を見直すときに使う。入力内容そのものは保存しない。
CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  accepted     INTEGER NOT NULL,
  code         TEXT NOT NULL,
  input_chars  INTEGER,
  net          INTEGER,
  error_total  INTEGER,
  client_net   INTEGER  -- ブラウザ側で計算した純字数（サーバーの再採点と比べる確認用）
);
CREATE INDEX IF NOT EXISTS idx_submissions_client ON submissions (client_id, id);
