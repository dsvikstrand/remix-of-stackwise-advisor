import { describe, expect, it } from 'vitest';
import {
  extendPublicYouTubePreviewSelection,
  mergePublicYouTubePreviewResults,
} from '@/lib/publicYouTubePreviewState';
import type { PublicYouTubeSubscriptionsPreviewResult } from '@/lib/subscriptionsApi';

function makePreview(overrides: Partial<PublicYouTubeSubscriptionsPreviewResult>): PublicYouTubeSubscriptionsPreviewResult {
  return {
    source_channel_id: 'source',
    source_channel_title: 'Source Channel',
    source_channel_url: 'https://www.youtube.com/channel/source',
    creators_total: 0,
    next_page_token: null,
    has_more: false,
    creators: [],
    ...overrides,
  };
}

describe('publicYouTubePreviewState', () => {
  it('replaces preview state on the initial page load', () => {
    const incoming = makePreview({
      creators_total: 1,
      has_more: true,
      next_page_token: 'next-page',
      creators: [{
        channel_id: 'creator_1',
        channel_title: 'Creator One',
        channel_url: 'https://www.youtube.com/channel/creator_1',
        thumbnail_url: null,
        already_active: false,
        already_exists_inactive: false,
      }],
    });

    expect(mergePublicYouTubePreviewResults(null, incoming, false)).toEqual(incoming);
  });

  it('appends new creators and preserves a merged count across pages', () => {
    const previous = makePreview({
      creators_total: 1,
      has_more: true,
      next_page_token: 'page-2',
      creators: [{
        channel_id: 'creator_1',
        channel_title: 'Creator One',
        channel_url: 'https://www.youtube.com/channel/creator_1',
        thumbnail_url: null,
        already_active: false,
        already_exists_inactive: false,
      }],
    });
    const incoming = makePreview({
      creators_total: 1,
      has_more: false,
      next_page_token: null,
      creators: [{
        channel_id: 'creator_2',
        channel_title: 'Creator Two',
        channel_url: 'https://www.youtube.com/channel/creator_2',
        thumbnail_url: null,
        already_active: false,
        already_exists_inactive: false,
      }],
    });

    expect(mergePublicYouTubePreviewResults(previous, incoming, true)).toMatchObject({
      creators_total: 2,
      has_more: false,
      next_page_token: null,
      creators: [
        { channel_id: 'creator_1' },
        { channel_id: 'creator_2' },
      ],
    });
  });

  it('preserves existing creator selection and adds new creators as unselected', () => {
    const nextSelection = extendPublicYouTubePreviewSelection({
      creator_1: true,
    }, [
      {
        channel_id: 'creator_1',
        channel_title: 'Creator One',
        channel_url: 'https://www.youtube.com/channel/creator_1',
        thumbnail_url: null,
        already_active: false,
        already_exists_inactive: false,
      },
      {
        channel_id: 'creator_2',
        channel_title: 'Creator Two',
        channel_url: 'https://www.youtube.com/channel/creator_2',
        thumbnail_url: null,
        already_active: false,
        already_exists_inactive: false,
      },
    ]);

    expect(nextSelection).toEqual({
      creator_1: true,
      creator_2: false,
    });
  });
});
