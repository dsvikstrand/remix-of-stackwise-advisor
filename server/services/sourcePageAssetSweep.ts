type DbClient = any;

type SourcePageAssetRecord = {
  id: string;
  platform: string;
  external_id: string;
  external_url: string;
  title: string;
  avatar_url: string | null;
  banner_url: string | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SourcePageAssetSweepMode = 'opportunistic' | 'cron' | 'manual';

type SourcePageAssetSweepInput = {
  mode?: SourcePageAssetSweepMode;
  force?: boolean;
  traceId?: string;
};

type SourcePageAssetSweepHydration = {
  sourcePage: SourcePageAssetRecord;
  updated: boolean;
  hadAssets: boolean;
};

export type SourcePageAssetSweepDeps = {
  sourcePageAssetSweepEnabled: boolean;
  youtubeDataApiKey: string;
  sourcePageAssetSweepBatch: number;
  sourcePageAssetSweepMinIntervalMs: number;
  fetchYouTubeChannelAssetMap: (input: {
    apiKey: string;
    channelIds: string[];
  }) => Promise<Map<string, { avatarUrl: string | null; bannerUrl: string | null }>>;
  hydrateSourcePageAssetsForRow: (
    db: DbClient,
    sourcePage: SourcePageAssetRecord,
    input?: {
      assetMap?: Map<string, { avatarUrl: string | null; bannerUrl: string | null }>;
    },
  ) => Promise<SourcePageAssetSweepHydration>;
};

export function createSourcePageAssetSweepService(deps: SourcePageAssetSweepDeps) {
  let sourcePageAssetSweepLastRunMs = 0;

  async function runSourcePageAssetSweep(db: DbClient, input?: SourcePageAssetSweepInput) {
    if (!deps.sourcePageAssetSweepEnabled || !deps.youtubeDataApiKey) return null;

    const mode = input?.mode || 'opportunistic';
    const nowMs = Date.now();
    if (!input?.force && nowMs - sourcePageAssetSweepLastRunMs < deps.sourcePageAssetSweepMinIntervalMs) {
      return null;
    }
    sourcePageAssetSweepLastRunMs = nowMs;

    const summary = {
      mode,
      trace_id: String(input?.traceId || '').trim() || null,
      scanned_count: 0,
      hydrated_count: 0,
      unchanged_count: 0,
      missing_assets_count: 0,
      error_count: 0,
      batch_size: deps.sourcePageAssetSweepBatch,
    };

    const { data: sourcePagesData, error: sourcePagesError } = await db
      .from('source_pages')
      .select('id, platform, external_id, external_url, title, avatar_url, banner_url, metadata, is_active, created_at, updated_at')
      .eq('platform', 'youtube')
      .eq('is_active', true)
      .or('avatar_url.is.null,banner_url.is.null')
      .order('updated_at', { ascending: true })
      .limit(deps.sourcePageAssetSweepBatch);
    if (sourcePagesError) {
      console.log('[source_page_asset_sweep_failed]', JSON.stringify({
        mode,
        trace_id: summary.trace_id,
        error: sourcePagesError.message,
      }));
      return null;
    }

    const sourcePages = (sourcePagesData || []) as SourcePageAssetRecord[];
    summary.scanned_count = sourcePages.length;
    if (!sourcePages.length) {
      return summary;
    }

    let assetMap = new Map<string, { avatarUrl: string | null; bannerUrl: string | null }>();
    try {
      assetMap = await deps.fetchYouTubeChannelAssetMap({
        apiKey: deps.youtubeDataApiKey,
        channelIds: sourcePages.map((row) => row.external_id),
      });
    } catch (assetError) {
      console.log('[source_page_asset_sweep_failed]', JSON.stringify({
        mode,
        trace_id: summary.trace_id,
        error: assetError instanceof Error ? assetError.message : String(assetError),
      }));
      return null;
    }

    for (const sourcePage of sourcePages) {
      try {
        const hydration = await deps.hydrateSourcePageAssetsForRow(db, sourcePage, { assetMap });
        if (hydration.updated) {
          summary.hydrated_count += 1;
        } else if (hydration.hadAssets) {
          summary.unchanged_count += 1;
        } else {
          summary.missing_assets_count += 1;
        }
      } catch (error) {
        summary.error_count += 1;
        console.log('[source_page_asset_row_hydration_failed]', JSON.stringify({
          source_page_id: sourcePage.id,
          source_channel_id: sourcePage.external_id,
          trace_id: summary.trace_id,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }

    console.log('[source_page_asset_sweep_summary]', JSON.stringify(summary));
    return summary;
  }

  return {
    runSourcePageAssetSweep,
  };
}
