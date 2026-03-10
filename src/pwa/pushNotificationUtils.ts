import type { PushDeliveryMode } from "./pushUtils";
import { joinBasePath } from "./runtimeUtils";

export type PushNotificationPayload = {
  notification_id?: string | null;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  link_path?: string | null;
  created_at?: string | null;
  delivery_mode?: PushDeliveryMode | null;
  unread_count?: number | null;
};

export function parsePushNotificationPayload(raw: string | null | undefined): PushNotificationPayload | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PushNotificationPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function buildPushNotificationTarget(basePath: string, origin: string, linkPath?: string | null) {
  const normalizedPath = String(linkPath || "").trim() || "/wall";
  const joinedPath = normalizedPath.startsWith("/")
    ? joinBasePath(basePath, normalizedPath.replace(/^\/+/, ""))
    : joinBasePath(basePath, normalizedPath);
  return new URL(joinedPath, origin).toString();
}

export function buildPushNotificationDisplay(basePath: string, origin: string, payload: PushNotificationPayload) {
  const title = String(payload.title || "").trim() || "Bleup update";
  const body = String(payload.body || "").trim() || "Open Bleup to view the latest update.";
  const url = buildPushNotificationTarget(basePath, origin, payload.link_path);
  const icon = new URL(joinBasePath(basePath, "pwa-192x192.png"), origin).toString();
  return {
    title,
    options: {
      body,
      icon,
      badge: icon,
      tag: payload.notification_id ? `bleup-notification-${payload.notification_id}` : undefined,
      data: {
        url,
        notificationId: payload.notification_id || null,
        type: payload.type || null,
        createdAt: payload.created_at || null,
      },
    },
  };
}

export function getPushNotificationUnreadCount(payload: PushNotificationPayload) {
  const parsed = Number(payload.unread_count);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function shouldUseQuietPushBadgeMode(payload: PushNotificationPayload, badgeSupported: boolean) {
  return badgeSupported && payload.delivery_mode === "quiet_ios";
}
