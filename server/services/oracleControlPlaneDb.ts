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

type JobActivityStateTable = {
  job_id: string;
  scope_key: string;
  user_key: string;
  status: string;
  trigger_key: string | null;
  subscription_id: string | null;
  trace_id: string | null;
  payload_json: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  next_run_at: string | null;
  lease_expires_at: string | null;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
};

type QueueLedgerStateTable = {
  id: string;
  trigger: string;
  scope: string;
  status: string;
  requested_by_user_id: string | null;
  subscription_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  worker_id: string | null;
  trace_id: string | null;
  payload_json: string | null;
  created_at: string;
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
  job_activity_state: JobActivityStateTable;
  queue_ledger_state: QueueLedgerStateTable;
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

CREATE TABLE IF NOT EXISTS job_activity_state (
  job_id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  user_key TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_key TEXT,
  subscription_id TEXT,
  trace_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  next_run_at TEXT,
  lease_expires_at TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_activity_user_scope_created
  ON job_activity_state (user_key, scope_key, created_at);

CREATE INDEX IF NOT EXISTS idx_job_activity_user_scope_status
  ON job_activity_state (user_key, scope_key, status, created_at);

CREATE INDEX IF NOT EXISTS idx_job_activity_scope_status_started
  ON job_activity_state (scope_key, status, started_at);

CREATE TABLE IF NOT EXISTS queue_ledger_state (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by_user_id TEXT,
  subscription_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_run_at TEXT NOT NULL,
  lease_expires_at TEXT,
  last_heartbeat_at TEXT,
  worker_id TEXT,
  trace_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_ledger_status_next_run
  ON queue_ledger_state (status, next_run_at, created_at);

CREATE INDEX IF NOT EXISTS idx_queue_ledger_scope_status_next_run
  ON queue_ledger_state (scope, status, next_run_at, created_at);

CREATE INDEX IF NOT EXISTS idx_queue_ledger_lease_expires
  ON queue_ledger_state (lease_expires_at);
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
