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

type SubscriptionLedgerStateTable = {
  id: string;
  user_id: string;
  source_type: string;
  source_channel_id: string | null;
  source_channel_url: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  mode: string | null;
  auto_unlock_enabled: number;
  is_active: number;
  last_polled_at: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type UnlockLedgerStateTable = {
  id: string;
  source_item_id: string;
  source_page_id: string | null;
  status: string;
  estimated_cost: number;
  reserved_by_user_id: string | null;
  reservation_expires_at: string | null;
  reserved_ledger_id: string | null;
  auto_unlock_intent_id: string | null;
  blueprint_id: string | null;
  job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  transcript_status: string | null;
  transcript_attempt_count: number;
  transcript_no_caption_hits: number;
  transcript_last_probe_at: string | null;
  transcript_retry_after: string | null;
  transcript_probe_meta_json: string | null;
  created_at: string;
  updated_at: string;
};

type ProductSubscriptionStateTable = {
  id: string;
  user_id: string;
  source_type: string;
  source_channel_id: string | null;
  source_channel_url: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  mode: string | null;
  auto_unlock_enabled: number;
  is_active: number;
  last_polled_at: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type ProductSourceItemStateTable = {
  id: string;
  source_type: string | null;
  source_native_id: string | null;
  canonical_key: string | null;
  source_url: string | null;
  title: string | null;
  published_at: string | null;
  ingest_status: string | null;
  source_channel_id: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  thumbnail_url: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

type ProductUnlockStateTable = {
  id: string;
  source_item_id: string;
  source_page_id: string | null;
  status: string;
  estimated_cost: number;
  reserved_by_user_id: string | null;
  reservation_expires_at: string | null;
  reserved_ledger_id: string | null;
  auto_unlock_intent_id: string | null;
  blueprint_id: string | null;
  job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  transcript_status: string | null;
  transcript_attempt_count: number;
  transcript_no_caption_hits: number;
  transcript_last_probe_at: string | null;
  transcript_retry_after: string | null;
  transcript_probe_meta_json: string | null;
  created_at: string;
  updated_at: string;
};

type FeedLedgerStateTable = {
  id: string;
  user_id: string;
  source_item_id: string | null;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  generated_at_on_wall: string | null;
  created_at: string;
  updated_at: string;
};

type SourceItemLedgerStateTable = {
  id: string;
  source_type: string | null;
  source_native_id: string | null;
  canonical_key: string | null;
  source_url: string | null;
  title: string | null;
  published_at: string | null;
  ingest_status: string | null;
  source_channel_id: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  thumbnail_url: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

type GenerationVariantStateTable = {
  id: string;
  source_item_id: string;
  generation_tier: string;
  status: string;
  blueprint_id: string | null;
  active_job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type GenerationRunStateTable = {
  id: string;
  run_id: string;
  user_id: string;
  blueprint_id: string | null;
  source_scope: string | null;
  source_tag: string | null;
  video_id: string | null;
  video_url: string | null;
  status: string;
  model_primary: string | null;
  model_used: string | null;
  fallback_used: number | null;
  fallback_model: string | null;
  reasoning_effort: string | null;
  quality_ok: number | null;
  quality_issues_json: string | null;
  quality_retries_used: number | null;
  quality_final_mode: string | null;
  trace_version: string | null;
  summary_json: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type GenerationRunEventStateTable = {
  id: number;
  run_id: string;
  seq: number;
  level: string;
  event: string;
  payload_json: string | null;
  created_at: string;
};

type BlueprintYoutubeCommentStateTable = {
  id: string;
  blueprint_id: string;
  youtube_video_id: string;
  sort_mode: string;
  source_comment_id: string;
  display_order: number;
  author_name: string | null;
  author_avatar_url: string | null;
  content: string;
  published_at: string | null;
  like_count: number | null;
  created_at: string;
  updated_at: string;
};

type BlueprintTagStateTable = {
  id: string;
  blueprint_id: string;
  tag_id: string;
  tag_slug: string;
  created_at: string;
  updated_at: string;
};

type ProviderCircuitStateTable = {
  provider_key: string;
  state: string;
  opened_at: string | null;
  cooldown_until: string | null;
  failure_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationStateTable = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_path: string | null;
  metadata_json: string;
  is_read: number;
  read_at: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
};

type CreditWalletStateTable = {
  user_id: string;
  balance: number;
  capacity: number;
  refill_rate_per_sec: number;
  last_refill_at: string;
  created_at: string;
  updated_at: string;
};

type CreditLedgerStateTable = {
  id: string;
  user_id: string;
  delta: number;
  entry_type: string;
  reason_code: string;
  source_item_id: string | null;
  source_page_id: string | null;
  unlock_id: string | null;
  idempotency_key: string;
  metadata_json: string;
  created_at: string;
};

type ChannelCandidateStateTable = {
  id: string;
  user_feed_item_id: string;
  channel_slug: string;
  status: string;
  submitted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type ChannelGateDecisionStateTable = {
  id: string;
  candidate_id: string;
  gate_id: string;
  outcome: string;
  reason_code: string;
  score: number | null;
  policy_version: string;
  method_version: string | null;
  created_at: string;
};

type ProductFeedStateTable = {
  id: string;
  user_id: string;
  source_item_id: string | null;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  generated_at_on_wall: string | null;
  created_at: string;
  updated_at: string;
};

type BlueprintCommentStateTable = {
  id: string;
  blueprint_id: string;
  user_id: string;
  content: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
};

type BlueprintLikeStateTable = {
  id: string;
  blueprint_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

type BlueprintStateTable = {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  sections_json: string | null;
  mix_notes: string | null;
  review_prompt: string | null;
  banner_url: string | null;
  llm_review: string | null;
  preview_summary: string | null;
  is_public: number;
  likes_count: number;
  source_blueprint_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileStateTable = {
  user_id: string;
  profile_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: number;
  follower_count: number;
  following_count: number;
  unlocked_blueprints_count: number;
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
  subscription_ledger_state: SubscriptionLedgerStateTable;
  unlock_ledger_state: UnlockLedgerStateTable;
  feed_ledger_state: FeedLedgerStateTable;
  source_item_ledger_state: SourceItemLedgerStateTable;
  generation_variant_state: GenerationVariantStateTable;
  generation_run_state: GenerationRunStateTable;
  generation_run_event_state: GenerationRunEventStateTable;
  blueprint_youtube_comment_state: BlueprintYoutubeCommentStateTable;
  blueprint_comment_state: BlueprintCommentStateTable;
  blueprint_like_state: BlueprintLikeStateTable;
  blueprint_state: BlueprintStateTable;
  blueprint_tag_state: BlueprintTagStateTable;
  profile_state: ProfileStateTable;
  provider_circuit_state: ProviderCircuitStateTable;
  notification_state: NotificationStateTable;
  credit_wallet_state: CreditWalletStateTable;
  credit_ledger_state: CreditLedgerStateTable;
  channel_candidate_state: ChannelCandidateStateTable;
  channel_gate_decision_state: ChannelGateDecisionStateTable;
  product_subscription_state: ProductSubscriptionStateTable;
  product_source_item_state: ProductSourceItemStateTable;
  product_unlock_state: ProductUnlockStateTable;
  product_feed_state: ProductFeedStateTable;
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

CREATE TABLE IF NOT EXISTS subscription_ledger_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_channel_id TEXT,
  source_channel_url TEXT,
  source_channel_title TEXT,
  source_page_id TEXT,
  mode TEXT,
  auto_unlock_enabled INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  last_polled_at TEXT,
  last_seen_published_at TEXT,
  last_seen_video_id TEXT,
  last_sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_ledger_user_source_unique
  ON subscription_ledger_state (user_id, source_type, source_channel_id);

CREATE INDEX IF NOT EXISTS idx_subscription_ledger_user_updated
  ON subscription_ledger_state (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_subscription_ledger_user_active_updated
  ON subscription_ledger_state (user_id, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_subscription_ledger_user_page_updated
  ON subscription_ledger_state (user_id, source_page_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_subscription_ledger_page_active_updated
  ON subscription_ledger_state (source_page_id, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_subscription_ledger_channel_active_updated
  ON subscription_ledger_state (source_channel_id, is_active, updated_at);

CREATE TABLE IF NOT EXISTS unlock_ledger_state (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  source_page_id TEXT,
  status TEXT NOT NULL,
  estimated_cost REAL NOT NULL DEFAULT 0,
  reserved_by_user_id TEXT,
  reservation_expires_at TEXT,
  reserved_ledger_id TEXT,
  auto_unlock_intent_id TEXT,
  blueprint_id TEXT,
  job_id TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  transcript_status TEXT,
  transcript_attempt_count INTEGER NOT NULL DEFAULT 0,
  transcript_no_caption_hits INTEGER NOT NULL DEFAULT 0,
  transcript_last_probe_at TEXT,
  transcript_retry_after TEXT,
  transcript_probe_meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unlock_ledger_source_item_unique
  ON unlock_ledger_state (source_item_id);

CREATE INDEX IF NOT EXISTS idx_unlock_ledger_status_updated
  ON unlock_ledger_state (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_unlock_ledger_status_reservation
  ON unlock_ledger_state (status, reservation_expires_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_unlock_ledger_job_updated
  ON unlock_ledger_state (job_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_unlock_ledger_page_updated
  ON unlock_ledger_state (source_page_id, updated_at);

CREATE TABLE IF NOT EXISTS feed_ledger_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_item_id TEXT,
  blueprint_id TEXT,
  state TEXT NOT NULL,
  last_decision_code TEXT,
  generated_at_on_wall TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_ledger_user_created
  ON feed_ledger_state (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_feed_ledger_user_source_created
  ON feed_ledger_state (user_id, source_item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_feed_ledger_blueprint_created
  ON feed_ledger_state (blueprint_id, created_at);

CREATE INDEX IF NOT EXISTS idx_feed_ledger_state_created
  ON feed_ledger_state (state, created_at);

CREATE TABLE IF NOT EXISTS source_item_ledger_state (
  id TEXT PRIMARY KEY,
  source_type TEXT,
  source_native_id TEXT,
  canonical_key TEXT,
  source_url TEXT,
  title TEXT,
  published_at TEXT,
  ingest_status TEXT,
  source_channel_id TEXT,
  source_channel_title TEXT,
  source_page_id TEXT,
  thumbnail_url TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_item_ledger_canonical_unique
  ON source_item_ledger_state (canonical_key);

CREATE INDEX IF NOT EXISTS idx_source_item_ledger_native_updated
  ON source_item_ledger_state (source_native_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_source_item_ledger_page_updated
  ON source_item_ledger_state (source_page_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_source_item_ledger_updated
  ON source_item_ledger_state (updated_at);

CREATE TABLE IF NOT EXISTS generation_variant_state (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  generation_tier TEXT NOT NULL,
  status TEXT NOT NULL,
  blueprint_id TEXT,
  active_job_id TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_variant_source_tier_unique
  ON generation_variant_state (source_item_id, generation_tier);

CREATE INDEX IF NOT EXISTS idx_generation_variant_blueprint
  ON generation_variant_state (blueprint_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_generation_variant_status_updated
  ON generation_variant_state (status, updated_at);

CREATE TABLE IF NOT EXISTS generation_run_state (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  blueprint_id TEXT,
  source_scope TEXT,
  source_tag TEXT,
  video_id TEXT,
  video_url TEXT,
  status TEXT NOT NULL,
  model_primary TEXT,
  model_used TEXT,
  fallback_used INTEGER,
  fallback_model TEXT,
  reasoning_effort TEXT,
  quality_ok INTEGER,
  quality_issues_json TEXT,
  quality_retries_used INTEGER,
  quality_final_mode TEXT,
  trace_version TEXT,
  summary_json TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_run_run_id_unique
  ON generation_run_state (run_id);

CREATE INDEX IF NOT EXISTS idx_generation_run_blueprint_created
  ON generation_run_state (blueprint_id, created_at);

CREATE INDEX IF NOT EXISTS idx_generation_run_video_status_updated
  ON generation_run_state (video_id, status, updated_at);

CREATE TABLE IF NOT EXISTS generation_run_event_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_run_event_run_seq_unique
  ON generation_run_event_state (run_id, seq);

CREATE INDEX IF NOT EXISTS idx_generation_run_event_run_id_desc
  ON generation_run_event_state (run_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_generation_run_event_created_desc
  ON generation_run_event_state (created_at DESC);

CREATE TABLE IF NOT EXISTS blueprint_youtube_comment_state (
  id TEXT PRIMARY KEY,
  blueprint_id TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  sort_mode TEXT NOT NULL,
  source_comment_id TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  author_name TEXT,
  author_avatar_url TEXT,
  content TEXT NOT NULL,
  published_at TEXT,
  like_count INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_youtube_comment_unique
  ON blueprint_youtube_comment_state (blueprint_id, sort_mode, source_comment_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_youtube_comment_display
  ON blueprint_youtube_comment_state (blueprint_id, sort_mode, display_order, id);

CREATE TABLE IF NOT EXISTS blueprint_comment_state (
  id TEXT PRIMARY KEY,
  blueprint_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blueprint_comment_state_blueprint_created
  ON blueprint_comment_state (blueprint_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_blueprint_comment_state_blueprint_likes_created
  ON blueprint_comment_state (blueprint_id, likes_count DESC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_blueprint_comment_state_user_created
  ON blueprint_comment_state (user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS blueprint_like_state (
  id TEXT PRIMARY KEY,
  blueprint_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_like_state_blueprint_user_unique
  ON blueprint_like_state (blueprint_id, user_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_like_state_user_created
  ON blueprint_like_state (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_blueprint_like_state_blueprint_created
  ON blueprint_like_state (blueprint_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS blueprint_state (
  id TEXT PRIMARY KEY,
  inventory_id TEXT,
  creator_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sections_json TEXT,
  mix_notes TEXT,
  review_prompt TEXT,
  banner_url TEXT,
  llm_review TEXT,
  preview_summary TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  source_blueprint_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blueprint_state_creator_created
  ON blueprint_state (creator_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_blueprint_state_public_created
  ON blueprint_state (is_public, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS profile_state (
  user_id TEXT PRIMARY KEY,
  profile_id TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  follower_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  unlocked_blueprints_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_state_public_updated
  ON profile_state (is_public, updated_at DESC, user_id);

CREATE TABLE IF NOT EXISTS blueprint_tag_state (
  id TEXT PRIMARY KEY,
  blueprint_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  tag_slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_tag_state_blueprint_tag_unique
  ON blueprint_tag_state (blueprint_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_tag_state_blueprint_slug
  ON blueprint_tag_state (blueprint_id, tag_slug);

CREATE INDEX IF NOT EXISTS idx_blueprint_tag_state_slug
  ON blueprint_tag_state (tag_slug, updated_at);

CREATE TABLE IF NOT EXISTS provider_circuit_state (
  provider_key TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  opened_at TEXT,
  cooldown_until TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_circuit_state_state
  ON provider_circuit_state (state, updated_at);

CREATE INDEX IF NOT EXISTS idx_provider_circuit_state_cooldown
  ON provider_circuit_state (cooldown_until, updated_at);

CREATE TABLE IF NOT EXISTS notification_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link_path TEXT,
  metadata_json TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  dedupe_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_state_user_dedupe
  ON notification_state (user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notification_state_user_created
  ON notification_state (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notification_state_user_read_created
  ON notification_state (user_id, is_read, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS credit_wallet_state (
  user_id TEXT PRIMARY KEY,
  balance REAL NOT NULL,
  capacity REAL NOT NULL,
  refill_rate_per_sec REAL NOT NULL DEFAULT 0,
  last_refill_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_wallet_state_updated
  ON credit_wallet_state (updated_at);

CREATE INDEX IF NOT EXISTS idx_credit_wallet_state_last_refill
  ON credit_wallet_state (last_refill_at, updated_at);

CREATE TABLE IF NOT EXISTS credit_ledger_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta REAL NOT NULL,
  entry_type TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  source_item_id TEXT,
  source_page_id TEXT,
  unlock_id TEXT,
  idempotency_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_state_idempotency
  ON credit_ledger_state (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_state_user_created
  ON credit_ledger_state (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_state_unlock_created
  ON credit_ledger_state (unlock_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS channel_candidate_state (
  id TEXT PRIMARY KEY,
  user_feed_item_id TEXT NOT NULL,
  channel_slug TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_candidate_state_feed_channel
  ON channel_candidate_state (user_feed_item_id, channel_slug);

CREATE INDEX IF NOT EXISTS idx_channel_candidate_state_status_created
  ON channel_candidate_state (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_channel_candidate_state_feed_created
  ON channel_candidate_state (user_feed_item_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS channel_gate_decision_state (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  score REAL,
  policy_version TEXT NOT NULL,
  method_version TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_gate_decision_state_candidate_created
  ON channel_gate_decision_state (candidate_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS product_subscription_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_channel_id TEXT,
  source_channel_url TEXT,
  source_channel_title TEXT,
  source_page_id TEXT,
  mode TEXT,
  auto_unlock_enabled INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  last_polled_at TEXT,
  last_seen_published_at TEXT,
  last_seen_video_id TEXT,
  last_sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_subscription_user_page
  ON product_subscription_state (user_id, source_page_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_product_subscription_user_channel
  ON product_subscription_state (user_id, source_channel_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_product_subscription_page_active
  ON product_subscription_state (source_page_id, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_product_subscription_channel_active
  ON product_subscription_state (source_channel_id, is_active, updated_at);

CREATE TABLE IF NOT EXISTS product_source_item_state (
  id TEXT PRIMARY KEY,
  source_type TEXT,
  source_native_id TEXT,
  canonical_key TEXT,
  source_url TEXT,
  title TEXT,
  published_at TEXT,
  ingest_status TEXT,
  source_channel_id TEXT,
  source_channel_title TEXT,
  source_page_id TEXT,
  thumbnail_url TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_source_item_native
  ON product_source_item_state (source_native_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_product_source_item_page
  ON product_source_item_state (source_page_id, updated_at);

CREATE TABLE IF NOT EXISTS product_unlock_state (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  source_page_id TEXT,
  status TEXT NOT NULL,
  estimated_cost REAL NOT NULL DEFAULT 0,
  reserved_by_user_id TEXT,
  reservation_expires_at TEXT,
  reserved_ledger_id TEXT,
  auto_unlock_intent_id TEXT,
  blueprint_id TEXT,
  job_id TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  transcript_status TEXT,
  transcript_attempt_count INTEGER NOT NULL DEFAULT 0,
  transcript_no_caption_hits INTEGER NOT NULL DEFAULT 0,
  transcript_last_probe_at TEXT,
  transcript_retry_after TEXT,
  transcript_probe_meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_unlock_source_item
  ON product_unlock_state (source_item_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_product_unlock_job
  ON product_unlock_state (job_id, updated_at);

CREATE TABLE IF NOT EXISTS product_feed_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_item_id TEXT,
  blueprint_id TEXT,
  state TEXT NOT NULL,
  last_decision_code TEXT,
  generated_at_on_wall TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_feed_user_created
  ON product_feed_state (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_product_feed_user_source_created
  ON product_feed_state (user_id, source_item_id, created_at);
`;

function ensureSqliteColumn(input: {
  sqlite: BetterSqlite3.Database;
  tableName: string;
  columnName: string;
  columnSql: string;
}) {
  const rows = input.sqlite.prepare(`PRAGMA table_info(${input.tableName})`).all() as Array<{ name?: string }>;
  const exists = rows.some((row) => String(row?.name || '').trim() === input.columnName);
  if (exists) return;
  input.sqlite.exec(`ALTER TABLE ${input.tableName} ADD COLUMN ${input.columnSql}`);
}

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
  ensureSqliteColumn({
    sqlite,
    tableName: 'feed_ledger_state',
    columnName: 'generated_at_on_wall',
    columnSql: 'generated_at_on_wall TEXT',
  });
  ensureSqliteColumn({
    sqlite,
    tableName: 'product_feed_state',
    columnName: 'generated_at_on_wall',
    columnSql: 'generated_at_on_wall TEXT',
  });

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
