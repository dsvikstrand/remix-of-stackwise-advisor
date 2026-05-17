import { describe, expect, it, vi } from 'vitest';
import { registerAdminOutreachRoutes } from '../../server/routes/adminOutreach';

function createMockApp() {
  const handlers: Record<string, (req: unknown, res: unknown) => Promise<unknown>> = {};
  return {
    handlers,
    post(path: string, ...args: Array<(req: unknown, res: unknown) => Promise<unknown>>) {
      handlers[`POST ${path}`] = args[args.length - 1];
      return this;
    },
  };
}

function createResponse(userId?: string) {
  return {
    locals: userId ? { user: { id: userId } } : {},
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe('admin outreach route', () => {
  it('requires admin entitlement before generating drafts', async () => {
    const app = createMockApp();
    const generateOutreachDrafts = vi.fn();
    registerAdminOutreachRoutes(app as any, {
      getCredits: vi.fn(async () => ({ plan: 'free' })),
      generateOutreachDrafts,
    });

    const res = createResponse('user_1');
    await app.handlers['POST /api/admin/outreach-drafts/generate']({
      body: { blueprint_id: 'bp_1' },
    } as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(generateOutreachDrafts).not.toHaveBeenCalled();
  });

  it('generates drafts for admin users', async () => {
    const app = createMockApp();
    const generateOutreachDrafts = vi.fn(async () => ({
      draftGroupId: 'group_1',
      blueprintId: 'bp_1',
      sourceItemId: 'source_1',
      youtubeVideoId: 'abc123xyz89',
      videoUrl: 'https://www.youtube.com/watch?v=abc123xyz89',
      sourceChannelId: 'UC_test',
      sourceChannelTitle: 'Creator',
      model: 'gpt-5.5-mini',
      reasoningEffort: 'medium',
      promptVersion: 'outreach_draft_openers_v1',
      options: [],
      limits: {
        dailyCap: 5,
        channelWindowDays: 7,
        videoAlreadyDrafted: false,
      },
    }));
    registerAdminOutreachRoutes(app as any, {
      getCredits: vi.fn(async () => ({ plan: 'admin' })),
      generateOutreachDrafts,
    });

    const res = createResponse('admin_1');
    await app.handlers['POST /api/admin/outreach-drafts/generate']({
      body: { blueprint_id: 'bp_1' },
    } as any, res as any);

    expect(generateOutreachDrafts).toHaveBeenCalledWith({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        draftGroupId: 'group_1',
      },
    });
  });
});
