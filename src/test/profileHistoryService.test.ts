import { describe, expect, it } from 'vitest';
import { repairProfileHistoryBlueprintIdsForUser, resolveProfileHistory } from '../../server/services/profileHistory';
import { createMockSupabase } from './helpers/mockSupabase';

function normalizeTranscriptTruthStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

describe('profile history service', () => {
  it('resolves creator and blueprint history items from canonical fallback sources', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'feed_creator',
          user_id: 'user_1',
          source_item_id: 'source_creator',
          blueprint_id: null,
          state: 'subscription_notice',
          last_decision_code: null,
          created_at: '2026-03-10T12:00:00.000Z',
        },
        {
          id: 'feed_direct',
          user_id: 'user_1',
          source_item_id: 'source_direct',
          blueprint_id: 'bp_direct',
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-10T11:00:00.000Z',
        },
        {
          id: 'feed_variant',
          user_id: 'user_1',
          source_item_id: 'source_variant',
          blueprint_id: null,
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-10T10:00:00.000Z',
        },
        {
          id: 'feed_unlock',
          user_id: 'user_1',
          source_item_id: 'source_unlock',
          blueprint_id: null,
          state: 'channel_rejected',
          last_decision_code: 'QUALITY_LOW',
          created_at: '2026-03-10T09:00:00.000Z',
        },
        {
          id: 'feed_fallback_current',
          user_id: 'user_1',
          source_item_id: 'source_fallback',
          blueprint_id: null,
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-10T08:00:00.000Z',
        },
        {
          id: 'feed_fallback_origin',
          user_id: 'user_1',
          source_item_id: 'source_fallback',
          blueprint_id: 'bp_fallback',
          state: 'my_feed_published',
          last_decision_code: null,
          created_at: '2026-03-10T07:00:00.000Z',
        },
        {
          id: 'feed_unresolved',
          user_id: 'user_1',
          source_item_id: 'source_unresolved',
          blueprint_id: null,
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-10T06:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_creator',
          source_page_id: 'page_creator',
          source_channel_id: 'UC_creator',
          source_url: 'https://www.youtube.com/channel/UC_creator',
          title: 'You are now subscribing to Creator Alpha',
          source_channel_title: 'Creator Alpha',
          thumbnail_url: 'https://img.example.com/creator-thumb.jpg',
          metadata: {
            source_channel_avatar_url: 'https://img.example.com/creator-avatar.jpg',
          },
        },
        {
          id: 'source_direct',
          source_page_id: 'page_creator',
          source_channel_id: 'UC_creator',
          source_url: 'https://www.youtube.com/watch?v=direct1',
          title: 'Direct video',
          source_channel_title: 'Creator Alpha',
          thumbnail_url: 'https://img.example.com/direct-thumb.jpg',
          metadata: {},
        },
        {
          id: 'source_variant',
          source_page_id: 'page_variant',
          source_channel_id: 'UC_variant',
          source_url: 'https://www.youtube.com/watch?v=variant1',
          title: 'Variant video',
          source_channel_title: 'Creator Beta',
          thumbnail_url: 'https://img.example.com/variant-thumb.jpg',
          metadata: {},
        },
        {
          id: 'source_unlock',
          source_page_id: 'page_unlock',
          source_channel_id: 'UC_unlock',
          source_url: 'https://www.youtube.com/watch?v=unlock1',
          title: 'Unlock video',
          source_channel_title: 'Creator Gamma',
          thumbnail_url: 'https://img.example.com/unlock-thumb.jpg',
          metadata: {},
        },
        {
          id: 'source_fallback',
          source_page_id: 'page_fallback',
          source_channel_id: 'UC_fallback',
          source_url: 'https://www.youtube.com/watch?v=fallback1',
          title: 'Fallback video',
          source_channel_title: 'Creator Delta',
          thumbnail_url: 'https://img.example.com/fallback-thumb.jpg',
          metadata: {},
        },
        {
          id: 'source_unresolved',
          source_page_id: 'page_unresolved',
          source_channel_id: 'UC_unresolved',
          source_url: 'https://www.youtube.com/watch?v=broken1',
          title: 'Broken video',
          source_channel_title: 'Creator Epsilon',
          thumbnail_url: 'https://img.example.com/broken-thumb.jpg',
          metadata: {},
        },
      ],
      source_pages: [
        {
          id: 'page_creator',
          platform: 'youtube',
          external_id: 'UC_creator',
          title: 'Creator Alpha',
          avatar_url: 'https://img.example.com/source-page-avatar.jpg',
        },
        {
          id: 'page_variant',
          platform: 'youtube',
          external_id: 'UC_variant',
          title: 'Creator Beta',
          avatar_url: 'https://img.example.com/variant-avatar.jpg',
        },
        {
          id: 'page_unlock',
          platform: 'youtube',
          external_id: 'UC_unlock',
          title: 'Creator Gamma',
          avatar_url: 'https://img.example.com/unlock-avatar.jpg',
        },
        {
          id: 'page_fallback',
          platform: 'youtube',
          external_id: 'UC_fallback',
          title: 'Creator Delta',
          avatar_url: 'https://img.example.com/fallback-avatar.jpg',
        },
        {
          id: 'page_unresolved',
          platform: 'youtube',
          external_id: 'UC_unresolved',
          title: 'Creator Epsilon',
          avatar_url: 'https://img.example.com/unresolved-avatar.jpg',
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_variant',
          status: 'processing',
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
          updated_at: '2026-03-10T10:05:00.000Z',
        },
        {
          source_item_id: 'source_unlock',
          status: 'ready',
          blueprint_id: 'bp_unlock',
          last_error_code: null,
          transcript_status: null,
          updated_at: '2026-03-10T09:05:00.000Z',
        },
        {
          source_item_id: 'source_unresolved',
          status: 'available',
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
          updated_at: '2026-03-10T06:05:00.000Z',
        },
      ],
      source_item_blueprint_variants: [
        {
          source_item_id: 'source_variant',
          status: 'ready',
          blueprint_id: 'bp_variant',
          updated_at: '2026-03-10T10:10:00.000Z',
        },
      ],
      blueprints: [
        { id: 'bp_direct', title: 'Direct Blueprint', banner_url: 'https://img.example.com/direct-banner.jpg' },
        { id: 'bp_variant', title: 'Variant Blueprint', banner_url: 'https://img.example.com/variant-banner.jpg' },
        { id: 'bp_unlock', title: 'Unlock Blueprint', banner_url: 'https://img.example.com/unlock-banner.jpg' },
        { id: 'bp_fallback', title: 'Fallback Blueprint', banner_url: 'https://img.example.com/fallback-banner.jpg' },
      ],
      channel_candidates: [
        {
          id: 'candidate_direct',
          user_feed_item_id: 'feed_direct',
          channel_slug: 'fitness',
          status: 'published',
          created_at: '2026-03-10T11:05:00.000Z',
        },
        {
          id: 'candidate_variant',
          user_feed_item_id: 'feed_variant',
          channel_slug: 'science',
          status: 'published',
          created_at: '2026-03-10T10:05:00.000Z',
        },
      ],
    }) as any;

    const result = await resolveProfileHistory({
      db,
      userId: 'user_1',
      normalizeTranscriptTruthStatus,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      'feed_creator',
      'feed_direct',
      'feed_variant',
      'feed_unlock',
      'feed_fallback_current',
      'feed_fallback_origin',
    ]);

    expect(result.items[0]).toMatchObject({
      id: 'feed_creator',
      kind: 'creator',
      title: 'Creator Alpha',
      subtitle: 'Subscribed creator',
      href: '/s/youtube/UC_creator',
      badge: 'Creator',
    });

    expect(result.items[1]).toMatchObject({
      id: 'feed_direct',
      kind: 'blueprint',
      title: 'Direct Blueprint',
      subtitle: 'Creator Alpha',
      href: '/blueprint/bp_direct',
      statusText: 'Published to fitness',
      badge: 'Blueprint',
    });

    expect(result.items[2]).toMatchObject({
      id: 'feed_variant',
      kind: 'blueprint',
      title: 'Variant Blueprint',
      subtitle: 'Creator Beta',
      href: '/blueprint/bp_variant',
      statusText: 'Published to science',
    });

    expect(result.items[3]).toMatchObject({
      id: 'feed_unlock',
      kind: 'blueprint',
      title: 'Unlock Blueprint',
      subtitle: 'Creator Gamma',
      href: '/blueprint/bp_unlock',
      statusText: 'In My Feed',
    });

    expect(result.items[4]).toMatchObject({
      id: 'feed_fallback_current',
      kind: 'blueprint',
      title: 'Fallback Blueprint',
      subtitle: 'Creator Delta',
      href: '/blueprint/bp_fallback',
    });

    expect(result.repairCandidates).toEqual([
      { feedItemId: 'feed_variant', blueprintId: 'bp_variant', origin: 'variant' },
      { feedItemId: 'feed_unlock', blueprintId: 'bp_unlock', origin: 'unlock' },
      { feedItemId: 'feed_fallback_current', blueprintId: 'bp_fallback', origin: 'feed-fallback' },
    ]);
    expect(result.unresolvedItemIds).toEqual(['feed_unresolved']);
  });

  it('repairs missing blueprint ids idempotently and reports unresolved rows', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'feed_variant',
          user_id: 'user_1',
          source_item_id: 'source_variant',
          blueprint_id: null,
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-10T10:00:00.000Z',
        },
        {
          id: 'feed_unresolved',
          user_id: 'user_1',
          source_item_id: 'source_unresolved',
          blueprint_id: null,
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-10T09:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_variant',
          source_page_id: 'page_variant',
          source_channel_id: 'UC_variant',
          source_url: 'https://www.youtube.com/watch?v=variant1',
          title: 'Variant video',
          source_channel_title: 'Creator Beta',
          thumbnail_url: null,
          metadata: {},
        },
        {
          id: 'source_unresolved',
          source_page_id: 'page_unresolved',
          source_channel_id: 'UC_unresolved',
          source_url: 'https://www.youtube.com/watch?v=broken1',
          title: 'Broken video',
          source_channel_title: 'Creator Epsilon',
          thumbnail_url: null,
          metadata: {},
        },
      ],
      source_pages: [
        {
          id: 'page_variant',
          platform: 'youtube',
          external_id: 'UC_variant',
          title: 'Creator Beta',
          avatar_url: null,
        },
        {
          id: 'page_unresolved',
          platform: 'youtube',
          external_id: 'UC_unresolved',
          title: 'Creator Epsilon',
          avatar_url: null,
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_variant',
          status: 'processing',
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
          updated_at: '2026-03-10T10:05:00.000Z',
        },
      ],
      source_item_blueprint_variants: [
        {
          source_item_id: 'source_variant',
          status: 'ready',
          blueprint_id: 'bp_variant',
          updated_at: '2026-03-10T10:10:00.000Z',
        },
      ],
      blueprints: [
        { id: 'bp_variant', title: 'Variant Blueprint', banner_url: null },
      ],
    }) as any;

    const dryRun = await repairProfileHistoryBlueprintIdsForUser({
      db,
      userId: 'user_1',
      dryRun: true,
      normalizeTranscriptTruthStatus,
    });

    expect(dryRun).toMatchObject({
      repairedCount: 1,
      unresolvedCount: 1,
      repairedFeedItemIds: ['feed_variant'],
      unresolvedFeedItemIds: ['feed_unresolved'],
      dryRun: true,
    });
    expect(db.state.user_feed_items.find((row: any) => row.id === 'feed_variant')?.blueprint_id).toBeNull();

    const repaired = await repairProfileHistoryBlueprintIdsForUser({
      db,
      userId: 'user_1',
      normalizeTranscriptTruthStatus,
    });

    expect(repaired).toMatchObject({
      repairedCount: 1,
      unresolvedCount: 1,
      repairedFeedItemIds: ['feed_variant'],
      unresolvedFeedItemIds: ['feed_unresolved'],
      dryRun: false,
    });
    expect(db.state.user_feed_items.find((row: any) => row.id === 'feed_variant')?.blueprint_id).toBe('bp_variant');

    const secondPass = await repairProfileHistoryBlueprintIdsForUser({
      db,
      userId: 'user_1',
      normalizeTranscriptTruthStatus,
    });

    expect(secondPass).toMatchObject({
      repairedCount: 0,
      unresolvedCount: 1,
      repairedFeedItemIds: [],
      unresolvedFeedItemIds: ['feed_unresolved'],
      dryRun: false,
    });
  });
});
