type DbClient = any;

type BackfillVideo = {
  video_id: string;
  video_url: string;
  title: string;
  channel_id: string;
  channel_title?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
};

const FOR_YOU_BACKFILL_CARD_THRESHOLD = 20;
const FOR_YOU_BACKFILL_MAX_VIDEOS = 5;

function isVisibleForYouRow(row: { blueprint_id?: string | null; state?: string | null }) {
  if (String(row.state || '').trim() === 'subscription_notice') return false;
  if (!row.blueprint_id && (row.state === 'my_feed_pending_accept' || row.state === 'my_feed_skipped')) {
    return false;
  }
  return true;
}

export async function backfillSubscribedCreatorForSparseForYou(input: {
  db: DbClient;
  sourcePageDb: DbClient;
  userId: string;
  sourcePageId: string | null;
  channelId: string;
  channelTitle: string | null;
  youtubeDataApiKey: string;
  listYouTubeSourceVideos: (args: {
    apiKey: string;
    channelId: string;
    limit?: number;
    pageToken?: string;
    kind?: 'all' | 'full' | 'shorts';
    shortsMaxSeconds?: number;
  }) => Promise<{ results: BackfillVideo[]; nextPageToken: string | null }>;
  upsertSourceItemFromVideo: (db: DbClient, input: {
    video: {
      videoId: string;
      title: string;
      url: string;
      publishedAt?: string | null;
      thumbnailUrl?: string | null;
      durationSeconds?: number | null;
    };
    channelId: string;
    channelTitle?: string | null;
    sourcePageId?: string | null;
  }) => Promise<{ id: string }>;
  resolveVariantOrReady: (args: {
    sourceItemId: string;
    generationTier: string;
    jobId?: string | null;
  }) => Promise<{ state: 'ready'; blueprintId?: string | null } | { state: 'in_progress' } | { state: 'needs_generation' } | null>;
  insertFeedItem: (db: DbClient, input: {
    userId: string;
    sourceItemId: string;
    blueprintId: string | null;
    state: string;
    wallCreatedAt?: string | null;
  }) => Promise<unknown>;
  upsertFeedItemWithBlueprint: (db: DbClient, input: {
    userId: string;
    sourceItemId: string;
    blueprintId: string;
    state: string;
  }) => Promise<unknown>;
}) {
  const normalizedUserId = String(input.userId || '').trim();
  const normalizedChannelId = String(input.channelId || '').trim();
  const apiKey = String(input.youtubeDataApiKey || '').trim();
  if (!normalizedUserId || !normalizedChannelId || !apiKey) {
    return {
      applied: false,
      reason: 'missing_input' as const,
      forYouCountBefore: 0,
      candidateCount: 0,
      insertedLockedCount: 0,
      insertedReadyCount: 0,
      skippedExistingCount: 0,
    };
  }

  const { data: currentRows, error: currentRowsError } = await input.db
    .from('user_feed_items')
    .select('id, blueprint_id, state')
    .eq('user_id', normalizedUserId);
  if (currentRowsError) throw currentRowsError;

  const forYouCountBefore = (currentRows || []).filter((row: any) => isVisibleForYouRow(row)).length;
  if (forYouCountBefore >= FOR_YOU_BACKFILL_CARD_THRESHOLD) {
    return {
      applied: false,
      reason: 'threshold_met' as const,
      forYouCountBefore,
      candidateCount: 0,
      insertedLockedCount: 0,
      insertedReadyCount: 0,
      skippedExistingCount: 0,
    };
  }

  console.log('[subscription_backfill_started]', JSON.stringify({
    user_id: normalizedUserId,
    source_page_id: input.sourcePageId || null,
    source_channel_id: normalizedChannelId,
    for_you_count_before: forYouCountBefore,
    threshold: FOR_YOU_BACKFILL_CARD_THRESHOLD,
    max_videos: FOR_YOU_BACKFILL_MAX_VIDEOS,
  }));

  const page = await input.listYouTubeSourceVideos({
    apiKey,
    channelId: normalizedChannelId,
    limit: FOR_YOU_BACKFILL_MAX_VIDEOS,
    kind: 'all',
  });
  const candidates = (page.results || []).slice(0, FOR_YOU_BACKFILL_MAX_VIDEOS);
  if (candidates.length === 0) {
    console.log('[subscription_backfill_completed]', JSON.stringify({
      user_id: normalizedUserId,
      source_page_id: input.sourcePageId || null,
      source_channel_id: normalizedChannelId,
      for_you_count_before: forYouCountBefore,
      candidate_count: 0,
      inserted_locked_count: 0,
      inserted_ready_count: 0,
      skipped_existing_count: 0,
    }));
    return {
      applied: true,
      reason: 'no_candidates' as const,
      forYouCountBefore,
      candidateCount: 0,
      insertedLockedCount: 0,
      insertedReadyCount: 0,
      skippedExistingCount: 0,
    };
  }

  const prepared = await Promise.all(candidates.map(async (item) => {
    const sourceItem = await input.upsertSourceItemFromVideo(input.sourcePageDb, {
      video: {
        videoId: item.video_id,
        title: item.title,
        url: item.video_url,
        publishedAt: item.published_at || null,
        thumbnailUrl: item.thumbnail_url || null,
        durationSeconds: item.duration_seconds ?? null,
      },
      channelId: item.channel_id,
      channelTitle: item.channel_title || input.channelTitle || null,
      sourcePageId: input.sourcePageId || null,
    });
    return {
      item,
      sourceItemId: sourceItem.id,
    };
  }));

  const sourceItemIds = prepared.map((row) => row.sourceItemId);
  const { data: existingFeedRows, error: existingFeedRowsError } = await input.db
    .from('user_feed_items')
    .select('id, source_item_id, blueprint_id, state')
    .eq('user_id', normalizedUserId)
    .in('source_item_id', sourceItemIds);
  if (existingFeedRowsError) throw existingFeedRowsError;
  const existingBySourceItemId = new Map(
    (existingFeedRows || [])
      .map((row: any) => [String(row.source_item_id || '').trim(), row] as const)
      .filter((entry) => Boolean(entry[0])),
  );

  let insertedLockedCount = 0;
  let insertedReadyCount = 0;
  let skippedExistingCount = 0;

  for (const row of prepared) {
    const existingFeedRow = existingBySourceItemId.get(row.sourceItemId) || null;
    const variantState = await input.resolveVariantOrReady({
      sourceItemId: row.sourceItemId,
      generationTier: 'tier',
    });

    if (variantState?.state === 'ready' && variantState.blueprintId) {
      await input.upsertFeedItemWithBlueprint(input.db, {
        userId: normalizedUserId,
        sourceItemId: row.sourceItemId,
        blueprintId: variantState.blueprintId,
        state: 'my_feed_published',
      });
      insertedReadyCount += 1;
      continue;
    }

    if (existingFeedRow) {
      skippedExistingCount += 1;
      continue;
    }

    await input.insertFeedItem(input.db, {
      userId: normalizedUserId,
      sourceItemId: row.sourceItemId,
      blueprintId: null,
      state: 'my_feed_unlockable',
      wallCreatedAt: new Date().toISOString(),
    });
    insertedLockedCount += 1;
  }

  console.log('[subscription_backfill_completed]', JSON.stringify({
    user_id: normalizedUserId,
    source_page_id: input.sourcePageId || null,
    source_channel_id: normalizedChannelId,
    for_you_count_before: forYouCountBefore,
    candidate_count: candidates.length,
    inserted_locked_count: insertedLockedCount,
    inserted_ready_count: insertedReadyCount,
    skipped_existing_count: skippedExistingCount,
  }));

  return {
    applied: true,
    reason: 'completed' as const,
    forYouCountBefore,
    candidateCount: candidates.length,
    insertedLockedCount,
    insertedReadyCount,
    skippedExistingCount,
  };
}
