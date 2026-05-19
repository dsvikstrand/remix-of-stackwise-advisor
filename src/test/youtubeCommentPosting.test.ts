import { describe, expect, it, vi } from 'vitest';
import {
  postYouTubeTopLevelComment,
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
});
