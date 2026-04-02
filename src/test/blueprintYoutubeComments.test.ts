import { describe, expect, it, vi } from 'vitest';
import { createBlueprintYouTubeCommentsService } from '../../server/services/blueprintYoutubeComments';
import { createMockSupabase } from './helpers/mockSupabase';

describe('blueprint YouTube comments service', () => {
  it('normalizes top-level comments from the YouTube API response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 'comment_1',
            snippet: {
              topLevelComment: {
                snippet: {
                  authorDisplayName: 'Alice',
                  authorProfileImageUrl: 'https://example.com/avatar.png',
                  textDisplay: 'A useful comment',
                  publishedAt: '2026-03-04T10:00:00.000Z',
                  likeCount: 7,
                },
              },
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    const comments = await service.fetchYouTubeCommentSnapshot({
      videoId: 'abc123def45',
      sortMode: 'top',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(comments).toEqual([
      {
        source_comment_id: 'comment_1',
        display_order: 0,
        author_name: 'Alice',
        author_avatar_url: 'https://example.com/avatar.png',
        content: 'A useful comment',
        published_at: '2026-03-04T10:00:00.000Z',
        like_count: 7,
      },
    ]);
  });

  it('treats commentsDisabled as an empty snapshot instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          message: 'The video owner has disabled comments.',
          errors: [{ reason: 'commentsDisabled' }],
        },
      }),
    })) as unknown as typeof fetch;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    const comments = await service.fetchYouTubeCommentSnapshot({
      videoId: 'abc123def45',
      sortMode: 'new',
    });

    expect(comments).toEqual([]);
  });

  it('extracts the YouTube video view count from the statistics response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 'abc123def45',
            statistics: {
              viewCount: '12345',
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    const viewCount = await service.fetchYouTubeViewCount({
      videoId: 'abc123def45',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(viewCount).toBe(12345);
  });

  it('storeSourceItemViewCount skips the source_items write when the fetched count is unchanged', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { id: 'src_1' }, error: null })),
        })),
      })),
    }));
    const sourceItemsTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              metadata: {
                view_count: 12345,
                view_count_fetched_at: '2026-03-22T09:00:00.000Z',
              },
            },
            error: null,
          })),
        })),
      })),
      update,
    };
    const db = {
      from(table: string) {
        if (table === 'source_items') return sourceItemsTable;
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const stored = await service.storeSourceItemViewCount({
      db,
      sourceItemId: 'src_1',
      viewCount: 12345,
    });

    expect(stored).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('storeSourceItemViewCount still writes when the fetched count changed', async () => {
    const maybeSingle = vi.fn(async () => ({ data: { id: 'src_1' }, error: null }));
    const select = vi.fn(() => ({ maybeSingle }));
    const eqForUpdate = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq: eqForUpdate }));
    const sourceItemsTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              metadata: {
                view_count: 12345,
                view_count_fetched_at: '2026-03-22T09:00:00.000Z',
              },
            },
            error: null,
          })),
        })),
      })),
      update,
    };
    const db = {
      from(table: string) {
        if (table === 'source_items') return sourceItemsTable;
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const stored = await service.storeSourceItemViewCount({
      db,
      sourceItemId: 'src_1',
      viewCount: 12346,
    });

    expect(stored).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('executeRefresh uses the injected Oracle-aware source-item view writer when present', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 'abc123def45',
            statistics: {
              viewCount: '12345',
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const storeSourceItemViewCountOracleAware = vi.fn(async () => true);
    const db = createMockSupabase({
      blueprint_youtube_refresh_state: [],
    }) as any;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
      storeSourceItemViewCountOracleAware,
    });

    await service.executeRefresh({
      db,
      blueprintId: 'bp_1',
      kind: 'view_count',
      youtubeVideoId: 'abc123def45',
      sourceItemId: 'src_1',
    });

    expect(storeSourceItemViewCountOracleAware).toHaveBeenCalledTimes(1);
    expect(storeSourceItemViewCountOracleAware).toHaveBeenCalledWith({
      db,
      sourceItemId: 'src_1',
      viewCount: 12345,
    });
  });

  it('registerRefreshStateForBlueprint no-ops when no video id can be resolved', async () => {
    const generationRunsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { video_id: null }, error: null })),
    } as any;
    generationRunsQuery.select.mockReturnValue(generationRunsQuery);
    generationRunsQuery.eq.mockReturnValue(generationRunsQuery);
    generationRunsQuery.order.mockReturnValue(generationRunsQuery);
    generationRunsQuery.limit.mockReturnValue(generationRunsQuery);

    const upsertRefreshState = vi.fn(async () => ({ error: null }));

    const db = {
      from(table: string) {
        if (table === 'generation_runs') return generationRunsQuery;
        if (table === 'blueprint_youtube_refresh_state') {
          return {
            upsert: upsertRefreshState,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await service.registerRefreshStateForBlueprint({
      db,
      blueprintId: 'bp_1',
    });

    expect(upsertRefreshState).not.toHaveBeenCalled();
  });

  it('registerRefreshStateForBlueprint skips the upsert when a matching refresh row already exists', async () => {
    const generationRunsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { video_id: 'abc123def45' }, error: null })),
    } as any;
    generationRunsQuery.select.mockReturnValue(generationRunsQuery);
    generationRunsQuery.eq.mockReturnValue(generationRunsQuery);
    generationRunsQuery.order.mockReturnValue(generationRunsQuery);
    generationRunsQuery.limit.mockReturnValue(generationRunsQuery);

    const refreshSelectQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          blueprint_id: 'bp_1',
          youtube_video_id: 'abc123def45',
          source_item_id: 'src_1',
          enabled: true,
          comments_auto_stage: 0,
          next_comments_refresh_at: null,
          comments_manual_cooldown_until: null,
          last_comments_manual_refresh_at: null,
          last_comments_manual_triggered_by: null,
        },
        error: null,
      })),
      upsert: vi.fn(async () => ({ error: null })),
    } as any;
    refreshSelectQuery.select.mockReturnValue(refreshSelectQuery);
    refreshSelectQuery.eq.mockReturnValue(refreshSelectQuery);

    const db = {
      from(table: string) {
        if (table === 'generation_runs') return generationRunsQuery;
        if (table === 'blueprint_youtube_refresh_state') return refreshSelectQuery;
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await service.registerRefreshStateForBlueprint({
      db,
      blueprintId: 'bp_1',
      explicitSourceItemId: 'src_1',
    });

    expect(refreshSelectQuery.upsert).not.toHaveBeenCalled();
  });

  it('executeRefresh(view_count) marks skipped when source_item_id is missing', async () => {
    const upsertRefreshState = vi.fn(async () => ({ error: null }));
    const db = {
      from(table: string) {
        if (table === 'blueprint_youtube_refresh_state') {
          return {
            upsert: upsertRefreshState,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    await service.executeRefresh({
      db,
      blueprintId: 'bp_1',
      kind: 'view_count',
      youtubeVideoId: 'abc123def45',
      sourceItemId: null,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upsertRefreshState).toHaveBeenCalledTimes(1);
    const payload = upsertRefreshState.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.last_view_refresh_status).toBe('skipped');
    expect(typeof payload.next_view_refresh_at).toBe('string');
  });

  it('executeRefresh(view_count) skips the refresh-state upsert when the patch is unchanged', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T10:00:00.000Z'));
    try {
      const upsertRefreshState = vi.fn(async () => ({ error: null }));
      const refreshSelectQuery = {
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => ({
          data: {
            blueprint_id: 'bp_1',
            youtube_video_id: 'abc123def45',
            source_item_id: null,
            enabled: true,
            next_view_refresh_at: '2026-03-23T10:00:00.000Z',
            last_view_refresh_status: 'skipped',
          },
          error: null,
        })),
      } as any;
      refreshSelectQuery.eq.mockReturnValue(refreshSelectQuery);
      const db = {
        from(table: string) {
          if (table === 'blueprint_youtube_refresh_state') {
            return {
              select: vi.fn(() => refreshSelectQuery),
              upsert: upsertRefreshState,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const service = createBlueprintYouTubeCommentsService({
        apiKey: 'youtube-key',
        fetchImpl: vi.fn() as unknown as typeof fetch,
      });

      await service.executeRefresh({
        db,
        blueprintId: 'bp_1',
        kind: 'view_count',
        youtubeVideoId: 'abc123def45',
        sourceItemId: null,
      });

      expect(upsertRefreshState).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('executeRefresh(view_count) still upserts refresh-state when a meaningful field changed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T10:00:00.000Z'));
    try {
      const upsertRefreshState = vi.fn(async () => ({ error: null }));
      const refreshSelectQuery = {
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => ({
          data: {
            blueprint_id: 'bp_1',
            youtube_video_id: 'abc123def45',
            source_item_id: null,
            enabled: true,
            next_view_refresh_at: '2026-03-22T12:00:00.000Z',
            last_view_refresh_status: 'failed',
          },
          error: null,
        })),
      } as any;
      refreshSelectQuery.eq.mockReturnValue(refreshSelectQuery);
      const db = {
        from(table: string) {
          if (table === 'blueprint_youtube_refresh_state') {
            return {
              select: vi.fn(() => refreshSelectQuery),
              upsert: upsertRefreshState,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const service = createBlueprintYouTubeCommentsService({
        apiKey: 'youtube-key',
        fetchImpl: vi.fn() as unknown as typeof fetch,
      });

      await service.executeRefresh({
        db,
        blueprintId: 'bp_1',
        kind: 'view_count',
        youtubeVideoId: 'abc123def45',
        sourceItemId: null,
      });

      expect(upsertRefreshState).toHaveBeenCalledTimes(1);
      const payload = upsertRefreshState.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.last_view_refresh_status).toBe('skipped');
      expect(payload.next_view_refresh_at).toBe('2026-03-23T10:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('executeRefresh(comments) stores top/new snapshots and updates refresh state', async () => {
    const commentDeleteEq2 = vi.fn(async () => ({ error: null }));
    const commentDeleteEq1 = vi.fn(() => ({ eq: commentDeleteEq2 }));
    const commentsTable = {
      delete: vi.fn(() => ({ eq: commentDeleteEq1 })),
      insert: vi.fn(async () => ({ error: null })),
    };
    const upsertRefreshState = vi.fn(async () => ({ error: null }));
    const refreshSelectQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          blueprint_id: 'bp_1',
          youtube_video_id: 'abc123def45',
          source_item_id: 'src_1',
          enabled: true,
          comments_auto_stage: 0,
          next_comments_refresh_at: '2026-03-05T00:15:00.000Z',
          comments_manual_cooldown_until: null,
          last_comments_manual_refresh_at: null,
          last_comments_manual_triggered_by: null,
          consecutive_comments_failures: 0,
        },
        error: null,
      })),
    } as any;
    refreshSelectQuery.eq.mockReturnValue(refreshSelectQuery);

    const db = {
      from(table: string) {
        if (table === 'blueprint_youtube_comments') return commentsTable;
        if (table === 'blueprint_youtube_refresh_state') {
          return {
            select: vi.fn(() => refreshSelectQuery),
            upsert: upsertRefreshState,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const fetchImpl = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      const order = parsed.searchParams.get('order');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: `${order}_comment`,
              snippet: {
                topLevelComment: {
                  snippet: {
                    textDisplay: `${order} comment`,
                  },
                },
              },
            },
          ],
        }),
      };
    }) as unknown as typeof fetch;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    await service.executeRefresh({
      db,
      blueprintId: 'bp_1',
      kind: 'comments',
      youtubeVideoId: 'abc123def45',
      sourceItemId: 'src_1',
    });

    expect(commentsTable.insert).toHaveBeenCalledTimes(2);
    expect(upsertRefreshState).toHaveBeenCalledTimes(1);
    const payload = upsertRefreshState.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.last_comments_refresh_status).toBe('ok');
    expect(payload.consecutive_comments_failures).toBe(0);
    expect(payload.comments_auto_stage).toBe(1);
    expect(typeof payload.next_comments_refresh_at).toBe('string');
  });

  it('executeRefresh(comments) records failure and backoff without throwing', async () => {
    const refreshSelectQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          blueprint_id: 'bp_1',
          youtube_video_id: 'abc123def45',
          source_item_id: 'src_1',
          enabled: true,
          comments_auto_stage: 1,
          next_comments_refresh_at: '2026-03-05T23:15:00.000Z',
          comments_manual_cooldown_until: null,
          last_comments_manual_refresh_at: null,
          last_comments_manual_triggered_by: null,
          consecutive_comments_failures: 1,
        },
        error: null,
      })),
    } as any;
    refreshSelectQuery.eq.mockReturnValue(refreshSelectQuery);
    const refreshStateTable = {
      select: vi.fn(() => refreshSelectQuery),
      upsert: vi.fn(async () => ({ error: null })),
    };

    const db = {
      from(table: string) {
        if (table === 'blueprint_youtube_refresh_state') return refreshStateTable;
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          message: 'quota exceeded',
          errors: [{ reason: 'quotaExceeded' }],
        },
      }),
    })) as unknown as typeof fetch;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    await expect(service.executeRefresh({
      db,
      blueprintId: 'bp_1',
      kind: 'comments',
      youtubeVideoId: 'abc123def45',
      sourceItemId: 'src_1',
    })).resolves.toBeUndefined();

    expect(refreshStateTable.upsert).toHaveBeenCalledTimes(1);
    const payload = refreshStateTable.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.last_comments_refresh_status).toBe('failed');
    expect(payload.consecutive_comments_failures).toBe(2);
    expect(typeof payload.next_comments_refresh_at).toBe('string');
  });

  it('executeRefresh(comments) manual trigger sets cooldown and keeps auto stage', async () => {
    const commentDeleteEq2 = vi.fn(async () => ({ error: null }));
    const commentDeleteEq1 = vi.fn(() => ({ eq: commentDeleteEq2 }));
    const commentsTable = {
      delete: vi.fn(() => ({ eq: commentDeleteEq1 })),
      insert: vi.fn(async () => ({ error: null })),
    };
    const upsertRefreshState = vi.fn(async () => ({ error: null }));
    const refreshSelectQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          blueprint_id: 'bp_1',
          youtube_video_id: 'abc123def45',
          source_item_id: 'src_1',
          enabled: true,
          comments_auto_stage: 2,
          next_comments_refresh_at: null,
          comments_manual_cooldown_until: null,
          last_comments_manual_refresh_at: null,
          last_comments_manual_triggered_by: null,
          consecutive_comments_failures: 0,
        },
        error: null,
      })),
    } as any;
    refreshSelectQuery.eq.mockReturnValue(refreshSelectQuery);

    const db = {
      from(table: string) {
        if (table === 'blueprint_youtube_comments') return commentsTable;
        if (table === 'blueprint_youtube_refresh_state') {
          return {
            select: vi.fn(() => refreshSelectQuery),
            upsert: upsertRefreshState,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 'top_comment',
            snippet: {
              topLevelComment: {
                snippet: {
                  textDisplay: 'manual refresh comment',
                },
              },
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    await service.executeRefresh({
      db,
      blueprintId: 'bp_1',
      kind: 'comments',
      trigger: 'manual',
      youtubeVideoId: 'abc123def45',
      sourceItemId: 'src_1',
      triggeredByUserId: '00000000-0000-0000-0000-000000000777',
    });

    const payload = upsertRefreshState.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.comments_auto_stage).toBe(2);
    expect(payload.next_comments_refresh_at).toBeNull();
    expect(typeof payload.comments_manual_cooldown_until).toBe('string');
    expect(payload.last_comments_manual_triggered_by).toBe('00000000-0000-0000-0000-000000000777');
  });

  it('executeRefresh(comments) manual trigger before bootstrap completion advances to stage one and keeps a delayed auto follow-up', async () => {
    const commentDeleteEq2 = vi.fn(async () => ({ error: null }));
    const commentDeleteEq1 = vi.fn(() => ({ eq: commentDeleteEq2 }));
    const commentsTable = {
      delete: vi.fn(() => ({ eq: commentDeleteEq1 })),
      insert: vi.fn(async () => ({ error: null })),
    };
    const upsertRefreshState = vi.fn(async () => ({ error: null }));
    const refreshSelectQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          blueprint_id: 'bp_1',
          youtube_video_id: 'abc123def45',
          source_item_id: 'src_1',
          enabled: true,
          comments_auto_stage: 0,
          next_comments_refresh_at: '2026-03-05T00:15:00.000Z',
          comments_manual_cooldown_until: null,
          last_comments_manual_refresh_at: null,
          last_comments_manual_triggered_by: null,
          consecutive_comments_failures: 0,
        },
        error: null,
      })),
    } as any;
    refreshSelectQuery.eq.mockReturnValue(refreshSelectQuery);

    const db = {
      from(table: string) {
        if (table === 'blueprint_youtube_comments') return commentsTable;
        if (table === 'blueprint_youtube_refresh_state') {
          return {
            select: vi.fn(() => refreshSelectQuery),
            upsert: upsertRefreshState,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 'top_comment',
            snippet: {
              topLevelComment: {
                snippet: {
                  textDisplay: 'manual refresh comment',
                },
              },
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl,
    });

    await service.executeRefresh({
      db,
      blueprintId: 'bp_1',
      kind: 'comments',
      trigger: 'manual',
      youtubeVideoId: 'abc123def45',
      sourceItemId: 'src_1',
      triggeredByUserId: '00000000-0000-0000-0000-000000000777',
    });

    const payload = upsertRefreshState.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.comments_auto_stage).toBe(1);
    expect(typeof payload.next_comments_refresh_at).toBe('string');
    expect(payload.next_comments_refresh_at).not.toBe('2026-03-05T00:15:00.000Z');
    expect(typeof payload.comments_manual_cooldown_until).toBe('string');
  });

  it('hasPendingRefreshJob detects matching blueprint/kind payloads', async () => {
    const pendingQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      contains: vi.fn(),
      limit: vi.fn(async () => ({
        data: [
          {
            payload: {
              blueprint_id: 'bp_1',
              refresh_kind: 'comments',
            },
          },
        ],
        error: null,
      })),
    } as any;
    pendingQuery.select.mockReturnValue(pendingQuery);
    pendingQuery.eq.mockReturnValue(pendingQuery);
    pendingQuery.in.mockReturnValue(pendingQuery);
    pendingQuery.contains.mockReturnValue(pendingQuery);

    const db = {
      from(table: string) {
        if (table === 'ingestion_jobs') return pendingQuery;
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const isPendingComments = await service.hasPendingRefreshJob({
      db,
      blueprintId: 'bp_1',
      kind: 'comments',
    });
    const isPendingViewCount = await service.hasPendingRefreshJob({
      db,
      blueprintId: 'bp_1',
      kind: 'view_count',
    });

    expect(isPendingComments).toBe(true);
    expect(isPendingViewCount).toBe(false);
  });

  it('listPendingRefreshBlueprintIds batches matching blueprint ids for one refresh kind', async () => {
    const pendingQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      contains: vi.fn(),
      limit: vi.fn(async () => ({
        data: [
          {
            payload: {
              blueprint_id: 'bp_1',
              refresh_kind: 'comments',
            },
          },
          {
            payload: {
              blueprint_id: 'bp_3',
              refresh_kind: 'comments',
            },
          },
          {
            payload: {
              blueprint_id: 'bp_2',
              refresh_kind: 'view_count',
            },
          },
        ],
        error: null,
      })),
    } as any;
    pendingQuery.select.mockReturnValue(pendingQuery);
    pendingQuery.eq.mockReturnValue(pendingQuery);
    pendingQuery.in.mockReturnValue(pendingQuery);
    pendingQuery.contains.mockReturnValue(pendingQuery);

    const db = {
      from(table: string) {
        if (table === 'ingestion_jobs') return pendingQuery;
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const pendingIds = await service.listPendingRefreshBlueprintIds({
      db,
      blueprintIds: ['bp_1', 'bp_2', 'bp_3'],
      kind: 'comments',
    });

    expect([...pendingIds]).toEqual(['bp_1', 'bp_3']);
  });

  it('can resolve pending refresh ids from the Oracle activity mirror callback', async () => {
    const listOracleActiveRefreshJobs = vi.fn(async () => ([
      {
        payload: {
          blueprint_id: 'bp_1',
          refresh_kind: 'comments',
        },
      },
      {
        payload: {
          blueprint_id: 'bp_2',
          refresh_kind: 'view_count',
        },
      },
    ]));

    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
      listOracleActiveRefreshJobs,
    });

    const pendingIds = await service.listPendingRefreshBlueprintIds({
      db: {} as any,
      blueprintIds: ['bp_1', 'bp_2', 'bp_3'],
      kind: 'comments',
    });

    expect(listOracleActiveRefreshJobs).toHaveBeenCalledWith({
      scope: 'blueprint_youtube_refresh',
      limit: 50,
    });
    expect([...pendingIds]).toEqual(['bp_1']);
  });

  it('prefers the centralized pending-refresh helper when provided', async () => {
    const listPendingRefreshBlueprintIdsOracleFirst = vi.fn(async () => new Set(['bp_2']));
    const service = createBlueprintYouTubeCommentsService({
      apiKey: 'youtube-key',
      fetchImpl: vi.fn() as unknown as typeof fetch,
      listPendingRefreshBlueprintIdsOracleFirst,
      listOracleActiveRefreshJobs: vi.fn(async () => {
        throw new Error('legacy callback should not run when centralized helper is provided');
      }),
    });

    const pendingIds = await service.listPendingRefreshBlueprintIds({
      db: {} as any,
      blueprintIds: ['bp_1', 'bp_2', 'bp_3'],
      kind: 'comments',
    });

    expect(listPendingRefreshBlueprintIdsOracleFirst).toHaveBeenCalledWith({
      db: {},
      blueprintIds: ['bp_1', 'bp_2', 'bp_3'],
      kind: 'comments',
    });
    expect([...pendingIds]).toEqual(['bp_2']);
  });
});
