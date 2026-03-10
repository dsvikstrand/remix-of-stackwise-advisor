import { isLikelyIosSafari } from "./installUtils";

export const PWA_PUSH_CTA_SNOOZE_KEY = "bleup:pwa-push-cta-dismissed-at";
export const PWA_PUSH_CTA_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
export type PushDeliveryMode = "normal" | "quiet_ios";

type BadgeApiCapable = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function isPushCtaSnoozed(dismissedAt: number | null, now = Date.now()) {
  if (!Number.isFinite(dismissedAt)) return false;
  return now - Number(dismissedAt) < PWA_PUSH_CTA_SNOOZE_MS;
}

export function shouldShowPushEnableCta(input: {
  flagEnabled: boolean;
  isStandalone: boolean;
  isAuthenticated: boolean;
  isSupported: boolean;
  backendEnabled: boolean;
  isSubscribed: boolean;
  permissionState: NotificationPermission | "unsupported";
  dismissedAt: number | null;
  now?: number;
}) {
  if (!input.flagEnabled) return false;
  if (!input.isStandalone) return false;
  if (!input.isAuthenticated) return false;
  if (!input.isSupported) return false;
  if (!input.backendEnabled) return false;
  if (input.isSubscribed) return false;
  if (input.permissionState === "unsupported") return false;
  if (input.permissionState === "denied") return true;
  return !isPushCtaSnoozed(input.dismissedAt, input.now);
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4 || 4)) % 4);
  const normalized = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(normalized);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

export function readPushPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export function supportsAppBadgeApi(target: unknown): target is BadgeApiCapable {
  if (!target || typeof target !== "object") return false;
  const badgeTarget = target as BadgeApiCapable;
  return typeof badgeTarget.setAppBadge === "function" || typeof badgeTarget.clearAppBadge === "function";
}

export async function syncAppBadge(target: unknown, unreadCount: number) {
  if (!supportsAppBadgeApi(target)) return false;
  const nextCount = Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0;
  try {
    if (nextCount > 0 && typeof target.setAppBadge === "function") {
      await target.setAppBadge(nextCount);
      return true;
    }
    if (typeof target.clearAppBadge === "function") {
      await target.clearAppBadge();
      return true;
    }
    if (typeof target.setAppBadge === "function") {
      await target.setAppBadge(0);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function isQuietIosPushEligible(input: {
  flagEnabled: boolean;
  isStandalone: boolean;
  isSupported: boolean;
  backendEnabled: boolean;
  badgeSupported: boolean;
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}) {
  if (!input.flagEnabled) return false;
  if (!input.isStandalone) return false;
  if (!input.isSupported) return false;
  if (!input.backendEnabled) return false;
  if (!input.badgeSupported) return false;
  return isLikelyIosSafari({
    userAgent: input.userAgent,
    platform: input.platform,
    maxTouchPoints: input.maxTouchPoints,
  });
}
