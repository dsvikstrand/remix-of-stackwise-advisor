import { randomUUID } from 'node:crypto';
import type { CandidateGateDecision } from '../gates/types';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeRequiredIso, normalizeStringOrNull } from './oracleValueNormalization';

export type OracleChannelCandidateStatus =
  | 'pending'
  | 'passed'
  | 'pending_manual_review'
  | 'published'
  | 'rejected';

export type OracleChannelCandidateRow = {
  id: string;
  user_feed_item_id: string;
  channel_slug: string;
  status: OracleChannelCandidateStatus;
  submitted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type OracleChannelGateDecisionRow = {
  id: string;
  candidate_id: string;
  gate_id: string;
  outcome: 'pass' | 'warn' | 'block';
  reason_code: string;
  score: number | null;
  policy_version: string;
  method_version: string | null;
  created_at: string;
};

function normalizeRequiredString(value: unknown, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeChannelSlug(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCandidateStatus(value: unknown): OracleChannelCandidateStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'passed') return 'passed';
  if (normalized === 'pending_manual_review') return 'pending_manual_review';
  if (normalized === 'published') return 'published';
  if (normalized === 'rejected') return 'rejected';
  return 'pending';
}

function normalizeGateOutcome(value: unknown): 'pass' | 'warn' | 'block' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'warn') return 'warn';
  if (normalized === 'block') return 'block';
  return 'pass';
}

function normalizeScore(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapChannelCandidateRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleChannelCandidateRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id, randomUUID()),
    user_feed_item_id: normalizeRequiredString(row.user_feed_item_id),
    channel_slug: normalizeChannelSlug(row.channel_slug),
    status: normalizeCandidateStatus(row.status),
    submitted_by_user_id: normalizeRequiredString(row.submitted_by_user_id),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
  };
}

function mapChannelGateDecisionRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleChannelGateDecisionRow {
  return {
    id: normalizeRequiredString(row.id, randomUUID()),
    candidate_id: normalizeRequiredString(row.candidate_id),
    gate_id: normalizeRequiredString(row.gate_id),
    outcome: normalizeGateOutcome(row.outcome),
    reason_code: normalizeRequiredString(row.reason_code),
    score: normalizeScore(row.score),
    policy_version: normalizeRequiredString(row.policy_version, 'bleuv1-gate-policy-v1.0'),
    method_version: normalizeStringOrNull(row.method_version),
    created_at: normalizeRequiredIso(row.created_at, fallbackIso),
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function countOracleChannelCandidateStateRows(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const [candidateRow, decisionRow] = await Promise.all([
    input.controlDb.db
      .selectFrom('channel_candidate_state')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .executeTakeFirst(),
    input.controlDb.db
      .selectFrom('channel_gate_decision_state')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .executeTakeFirst(),
  ]);

  return {
    candidateCount: Number(candidateRow?.count || 0),
    decisionCount: Number(decisionRow?.count || 0),
  };
}

export async function getOracleChannelCandidateById(input: {
  controlDb: OracleControlPlaneDb;
  candidateId: string;
}) {
  const candidateId = normalizeRequiredString(input.candidateId);
  if (!candidateId) return null;

  const row = await input.controlDb.db
    .selectFrom('channel_candidate_state')
    .selectAll()
    .where('id', '=', candidateId)
    .executeTakeFirst();

  return row
    ? mapChannelCandidateRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function getOracleChannelCandidateByFeedChannel(input: {
  controlDb: OracleControlPlaneDb;
  userFeedItemId: string;
  channelSlug: string;
}) {
  const userFeedItemId = normalizeRequiredString(input.userFeedItemId);
  const channelSlug = normalizeChannelSlug(input.channelSlug);
  if (!userFeedItemId || !channelSlug) return null;

  const row = await input.controlDb.db
    .selectFrom('channel_candidate_state')
    .selectAll()
    .where('user_feed_item_id', '=', userFeedItemId)
    .where('channel_slug', '=', channelSlug)
    .executeTakeFirst();

  return row
    ? mapChannelCandidateRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function listOracleChannelCandidateRows(input: {
  controlDb: OracleControlPlaneDb;
  feedItemIds?: string[];
  candidateIds?: string[];
  channelSlug?: string | null;
  statuses?: string[];
  limit?: number;
}) {
  const feedItemIds = [...new Set((input.feedItemIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  const candidateIds = [...new Set((input.candidateIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  const statuses = [...new Set((input.statuses || []).map((value) => normalizeCandidateStatus(value)).filter(Boolean))];
  const channelSlug = normalizeChannelSlug(input.channelSlug);

  let query = input.controlDb.db
    .selectFrom('channel_candidate_state')
    .selectAll();

  if (feedItemIds.length > 0) {
    query = query.where('user_feed_item_id', 'in', feedItemIds);
  }
  if (candidateIds.length > 0) {
    query = query.where('id', 'in', candidateIds);
  }
  if (channelSlug) {
    query = query.where('channel_slug', '=', channelSlug);
  }
  if (statuses.length === 1) {
    query = query.where('status', '=', statuses[0]);
  } else if (statuses.length > 1) {
    query = query.where('status', 'in', statuses);
  }

  const limit = Math.max(1, Math.floor(Number(input.limit || 5000)));
  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();

  return rows.map((row) => mapChannelCandidateRow(row as unknown as Record<string, unknown>));
}

export async function upsertOracleChannelCandidateRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleChannelCandidateRow> & {
    user_feed_item_id: string;
    channel_slug: string;
    submitted_by_user_id: string;
    status?: OracleChannelCandidateStatus;
  };
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const current = input.row.id
    ? await getOracleChannelCandidateById({
        controlDb: input.controlDb,
        candidateId: input.row.id,
      })
    : await getOracleChannelCandidateByFeedChannel({
        controlDb: input.controlDb,
        userFeedItemId: input.row.user_feed_item_id,
        channelSlug: input.row.channel_slug,
      });

  const nextRow = mapChannelCandidateRow({
    id: current?.id || normalizeRequiredString(input.row.id, randomUUID()),
    user_feed_item_id: input.row.user_feed_item_id,
    channel_slug: input.row.channel_slug,
    status: input.row.status || current?.status || 'pending',
    submitted_by_user_id: input.row.submitted_by_user_id || current?.submitted_by_user_id,
    created_at: current?.created_at || input.row.created_at || nowIso,
    updated_at: input.row.updated_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('channel_candidate_state')
    .values({
      id: nextRow.id,
      user_feed_item_id: nextRow.user_feed_item_id,
      channel_slug: nextRow.channel_slug,
      status: nextRow.status,
      submitted_by_user_id: nextRow.submitted_by_user_id,
      created_at: nextRow.created_at,
      updated_at: nextRow.updated_at,
    })
    .onConflict((oc) => oc.column('id').doUpdateSet({
      user_feed_item_id: nextRow.user_feed_item_id,
      channel_slug: nextRow.channel_slug,
      status: nextRow.status,
      submitted_by_user_id: nextRow.submitted_by_user_id,
      updated_at: nextRow.updated_at,
    }))
    .execute();

  return nextRow;
}

export async function updateOracleChannelCandidateStatus(input: {
  controlDb: OracleControlPlaneDb;
  candidateId: string;
  status: OracleChannelCandidateStatus;
  updatedAt?: string;
}) {
  const current = await getOracleChannelCandidateById({
    controlDb: input.controlDb,
    candidateId: input.candidateId,
  });
  if (!current) return null;

  return upsertOracleChannelCandidateRow({
    controlDb: input.controlDb,
    row: {
      ...current,
      status: input.status,
      updated_at: input.updatedAt,
    },
    nowIso: input.updatedAt,
  });
}

export async function listOracleChannelGateDecisions(input: {
  controlDb: OracleControlPlaneDb;
  candidateId: string;
}) {
  const candidateId = normalizeRequiredString(input.candidateId);
  if (!candidateId) return [] as OracleChannelGateDecisionRow[];

  const rows = await input.controlDb.db
    .selectFrom('channel_gate_decision_state')
    .selectAll()
    .where('candidate_id', '=', candidateId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute();

  return rows.map((row) => mapChannelGateDecisionRow(row as unknown as Record<string, unknown>));
}

export async function insertOracleChannelGateDecisionRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Partial<OracleChannelGateDecisionRow> & {
    candidate_id: string;
    gate_id: string;
    outcome: 'pass' | 'warn' | 'block';
    reason_code: string;
  }>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => {
      const candidateId = normalizeRequiredString(row.candidate_id);
      const gateId = normalizeRequiredString(row.gate_id);
      if (!candidateId || !gateId) return null;
      return mapChannelGateDecisionRow({
        id: normalizeRequiredString(row.id, randomUUID()),
        candidate_id: candidateId,
        gate_id: gateId,
        outcome: row.outcome,
        reason_code: row.reason_code,
        score: row.score ?? null,
        policy_version: row.policy_version || 'bleuv1-gate-policy-v1.0',
        method_version: row.method_version ?? null,
        created_at: row.created_at || nowIso,
      }, nowIso);
    })
    .filter((row): row is OracleChannelGateDecisionRow => Boolean(row));

  for (const chunk of chunkArray(rows, 100)) {
    await input.controlDb.db
      .insertInto('channel_gate_decision_state')
      .values(chunk)
      .execute();
  }

  return rows;
}

export async function syncOracleChannelCandidateStateFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  batchSize?: number;
}) {
  const batchSize = Math.max(50, Math.min(1000, Math.floor(Number(input.batchSize || 250))));
  const candidates: OracleChannelCandidateRow[] = [];
  const candidateIds: string[] = [];
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await input.db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapChannelCandidateRow(row as unknown as Record<string, unknown>);
      if (!mapped.id || !mapped.user_feed_item_id || !mapped.channel_slug || !mapped.submitted_by_user_id) continue;
      candidates.push(mapped);
      candidateIds.push(mapped.id);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(candidates, 100)) {
    for (const row of chunk) {
      await upsertOracleChannelCandidateRow({
        controlDb: input.controlDb,
        row,
        nowIso: row.updated_at,
      });
    }
  }

  const decisions: OracleChannelGateDecisionRow[] = [];
  from = 0;
  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await input.db
      .from('channel_gate_decisions')
      .select('id, candidate_id, gate_id, outcome, reason_code, score, policy_version, method_version, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapChannelGateDecisionRow(row as unknown as Record<string, unknown>);
      if (!mapped.id || !mapped.candidate_id || !candidateIds.includes(mapped.candidate_id)) continue;
      decisions.push(mapped);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(decisions, 100)) {
    await insertOracleChannelGateDecisionRows({
      controlDb: input.controlDb,
      rows: chunk,
    });
  }

  return {
    candidateCount: candidates.length,
    decisionCount: decisions.length,
  };
}

export function mapChannelGateDecisionRowsFromEvaluation(input: {
  candidateId: string;
  decisions: CandidateGateDecision[];
}) {
  const candidateId = normalizeRequiredString(input.candidateId);
  return (input.decisions || []).map((decision) => ({
    candidate_id: candidateId,
    gate_id: decision.gate_id,
    outcome: decision.outcome,
    reason_code: decision.reason_code,
    score: decision.score ?? null,
    policy_version: 'bleuv1-gate-policy-v1.0',
    method_version: decision.method_version || 'gate-v1',
  }));
}
