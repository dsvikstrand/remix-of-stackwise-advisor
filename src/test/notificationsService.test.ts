import { describe, expect, it } from 'vitest';

import { createNotificationFromEvent, listNotificationsForUser } from '../../server/services/notifications';
import { createMockSupabase } from './helpers/mockSupabase';

describe('notifications service', () => {
  it('creates separate generation_started notifications for different job ids', async () => {
    const db = createMockSupabase({
      notifications: [],
    }) as any;

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_1',
      scope: 'source_item_unlock_generation',
      queuedCount: 1,
      itemTitle: 'Blueprint A',
    });

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_2',
      scope: 'source_item_unlock_generation',
      queuedCount: 1,
      itemTitle: 'Blueprint B',
    });

    const page = await listNotificationsForUser(db, {
      userId: 'user_1',
      limit: 10,
    });

    expect(page.items).toHaveLength(2);
    expect(page.items.map((item) => item.type)).toEqual([
      'generation_started',
      'generation_started',
    ]);
    expect(page.items.map((item) => item.metadata.job_id)).toEqual([
      'job_2',
      'job_1',
    ]);
  });

  it('dedupes repeated generation_started emits for the same job id', async () => {
    const db = createMockSupabase({
      notifications: [],
    }) as any;

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_1',
      scope: 'search_video_generate',
      queuedCount: 1,
      itemTitle: 'Blueprint A',
    });

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_1',
      scope: 'search_video_generate',
      queuedCount: 1,
      itemTitle: 'Blueprint A',
    });

    const page = await listNotificationsForUser(db, {
      userId: 'user_1',
      limit: 10,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.metadata.job_id).toBe('job_1');
  });
});
