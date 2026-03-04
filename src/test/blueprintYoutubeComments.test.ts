import { describe, expect, it, vi } from 'vitest';
import { createBlueprintYouTubeCommentsService } from '../../server/services/blueprintYoutubeComments';

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
});
