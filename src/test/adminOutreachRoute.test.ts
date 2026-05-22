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
      postOutreachDraft: vi.fn(),
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
      sourceChannelSubscriberCount: 12345,
      model: 'gpt-5.5-mini',
      reasoningEffort: 'medium',
      promptVersion: 'outreach_draft_openers_v1',
      options: [],
      promoVariants: [],
      limits: {
        dailyCap: 5,
        channelWindowDays: 7,
        videoAlreadyDrafted: false,
      },
    }));
    registerAdminOutreachRoutes(app as any, {
      getCredits: vi.fn(async () => ({ plan: 'admin' })),
      generateOutreachDrafts,
      postOutreachDraft: vi.fn(),
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

  it('posts outreach drafts for admin users', async () => {
    const app = createMockApp();
    const postOutreachDraft = vi.fn(async () => ({
      draftId: 'draft_1',
      draftGroupId: 'group_1',
      blueprintId: 'bp_1',
      sourceItemId: 'source_1',
      youtubeVideoId: 'abc123xyz89',
      videoUrl: 'https://www.youtube.com/watch?v=abc123xyz89',
      youtubeCommentId: 'comment_1',
      finalText: 'BLEUP is useful. Please visit my channel for more info and free early access.',
      status: 'posted' as const,
      postedAt: '2026-05-18T08:00:00.000Z',
      verification: {
        visible: true,
        errorCode: null,
        errorMessage: null,
      },
    }));
    registerAdminOutreachRoutes(app as any, {
      getCredits: vi.fn(async () => ({ plan: 'admin' })),
      generateOutreachDrafts: vi.fn(),
      postOutreachDraft,
    });

    const res = createResponse('admin_1');
    await app.handlers['POST /api/admin/outreach-drafts/:draftId/post']({
      params: { draftId: 'draft_1' },
      body: { final_text: 'BLEUP is useful. Please visit my channel for more info and free early access.' },
    } as any, res as any);

    expect(postOutreachDraft).toHaveBeenCalledWith({
      adminUserId: 'admin_1',
      draftId: 'draft_1',
      finalText: 'BLEUP is useful. Please visit my channel for more info and free early access.',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        youtubeCommentId: 'comment_1',
      },
    });
  });

  it('requires admin entitlement before posting outreach drafts', async () => {
    const app = createMockApp();
    const postOutreachDraft = vi.fn();
    registerAdminOutreachRoutes(app as any, {
      getCredits: vi.fn(async () => ({ plan: 'free' })),
      generateOutreachDrafts: vi.fn(),
      postOutreachDraft,
    });

    const res = createResponse('user_1');
    await app.handlers['POST /api/admin/outreach-drafts/:draftId/post']({
      params: { draftId: 'draft_1' },
      body: { final_text: 'BLEUP is useful. Please visit my channel for more info and free early access.' },
    } as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(postOutreachDraft).not.toHaveBeenCalled();
  });
});
