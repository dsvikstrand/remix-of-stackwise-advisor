import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

type ControlMetaTable = {
  key: string;
  value_json: string;
  updated_at: string;
};

type SubscriptionScheduleStateTable = {
  subscription_id: string;
  user_id: string;
  source_channel_id: string;
  active: number;
  priority_tier: string;
  next_due_at: string;
  last_checked_at: string | null;
  last_completed_at: string | null;
  last_result_code: string | null;
  consecutive_noop_count: number;
  consecutive_error_count: number;
  starvation_score: number;
  scheduler_notes_json: string | null;
  created_at: string;
  updated_at: string;
};

type ScopeControlStateTable = {
  scope: string;
  scheduler_enabled: number;
  last_triggered_at: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  min_interval_until: string | null;
  suppression_until: string | null;
  last_decision_code: string | null;
  last_queue_depth: number | null;
  last_result_summary_json: string | null;
  updated_at: string;
};

type ScopeAdmissionWindowsTable = {
  window_key: string;
  scope: string;
  decision_code: string;
  effective_until: string;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
};

type QueueClaimControlStateTable = {
  claim_key: string;
  priority_tier: string;
  scope_key: string;
  next_allowed_claim_at: string | null;
  last_attempted_at: string | null;
  last_claimed_at: string | null;
  consecutive_empty_claims: number;
  last_claimed_count: number;
  updated_at: string;
};

type QueueSweepControlStateTable = {
  sweep_key: string;
  priority_tier: string;
  scope_key: string;
  next_due_at: string | null;
  last_attempted_at: string | null;
  last_claimed_at: string | null;
  consecutive_empty_sweeps: number;
  last_claimed_count: number;
  last_batch_size: number;
  inflight_until: string | null;
  updated_at: string;
};

type QueueAdmissionCountStateTable = {
  count_key: string;
  scope_key: string;
  user_key: string;
  active_count: number;
  updated_at: string;
};

export type OracleControlPlaneDatabase = {
  control_meta: ControlMetaTable;
  subscription_schedule_state: SubscriptionScheduleStateTable;
  scope_control_state: ScopeControlStateTable;
  scope_admission_windows: ScopeAdmissionWindowsTable;
  queue_claim_control_state: QueueClaimControlStateTable;
  queue_sweep_control_state: QueueSweepControlStateTable;
  queue_admission_count_state: QueueAdmissionCountStateTable;
};

export type OracleControlPlaneDb = {
  sqlitePath: string;
  sqlite: BetterSqlite3.Database;
  db: Kysely<OracleControlPlaneDatabase>;
  close: () => Promise<void>;
};

const CONTROL_PLANE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS control_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_schedule_state (
  subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_channel_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  priority_tier TEXT NOT NULL DEFAULT 'normal',
  next_due_at TEXT NOT NULL,
  last_checked_at TEXT,
  last_completed_at TEXT,
  last_result_code TEXT,
  consecutive_noop_count INTEGER NOT NULL DEFAULT 0,
  consecutive_error_count INTEGER NOT NULL DEFAULT 0,
  starvation_score INTEGER NOT NULL DEFAULT 0,
  scheduler_notes_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_schedule_due
  ON subscription_schedule_state (next_due_at);

CREATE INDEX IF NOT EXISTS idx_subscription_schedule_priority_due
  ON subscription_schedule_state (priority_tier, next_due_at);

CREATE INDEX IF NOT EXISTS idx_subscription_schedule_channel
  ON subscription_schedule_state (source_channel_id);

CREATE TABLE IF NOT EXISTS scope_control_state (
  scope TEXT PRIMARY KEY,
  scheduler_enabled INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  last_started_at TEXT,
  last_finished_at TEXT,
  last_success_at TEXT,
  min_interval_until TEXT,
  suppression_until TEXT,
  last_decision_code TEXT,
  last_queue_depth INTEGER,
  last_result_summary_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scope_admission_windows (
  window_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  decision_code TEXT NOT NULL,
  effective_until TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scope_admission_scope_until
  ON scope_admission_windows (scope, effective_until);

CREATE TABLE IF NOT EXISTS queue_claim_control_state (
  claim_key TEXT PRIMARY KEY,
  priority_tier TEXT NOT NULL DEFAULT 'medium',
  scope_key TEXT NOT NULL,
  next_allowed_claim_at TEXT,
  last_attempted_at TEXT,
  last_claimed_at TEXT,
  consecutive_empty_claims INTEGER NOT NULL DEFAULT 0,
  last_claimed_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_claim_next_allowed
  ON queue_claim_control_state (next_allowed_claim_at);

CREATE TABLE IF NOT EXISTS queue_sweep_control_state (
  sweep_key TEXT PRIMARY KEY,
  priority_tier TEXT NOT NULL DEFAULT 'medium',
  scope_key TEXT NOT NULL,
  next_due_at TEXT,
  last_attempted_at TEXT,
  last_claimed_at TEXT,
  consecutive_empty_sweeps INTEGER NOT NULL DEFAULT 0,
  last_claimed_count INTEGER NOT NULL DEFAULT 0,
  last_batch_size INTEGER NOT NULL DEFAULT 0,
  inflight_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_sweep_next_due
  ON queue_sweep_control_state (next_due_at);

CREATE INDEX IF NOT EXISTS idx_queue_sweep_inflight
  ON queue_sweep_control_state (inflight_until);

CREATE TABLE IF NOT EXISTS queue_admission_count_state (
  count_key TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  user_key TEXT NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_admission_scope_user
  ON queue_admission_count_state (scope_key, user_key);
`;

export function openOracleControlPlaneDb(input: {
  sqlitePath: string;
}): OracleControlPlaneDb {
  const sqlitePath = path.resolve(String(input.sqlitePath || '').trim());
  const sqliteDir = path.dirname(sqlitePath);
  fs.mkdirSync(sqliteDir, { recursive: true });

  const sqlite = new BetterSqlite3(sqlitePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(CONTROL_PLANE_SCHEMA_SQL);

  const db = new Kysely<OracleControlPlaneDatabase>({
    dialect: new SqliteDialect({
      database: sqlite,
    }),
  });

  return {
    sqlitePath,
    sqlite,
    db,
    async close() {
      await db.destroy();
      sqlite.close();
    },
  };
}
