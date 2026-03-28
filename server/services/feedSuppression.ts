import { createUnlockTraceId, logUnlockEvent } from './unlockTrace';

type DbClient = {
  from: (tableName: string) => any;
};

const SUPPRESSIBLE_FEED_STATES = ['my_feed_unlockable', 'my_feed_unlocking'] as const;
const DEFAULT_SUPPRESSION_CHUNK_SIZE = 200;
export const FEED_SUPPRESSION_DEDUPE_WINDOW_MS = Math.max(
  30_000,
  Math.min(60 * 60_000, Math.floor(Number(process.env.FEED_SUPPRESSION_DEDUPE_WINDOW_MS || 30 * 60_000) || 30 * 60_000)),
);
const recentSuppressionAttempts = new Map<string, number>();

function normalizeSourceItemIds(sourceItemIds: readonly string[]) {
  return [...new Set(
    sourceItemIds
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function chunkSourceItemIds(sourceItemIds: readonly string[], chunkSize = DEFAULT_SUPPRESSION_CHUNK_SIZE) {
  const normalizedChunkSize = Math.max(1, Math.floor(Number(chunkSize) || DEFAULT_SUPPRESSION_CHUNK_SIZE));
  const chunks: string[][] = [];
  for (let i = 0; i < sourceItemIds.length; i += normalizedChunkSize) {
    chunks.push(sourceItemIds.slice(i, i + normalizedChunkSize));
  }
  return chunks;
}

function buildSuppressionKey(sourceItemId: string, decisionCode: string) {
  return `${sourceItemId}::${decisionCode}`;
}

function pruneRecentSuppressionAttempts(nowMs: number) {
  const cutoff = nowMs - FEED_SUPPRESSION_DEDUPE_WINDOW_MS;
  for (const [key, seenAtMs] of recentSuppressionAttempts.entries()) {
    if (seenAtMs <= cutoff) {
      recentSuppressionAttempts.delete(key);
    }
  }
}

function filterRecentlySuppressedSourceItemIds(
  sourceItemIds: readonly string[],
  decisionCode: string,
  nowMs: number,
) {
  pruneRecentSuppressionAttempts(nowMs);
  return sourceItemIds.filter((sourceItemId) => {
    const lastAttemptAtMs = recentSuppressionAttempts.get(buildSuppressionKey(sourceItemId, decisionCode)) || 0;
    return nowMs - lastAttemptAtMs >= FEED_SUPPRESSION_DEDUPE_WINDOW_MS;
  });
}

function markRecentSuppressionAttempts(
  sourceItemIds: readonly string[],
  decisionCode: string,
  nowMs: number,
) {
  for (const sourceItemId of sourceItemIds) {
    recentSuppressionAttempts.set(buildSuppressionKey(sourceItemId, decisionCode), nowMs);
  }
}

export function resetFeedSuppressionRuntimeStateForTests() {
  recentSuppressionAttempts.clear();
}

export async function suppressUnlockableFeedRowsForSourceItem(
  db: DbClient,
  input: {
    sourceItemId: string;
    decisionCode: string;
    traceId?: string;
    sourceChannelId?: string | null;
    videoId?: string | null;
  },
) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) return 0;
  const decisionCode = String(input.decisionCode || 'TRANSCRIPT_BLOCKED').slice(0, 120);
  const nowMs = Date.now();
  const sourceItemIds = filterRecentlySuppressedSourceItemIds([sourceItemId], decisionCode, nowMs);
  if (sourceItemIds.length === 0) return 0;

  const { count, error } = await db
    .from('user_feed_items')
    .update({
      state: 'my_feed_skipped',
      last_decision_code: decisionCode,
    })
    .eq('source_item_id', sourceItemId)
    .is('blueprint_id', null)
    .in('state', [...SUPPRESSIBLE_FEED_STATES])
    .select('id', { head: true, count: 'exact' });
  if (error) throw error;
  markRecentSuppressionAttempts(sourceItemIds, decisionCode, nowMs);

  const hiddenCount = Math.max(0, Number(count) || 0);
  if (hiddenCount > 0) {
    logUnlockEvent(
      'auto_transcript_hidden_feed_row',
      {
        trace_id: String(input.traceId || '').trim() || createUnlockTraceId(),
        source_item_id: sourceItemId,
      },
      {
        decision_code: String(input.decisionCode || '').trim() || 'TRANSCRIPT_BLOCKED',
        hidden_count: hiddenCount,
        source_channel_id: String(input.sourceChannelId || '').trim() || null,
        video_id: String(input.videoId || '').trim() || null,
      },
    );
  }

  return hiddenCount;
}

export async function suppressUnlockableFeedRowsForSourceItems(
  db: DbClient,
  input: {
    sourceItemIds: string[];
    decisionCode: string;
    traceId?: string;
    chunkSize?: number;
  },
) {
  const normalizedSourceItemIds = normalizeSourceItemIds(input.sourceItemIds || []);
  const decisionCode = String(input.decisionCode || 'TRANSCRIPT_BLOCKED').slice(0, 120);
  const nowMs = Date.now();
  const sourceItemIds = filterRecentlySuppressedSourceItemIds(normalizedSourceItemIds, decisionCode, nowMs);
  if (sourceItemIds.length === 0) return 0;

  let hiddenCount = 0;
  const chunks = chunkSourceItemIds(sourceItemIds, input.chunkSize);
  for (const chunk of chunks) {
    const { count, error } = await db
      .from('user_feed_items')
      .update({
        state: 'my_feed_skipped',
        last_decision_code: decisionCode,
      })
      .in('source_item_id', chunk)
      .is('blueprint_id', null)
      .in('state', [...SUPPRESSIBLE_FEED_STATES])
      .select('id', { head: true, count: 'exact' });
    if (error) throw error;
    hiddenCount += Math.max(0, Number(count) || 0);
  }
  markRecentSuppressionAttempts(sourceItemIds, decisionCode, nowMs);

  if (hiddenCount > 0) {
    logUnlockEvent(
      'auto_transcript_hidden_feed_rows_bulk',
      { trace_id: String(input.traceId || '').trim() || createUnlockTraceId() },
      {
        decision_code: String(input.decisionCode || '').trim() || 'TRANSCRIPT_BLOCKED',
        hidden_count: hiddenCount,
        source_item_count: sourceItemIds.length,
        chunk_count: chunks.length,
      },
    );
  }

  return hiddenCount;
}
