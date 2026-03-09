import {
  buildPushNotificationDisplay,
  buildPushNotificationTarget,
  parsePushNotificationPayload,
} from "@/pwa/pushNotificationUtils";

describe("pushNotificationUtils", () => {
  it("parses valid JSON payloads and rejects invalid input", () => {
    expect(parsePushNotificationPayload('{"title":"Hello","link_path":"/wall"}')).toMatchObject({
      title: "Hello",
      link_path: "/wall",
    });
    expect(parsePushNotificationPayload("")).toBeNull();
    expect(parsePushNotificationPayload("{")).toBeNull();
  });

  it("builds a route target under the current base path", () => {
    expect(buildPushNotificationTarget("/", "https://bleup.app", "/wall")).toBe("https://bleup.app/wall");
    expect(buildPushNotificationTarget("/app/", "https://bleup.app", "/wall")).toBe("https://bleup.app/app/wall");
    expect(buildPushNotificationTarget("/app/", "https://bleup.app", null)).toBe("https://bleup.app/app/wall");
  });

  it("maps the payload into a display notification contract", () => {
    const result = buildPushNotificationDisplay("/app/", "https://bleup.app", {
      notification_id: "notif_1",
      type: "comment_reply",
      title: "New reply",
      body: "Someone replied to your comment.",
      link_path: "/wall",
      created_at: "2026-03-08T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      title: "New reply",
      options: {
        body: "Someone replied to your comment.",
        tag: "bleup-notification-notif_1",
        data: {
          url: "https://bleup.app/app/wall",
          notificationId: "notif_1",
          type: "comment_reply",
          createdAt: "2026-03-08T12:00:00.000Z",
        },
      },
    });
    expect(result.options.icon).toBe("https://bleup.app/app/pwa-192x192.png");
    expect(result.options.badge).toBe(result.options.icon);
  });
});
