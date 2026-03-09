import { describe, expect, it, vi } from "vitest";

import {
  buildNotificationPushPayload,
  classifyNotificationPushError,
  createNotificationPushSender,
  deactivateNotificationPushSubscription,
  getNotificationPushRetryDelaySeconds,
  isNotificationPushEligibleType,
  processNotificationPushDispatchBatch,
  resolveWebPushClient,
  upsertNotificationPushSubscription,
  type NotificationPushSubscriptionRow,
} from "../../server/services/notificationPush";
import { createMockSupabase } from "./helpers/mockSupabase";

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
    });

    expect(created).toMatchObject({
      user_id: "user_1",
      endpoint: "https://push.example.com/sub-1",
      is_active: true,
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
