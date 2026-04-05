import { describe, expect, it } from 'vitest';
import {
  getSubscriptionShadowChangedFields,
  shouldSkipSupabaseSubscriptionShadowWrite,
} from '../../server/services/subscriptionShadowPolicy';

describe('subscription shadow policy', () => {
  it('treats hot sync fields as the only changed fields for steady-state sync updates', () => {
    const changedFields = getSubscriptionShadowChangedFields(
      {
        source_channel_id: 'channel_1',
        source_channel_title: 'Channel 1',
        last_polled_at: '2026-04-05T09:00:00.000Z',
        last_seen_published_at: '2026-04-05T08:00:00.000Z',
        last_seen_video_id: 'video_old',
        last_sync_error: 'SYNC_FAILED',
      },
      {
        source_channel_id: 'channel_1',
        source_channel_title: 'Channel 1',
        last_polled_at: '2026-04-05T10:00:00.000Z',
        last_seen_published_at: '2026-04-05T09:30:00.000Z',
        last_seen_video_id: 'video_new',
        last_sync_error: null,
      },
    );

    expect(changedFields).toEqual([
      'last_polled_at',
      'last_seen_published_at',
      'last_seen_video_id',
      'last_sync_error',
    ]);
  });

  it('skips Supabase shadow writes for hot sync-only changes in primary mode', () => {
    expect(shouldSkipSupabaseSubscriptionShadowWrite({
      action: 'subscription_sync_success',
      primaryEnabled: true,
      changedFields: ['last_polled_at', 'last_seen_published_at', 'last_seen_video_id', 'last_sync_error'],
    })).toBe(true);

    expect(shouldSkipSupabaseSubscriptionShadowWrite({
      action: 'subscription_feed_soft_failure',
      primaryEnabled: true,
      changedFields: ['last_polled_at', 'last_sync_error'],
    })).toBe(true);
  });

  it('keeps Supabase shadow writes for non-primary, non-sync, or identity-changing updates', () => {
    expect(shouldSkipSupabaseSubscriptionShadowWrite({
      action: 'subscription_sync_success',
      primaryEnabled: false,
      changedFields: ['last_polled_at', 'last_seen_published_at'],
    })).toBe(false);

    expect(shouldSkipSupabaseSubscriptionShadowWrite({
      action: 'subscription_feed_channel_recovered',
      primaryEnabled: true,
      changedFields: ['source_channel_id', 'source_channel_url', 'source_channel_title'],
    })).toBe(false);

    expect(shouldSkipSupabaseSubscriptionShadowWrite({
      action: 'subscription_sync_success',
      primaryEnabled: true,
      changedFields: ['source_channel_title', 'last_polled_at'],
    })).toBe(false);
  });
});
