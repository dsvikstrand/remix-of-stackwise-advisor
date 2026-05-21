import { describe, expect, it, vi } from 'vitest';
import {
  postYouTubeTopLevelComment,
  verifyYouTubeTopLevelCommentVisible,
} from '../../server/services/youtubeCommentPosting';

describe('YouTube comment posting adapter', () => {
  it('maps disabled comments to an actionable non-provider-failure error', async () => {
    await expect(postYouTubeTopLevelComment({
      accessToken: 'token',
      videoId: 'video_1',
      text: 'Comment text',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: {
          code: 403,
          message: 'The video identified by the videoId parameter has disabled comments.',
          errors: [{
            reason: 'commentsDisabled',
            message: 'The video identified by the videoId parameter has disabled comments.',
          }],
        },
      }), { status: 403 })) as unknown as typeof fetch,
    })).rejects.toMatchObject({
      code: 'YT_COMMENTS_DISABLED',
      status: 409,
      message: 'This video does not allow comments through YouTube. Pick another video with comments enabled.',
    });
  });

  it('maps made-for-kids write restrictions to disabled comments copy', async () => {
    await expect(postYouTubeTopLevelComment({
      accessToken: 'token',
      videoId: 'video_1',
      text: 'Comment text',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: {
          code: 403,
          message: 'mfkWrite',
          errors: [{
            reason: 'mfkWrite',
            message: 'mfkWrite',
          }],
        },
      }), { status: 403 })) as unknown as typeof fetch,
    })).rejects.toMatchObject({
      code: 'YT_COMMENTS_DISABLED',
      status: 409,
    });
  });

  it('verifies a returned top-level comment id by read-back', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [{ id: 'comment_1' }],
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(verifyYouTubeTopLevelCommentVisible({
      accessToken: 'token',
      youtubeCommentId: 'comment_1',
      fetchImpl,
    })).resolves.toEqual({
      visible: true,
    });
  });

  it('returns not visible when read-back succeeds but YouTube omits the id', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [],
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(verifyYouTubeTopLevelCommentVisible({
      accessToken: 'token',
      youtubeCommentId: 'comment_1',
      fetchImpl,
    })).resolves.toEqual({
      visible: false,
    });
  });
});
