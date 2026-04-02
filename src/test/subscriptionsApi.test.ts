import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock, refreshSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
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
      refreshSession: refreshSessionMock,
    },
  },
}));

describe('listActiveMyIngestionJobs', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    refreshSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
        },
      },
    });
    refreshSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
        },
      },
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      error_code: null,
      message: 'ok',
      data: {
        items: [],
        summary: {
          active_count: 0,
          queued_count: 0,
          running_count: 0,
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('requests queue positions for active queue rows', async () => {
    const { listActiveMyIngestionJobs } = await import('@/lib/subscriptionsApi');

    await listActiveMyIngestionJobs({
      scopes: ['source_item_unlock_generation'],
      limit: 10,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/ingestion/jobs/active-mine?scope=source_item_unlock_generation&limit=10&positions=1');
    expect(init).toMatchObject({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
      }),
    });
  });
});
