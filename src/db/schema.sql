CREATE TABLE IF NOT EXISTS races (
  race_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  track TEXT NOT NULL,
  number INTEGER NOT NULL,
  scheduled_at TEXT
);

CREATE TABLE IF NOT EXISTS entries (
  race_id TEXT NOT NULL,
  lane INTEGER NOT NULL,
  reg_id INTEGER,
  player TEXT,
  grade TEXT,
  age INTEGER,
  national_win REAL,
  local_win REAL,
  avg_st REAL,
  motor_no INTEGER,
  motor_rate REAL,
  boat_no INTEGER,
  boat_rate REAL,
  weight REAL,
  tilt REAL,
  style TEXT,
  past_in TEXT,
  PRIMARY KEY (race_id, lane)
);

CREATE INDEX IF NOT EXISTS idx_entries_race ON entries (race_id);

CREATE TABLE IF NOT EXISTS exhibitions (
  race_id TEXT NOT NULL,
  lane INTEGER NOT NULL,
  tenji_time REAL,
  weight REAL,
  tilt REAL,
  parts TEXT,
  start_order TEXT,
  start_st TEXT,
  comment TEXT,
  PRIMARY KEY (race_id,lane)
);

CREATE TABLE IF NOT EXISTS conditions (
  race_id TEXT PRIMARY KEY,
  weather TEXT,
  wind_dir TEXT,
  wind_ms REAL,
  wave REAL,
  temp REAL,
  water_temp REAL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS odds_trifecta (
  race_id TEXT NOT NULL,
  comb TEXT NOT NULL,
  odds REAL,
  captured_at TEXT NOT NULL,
  PRIMARY KEY (race_id,comb,captured_at)
);

CREATE TABLE IF NOT EXISTS results (
  race_id TEXT NOT NULL,
  lane INTEGER NOT NULL,
  finish INTEGER,
  st REAL,
  disq TEXT,
  PRIMARY KEY (race_id,lane)
);

CREATE TABLE IF NOT EXISTS payouts (
  race_id TEXT PRIMARY KEY,
  trifecta_comb TEXT,
  trifecta_pay REAL,
  kimarite TEXT
);




