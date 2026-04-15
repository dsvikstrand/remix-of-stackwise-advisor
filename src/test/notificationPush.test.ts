import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildNotificationPushPayload,
  classifyNotificationPushError,
  configureNotificationPushOracleReadAdapter,
  createNotificationPushSender,
  deactivateNotificationPushSubscription,
  getNotificationPushRetryDelaySeconds,
  isNotificationPushEligibleType,
  processNotificationPushDispatchBatch,
  resolveWebPushClient,
  upsertNotificationPushSubscription,
  type NotificationPushSubscriptionRow,
} from "../../server/services/notificationPush";
import { openOracleControlPlaneDb } from "../../server/services/oracleControlPlaneDb";
import {
  countUnreadOracleNotificationsForUser,
  getOracleNotificationRowById,
  upsertOracleNotificationRow,
} from "../../server/services/oracleNotifications";
import { createMockSupabase } from "./helpers/mockSupabase";

const tempDirs: string[] = [];

afterEach(() => {
  configureNotificationPushOracleReadAdapter(null);
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oracle-notification-push-"));
  tempDirs.push(dir);
  return path.join(dir, "control-plane.sqlite");
}

function createSubscriptionRow(overrides: Partial<NotificationPushSubscriptionRow> = {}): NotificationPushSubscriptionRow {
  return {
    id: "push_sub_1",
    user_id: "user_1",
    endpoint: "https://push.example.com/endpoint-1",
    p256dh: "p256dh_key",
    auth: "auth_key",
    expiration_time: null,
    platform: "ios",
    user_agent: "test-agent",
    delivery_mode: "normal",
    is_active: true,
    last_seen_at: "2026-03-08T12:00:00.000Z",
    created_at: "2026-03-08T12:00:00.000Z",
    updated_at: "2026-03-08T12:00:00.000Z",
    ...overrides,
  };
}

describe("notificationPush service", () => {
  it("accepts only the configured notification types for push", () => {
    expect(isNotificationPushEligibleType("comment_reply")).toBe(true);
    expect(isNotificationPushEligibleType("generation_succeeded")).toBe(true);
    expect(isNotificationPushEligibleType("generation_failed")).toBe(true);
    expect(isNotificationPushEligibleType("generation_started")).toBe(false);
  });

  it("upserts and deactivates browser subscriptions for the current user", async () => {
    const db = createMockSupabase({
      notification_push_subscriptions: [],
    }) as any;

    const created = await upsertNotificationPushSubscription(db, {
      userId: "user_1",
      endpoint: "https://push.example.com/sub-1",
      p256dh: "p256dh_1",
      auth: "auth_1",
      platform: "ios",
      userAgent: "ua",
      deliveryMode: "quiet_ios",
    });

    expect(created).toMatchObject({
      user_id: "user_1",
      endpoint: "https://push.example.com/sub-1",
      is_active: true,
      delivery_mode: "quiet_ios",
    });

    const updated = await upsertNotificationPushSubscription(db, {
      userId: "user_1",
      endpoint: "https://push.example.com/sub-1",
      p256dh: "p256dh_2",
      auth: "auth_2",
      platform: "ios",
      userAgent: "ua-2",
    });

    expect(updated).toMatchObject({
      endpoint: "https://push.example.com/sub-1",
      p256dh: "p256dh_2",
      auth: "auth_2",
      delivery_mode: "normal",
      is_active: true,
    });

    const deactivated = await deactivateNotificationPushSubscription(db, {
      userId: "user_1",
      endpoint: "https://push.example.com/sub-1",
    });

    expect(deactivated).toMatchObject({
      endpoint: "https://push.example.com/sub-1",
      is_active: false,
    });
  });

  it("processes a queued dispatch successfully when active subscriptions exist", async () => {
    const db = createMockSupabase({
      notifications: [
        {
          id: "notif_1",
          user_id: "user_1",
          type: "comment_reply",
          title: "New reply",
          body: "Someone replied.",
          link_path: "/wall",
          created_at: "2026-03-08T12:00:00.000Z",
        },
      ],
      notification_push_dispatch_queue: [
        {
          id: "dispatch_1",
          notification_id: "notif_1",
          user_id: "user_1",
          status: "queued",
          attempt_count: 0,
          next_attempt_at: "2026-03-08T11:59:00.000Z",
          last_error: null,
          delivered_subscription_count: 0,
          last_attempt_at: null,
          sent_at: null,
          created_at: "2026-03-08T11:58:00.000Z",
          updated_at: "2026-03-08T11:58:00.000Z",
        },
      ],
      notification_push_subscriptions: [createSubscriptionRow()],
    }) as any;

    const sendPushNotification = vi.fn(async () => undefined);

    const claimed = await processNotificationPushDispatchBatch(db, {
      maxAttempts: 3,
      processingStaleMs: 300_000,
      batchSize: 10,
      sendPushNotification,
      now: () => new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(claimed).toHaveLength(1);
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
    expect(buildNotificationPushPayload(db.state.notifications[0])).toMatchObject({
      notification_id: "notif_1",
      type: "comment_reply",
      delivery_mode: "normal",
    });
    expect(db.state.notification_push_dispatch_queue[0]).toMatchObject({
      status: "sent",
      delivered_subscription_count: 1,
    });
  });

  it("deactivates permanently invalid subscriptions and marks the queue as having no subscribers", async () => {
    const db = createMockSupabase({
      notifications: [
        {
          id: "notif_2",
          user_id: "user_1",
          type: "generation_failed",
          title: "Generation failed",
          body: "Something went wrong.",
          link_path: "/generation-queue",
          created_at: "2026-03-08T12:00:00.000Z",
        },
      ],
      notification_push_dispatch_queue: [
        {
          id: "dispatch_2",
          notification_id: "notif_2",
          user_id: "user_1",
          status: "queued",
          attempt_count: 0,
          next_attempt_at: "2026-03-08T11:59:00.000Z",
          last_error: null,
          delivered_subscription_count: 0,
          last_attempt_at: null,
          sent_at: null,
          created_at: "2026-03-08T11:58:00.000Z",
          updated_at: "2026-03-08T11:58:00.000Z",
        },
      ],
      notification_push_subscriptions: [createSubscriptionRow({ id: "push_sub_permanent" })],
    }) as any;

    await processNotificationPushDispatchBatch(db, {
      maxAttempts: 3,
      processingStaleMs: 300_000,
      batchSize: 10,
      sendPushNotification: vi.fn(async () => {
        const error = new Error("gone") as Error & { statusCode?: number };
        error.statusCode = 410;
        throw error;
      }),
      now: () => new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(db.state.notification_push_subscriptions[0]).toMatchObject({
      is_active: false,
    });
    expect(db.state.notification_push_dispatch_queue[0]).toMatchObject({
      status: "no_subscribers",
    });
  });

  it("retries transient delivery failures with bounded backoff", async () => {
    const db = createMockSupabase({
      notifications: [
        {
          id: "notif_3",
          user_id: "user_1",
          type: "generation_succeeded",
          title: "Generation done",
          body: "Blueprint is ready.",
          link_path: "/wall",
          created_at: "2026-03-08T12:00:00.000Z",
        },
      ],
      notification_push_dispatch_queue: [
        {
          id: "dispatch_3",
          notification_id: "notif_3",
          user_id: "user_1",
          status: "queued",
          attempt_count: 0,
          next_attempt_at: "2026-03-08T11:59:00.000Z",
          last_error: null,
          delivered_subscription_count: 0,
          last_attempt_at: null,
          sent_at: null,
          created_at: "2026-03-08T11:58:00.000Z",
          updated_at: "2026-03-08T11:58:00.000Z",
        },
      ],
      notification_push_subscriptions: [createSubscriptionRow({ id: "push_sub_transient" })],
    }) as any;

    await processNotificationPushDispatchBatch(db, {
      maxAttempts: 3,
      processingStaleMs: 300_000,
      batchSize: 10,
      sendPushNotification: vi.fn(async () => {
        throw new Error("temporary delivery issue");
      }),
      now: () => new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(db.state.notification_push_dispatch_queue[0].status).toBe("retry");
    expect(db.state.notification_push_dispatch_queue[0].next_attempt_at).toBe("2026-03-08T12:00:30.000Z");
    expect(db.state.notification_push_dispatch_queue[0].last_error).toContain("temporary delivery issue");
    expect(getNotificationPushRetryDelaySeconds(1)).toBe(30);
  });

  it("marks the dispatch dead after the bounded retry budget is exhausted", async () => {
    const db = createMockSupabase({
      notifications: [
        {
          id: "notif_4",
          user_id: "user_1",
          type: "generation_succeeded",
          title: "Generation done",
          body: "Blueprint is ready.",
          link_path: "/wall",
          created_at: "2026-03-08T12:00:00.000Z",
        },
      ],
      notification_push_dispatch_queue: [
        {
          id: "dispatch_4",
          notification_id: "notif_4",
          user_id: "user_1",
          status: "queued",
          attempt_count: 2,
          next_attempt_at: "2026-03-08T11:59:00.000Z",
          last_error: null,
          delivered_subscription_count: 0,
          last_attempt_at: null,
          sent_at: null,
          created_at: "2026-03-08T11:58:00.000Z",
          updated_at: "2026-03-08T11:58:00.000Z",
        },
      ],
      notification_push_subscriptions: [createSubscriptionRow({ id: "push_sub_dead" })],
    }) as any;

    await processNotificationPushDispatchBatch(db, {
      maxAttempts: 3,
      processingStaleMs: 300_000,
      batchSize: 10,
      sendPushNotification: vi.fn(async () => {
        throw new Error("still broken");
      }),
      now: () => new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(db.state.notification_push_dispatch_queue[0]).toMatchObject({
      status: "dead",
    });
  });

  it("reports push sender configuration truthfully", () => {
    expect(
      createNotificationPushSender({
        enabled: false,
        publicKey: null,
        privateKey: null,
        subject: null,
      }),
    ).toBeNull();

    expect(
      classifyNotificationPushError(Object.assign(new Error("gone"), { statusCode: 404 })),
    ).toMatchObject({ kind: "permanent", statusCode: 404 });
    expect(classifyNotificationPushError(new Error("temp"))).toMatchObject({ kind: "transient" });
  });

  it("reads notification payload and unread count from Oracle during quiet push dispatch", async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      notifications: [],
      notification_push_dispatch_queue: [
        {
          id: "dispatch_oracle_1",
          notification_id: "notif_oracle_1",
          user_id: "user_1",
          status: "queued",
          attempt_count: 0,
          next_attempt_at: "2026-03-08T11:59:00.000Z",
          last_error: null,
          delivered_subscription_count: 0,
          last_attempt_at: null,
          sent_at: null,
          created_at: "2026-03-08T11:58:00.000Z",
          updated_at: "2026-03-08T11:58:00.000Z",
        },
      ],
      notification_push_subscriptions: [createSubscriptionRow({ delivery_mode: "quiet_ios" })],
    }) as any;

    configureNotificationPushOracleReadAdapter({
      countUnreadNotificationsForUser: async (input) => countUnreadOracleNotificationsForUser({
        controlDb,
        userId: input.userId,
      }),
      getNotificationById: async (input) => {
        const row = await getOracleNotificationRowById({
          controlDb,
          notificationId: input.notificationId,
        });
        if (!row) return null;
        return {
          id: row.id,
          user_id: row.user_id,
          type: row.type,
          title: row.title,
          body: row.body,
          link_path: row.link_path,
          created_at: row.created_at,
        };
      },
    });

    try {
      await upsertOracleNotificationRow({
        controlDb,
        row: {
          id: "notif_oracle_1",
          user_id: "user_1",
          type: "generation_failed",
          title: "Generation failed",
          body: "Retry later.",
          link_path: "/wall",
          metadata: {},
        },
        nowIso: "2026-03-08T12:00:00.000Z",
      });

      await upsertOracleNotificationRow({
        controlDb,
        row: {
          id: "notif_oracle_2",
          user_id: "user_1",
          type: "generation_succeeded",
          title: "Generated",
          body: "Ready.",
          link_path: "/wall",
          metadata: {},
        },
        nowIso: "2026-03-08T12:01:00.000Z",
      });

      const sendPushNotification = vi.fn(async () => undefined);

      await processNotificationPushDispatchBatch(db, {
        maxAttempts: 3,
        processingStaleMs: 300_000,
        batchSize: 10,
        quietIosEnabled: true,
        sendPushNotification,
        now: () => new Date("2026-03-08T12:02:00.000Z"),
      });

      expect(sendPushNotification).toHaveBeenCalledTimes(1);
      expect(sendPushNotification.mock.calls[0]?.[1]).toMatchObject({
        notification_id: "notif_oracle_1",
        delivery_mode: "quiet_ios",
        unread_count: 2,
      });
      expect(db.state.notification_push_dispatch_queue[0]).toMatchObject({
        status: "sent",
        delivered_subscription_count: 1,
      });
    } finally {
      await controlDb.close();
    }
  });

  it("includes quiet delivery metadata and unread count for quiet iPhone subscriptions", async () => {
    const db = createMockSupabase({
      notifications: [
        {
          id: "notif_quiet",
          user_id: "user_1",
          type: "generation_succeeded",
          title: "Generation done",
          body: "Blueprint is ready.",
          link_path: "/wall",
          is_read: false,
          created_at: "2026-03-08T12:00:00.000Z",
        },
        {
          id: "notif_unread_2",
          user_id: "user_1",
          type: "comment_reply",
          title: "Another unread",
          body: "Still unread.",
          link_path: "/wall",
          is_read: false,
          created_at: "2026-03-08T12:00:01.000Z",
        },
      ],
      notification_push_dispatch_queue: [
        {
          id: "dispatch_quiet",
          notification_id: "notif_quiet",
          user_id: "user_1",
          status: "queued",
          attempt_count: 0,
          next_attempt_at: "2026-03-08T11:59:00.000Z",
          last_error: null,
          delivered_subscription_count: 0,
          last_attempt_at: null,
          sent_at: null,
          created_at: "2026-03-08T11:58:00.000Z",
          updated_at: "2026-03-08T11:58:00.000Z",
        },
      ],
      notification_push_subscriptions: [createSubscriptionRow({ delivery_mode: "quiet_ios" })],
    }) as any;

    const sendPushNotification = vi.fn(async () => undefined);

    await processNotificationPushDispatchBatch(db, {
      maxAttempts: 3,
      processingStaleMs: 300_000,
      batchSize: 10,
      quietIosEnabled: true,
      sendPushNotification,
      now: () => new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_mode: "quiet_ios" }),
      expect.objectContaining({
        delivery_mode: "quiet_ios",
        unread_count: 2,
      }),
    );
  });

  it("normalizes the web-push client shape and configures the sender", async () => {
    const setVapidDetails = vi.fn();
    const sendNotification = vi.fn(async () => undefined);
    const client = resolveWebPushClient({
      default: {
        setVapidDetails,
        sendNotification,
      },
    });

    const sender = createNotificationPushSender(
      {
        enabled: true,
        publicKey: "public",
        privateKey: "private",
        subject: "mailto:david@example.com",
      },
      client,
    );

    expect(sender).not.toBeNull();
    expect(setVapidDetails).toHaveBeenCalledWith("mailto:david@example.com", "public", "private");

    await sender?.(
      createSubscriptionRow({ expiration_time: "2026-03-08T13:00:00.000Z" }),
      {
        notification_id: "notif_5",
        type: "generation_failed",
        title: "Generation failed",
        body: "Something broke.",
        link_path: "/generation-queue",
        created_at: "2026-03-08T12:00:00.000Z",
      },
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
