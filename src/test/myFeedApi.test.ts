import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/config/runtime', () => ({
  config: {
    agenticBackendUrl: 'https://api.example.com',
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

type FeedItemFixture = {
  id: string;
  blueprintId: string;
  title: string;
};

function makeFeedItem(overrides: Partial<FeedItemFixture> = {}) {
  return {
    id: overrides.id || 'ufi_1',
    blueprintId: overrides.blueprintId || 'bp_1',
    title: overrides.title || 'Saved blueprint',
    state: 'my_feed_published',
    insertedAt: '2026-03-27T10:00:00.000Z',
    publishedAt: '2026-03-27T10:00:00.000Z',
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
    sourceItemId: 'si_1',
    sourceItemTitle: 'Saved blueprint',
    sourceItemUrl: 'https://youtube.com/watch?v=abc12345678',
    sourceType: 'youtube',
    blueprint: {
      id: overrides.blueprintId || 'bp_1',
      title: overrides.title || 'Saved blueprint',
      summary: 'Summary',
      tags: ['tag'],
      likesCount: 3,
      createdAt: '2026-03-27T10:00:00.000Z',
    },
    rejectedReason: null,
    reviewNotes: null,
    channelSubmission: null,
  };
}

describe('listMyFeedItems', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
        },
      },
    });
    vi.stubGlobal('fetch', vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    window.localStorage.clear();
  });

  it('serves the saved feed snapshot when the backend later fails', async () => {
    const firstItems = [makeFeedItem()];
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          error_code: null,
          message: 'ok',
          data: { items: firstItems },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          error_code: 'SERVER_ERROR',
          message: 'backend down',
          data: null,
        }),
      } as Response);

    const { listMyFeedItems } = await import('@/lib/myFeedApi');

    const freshResult = await listMyFeedItems('user_1');
    const degradedResult = await listMyFeedItems('user_1');

    expect(freshResult).toMatchObject({
      items: firstItems,
      staleFallback: false,
      staleReason: null,
      source: 'api',
    });
    expect(degradedResult).toMatchObject({
      items: firstItems,
      staleFallback: true,
      staleReason: 'Showing the last saved feed snapshot because the backend is temporarily unavailable.',
      source: 'cache',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when the backend fails and there is no saved snapshot yet', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        ok: false,
        error_code: 'SERVER_ERROR',
        message: 'service unavailable',
        data: null,
      }),
    } as Response);

    const { listMyFeedItems } = await import('@/lib/myFeedApi');

    await expect(listMyFeedItems('user_2')).rejects.toThrow('service unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
