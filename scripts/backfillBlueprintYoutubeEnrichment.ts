import { createClient } from '@supabase/supabase-js';
import { createBlueprintYouTubeCommentsService } from '../server/services/blueprintYoutubeComments';

function getEnv(name: string) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function resolveSourceItemId(db: ReturnType<typeof createClient>, blueprintId: string) {
  const { data: unlockRow, error: unlockError } = await db
    .from('source_item_unlocks')
    .select('source_item_id, updated_at')
    .eq('blueprint_id', blueprintId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (unlockError) throw unlockError;
  const unlockSourceItemId = String(unlockRow?.source_item_id || '').trim();
  if (unlockSourceItemId) return unlockSourceItemId;

  const { data: feedRow, error: feedError } = await db
    .from('user_feed_items')
    .select('source_item_id, created_at')
    .eq('blueprint_id', blueprintId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (feedError) throw feedError;
  return String(feedRow?.source_item_id || '').trim() || null;
}

async function main() {
  const blueprintId = String(process.argv[2] || '').trim();
  if (!blueprintId) {
    throw new Error('Usage: npx -y tsx ./scripts/backfillBlueprintYoutubeEnrichment.ts <blueprint_id>');
  }

  const url = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  if (!url) {
    throw new Error('Missing required env: VITE_SUPABASE_URL or SUPABASE_URL');
  }
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const youtubeApiKey = getEnv('YOUTUBE_DATA_API_KEY');

  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const sourceItemId = await resolveSourceItemId(db, blueprintId);

  const { data: latestRun, error: latestRunError } = await db
    .from('generation_runs')
    .select('run_id, video_id, started_at')
    .eq('blueprint_id', blueprintId)
    .eq('status', 'succeeded')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestRunError) throw latestRunError;

  const runId = String(latestRun?.run_id || '').trim();
  const videoId = String(latestRun?.video_id || '').trim();
  if (!runId && !videoId) {
    throw new Error(`No successful generation run found for blueprint ${blueprintId}`);
  }

  const service = createBlueprintYouTubeCommentsService({
    apiKey: youtubeApiKey,
  });

  await service.populateForBlueprint({
    db,
    traceDb: db,
    runId: runId || `manual-backfill-${Date.now()}`,
    blueprintId,
    explicitVideoId: videoId || null,
    explicitSourceItemId: sourceItemId,
  });

  const [{ count: topCount, error: topError }, { count: newCount, error: newError }] = await Promise.all([
    db.from('blueprint_youtube_comments').select('id', { count: 'exact', head: true }).eq('blueprint_id', blueprintId).eq('sort_mode', 'top'),
    db.from('blueprint_youtube_comments').select('id', { count: 'exact', head: true }).eq('blueprint_id', blueprintId).eq('sort_mode', 'new'),
  ]);
  if (topError) throw topError;
  if (newError) throw newError;

  const { data: sourceRow, error: sourceError } = sourceItemId
    ? await db.from('source_items').select('metadata').eq('id', sourceItemId).maybeSingle()
    : { data: null, error: null as any };
  if (sourceError) throw sourceError;
  const metadata =
    sourceRow?.metadata && typeof sourceRow.metadata === 'object' && !Array.isArray(sourceRow.metadata)
      ? (sourceRow.metadata as Record<string, unknown>)
      : {};

  console.log(JSON.stringify({
    blueprint_id: blueprintId,
    run_id: runId || null,
    video_id: videoId || null,
    source_item_id: sourceItemId,
    top_comments_count: topCount ?? null,
    new_comments_count: newCount ?? null,
    view_count: typeof metadata.view_count === 'number' ? metadata.view_count : Number(metadata.view_count || NaN) || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
