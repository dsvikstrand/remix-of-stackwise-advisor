/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
  type PrecacheEntry,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

import {
  buildPushNotificationDisplay,
  getPushNotificationUnreadCount,
  parsePushNotificationPayload,
  shouldUseQuietPushBadgeMode,
} from "./pwa/pushNotificationUtils";
import { syncAppBadge, supportsAppBadgeApi } from "./pwa/pushUtils";
import { shouldBypassPwaNavigation } from "./pwa/runtimeUtils";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const PWA_RUNTIME_ENABLED = String(import.meta.env.VITE_FEATURE_PWA_RUNTIME_V1 || "")
  .trim()
  .toLowerCase() === "true";
const PWA_PUSH_ENABLED = String(import.meta.env.VITE_FEATURE_PWA_PUSH_V1 || "")
  .trim()
  .toLowerCase() === "true";
const BASE_PATH = import.meta.env.BASE_URL || "/";
const OFFLINE_FALLBACK_URL = "offline.html";

const seenUrls = new Set<string>();
const precacheEntries = (self.__WB_MANIFEST || []).filter((entry) => {
  const url = typeof entry === "string" ? entry : entry.url;
  if (url.endsWith("index.html") || url.endsWith("release.json") || url.endsWith("404.html")) {
    return false;
  }
  if (!PWA_RUNTIME_ENABLED && url.endsWith(OFFLINE_FALLBACK_URL)) {
    return false;
  }
  if (seenUrls.has(url)) {
    return false;
  }
  seenUrls.add(url);
  return true;
});

cleanupOutdatedCaches();
precacheAndRoute(precacheEntries);

if (PWA_RUNTIME_ENABLED) {
  const navigationStrategy = new NetworkFirst({
    cacheName: "bleup-nav-v1",
  });

  self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") {
      self.skipWaiting();
    }
  });

  clientsClaim();

  registerRoute(
    ({ request, url }) => {
      if (request.mode !== "navigate") return false;
      if (url.origin !== self.location.origin) return false;
      return !shouldBypassPwaNavigation(url, BASE_PATH);
    },
    async ({ event, request }) => {
      try {
        return await navigationStrategy.handle({ event, request });
      } catch {
        const offlineResponse = await matchPrecache(OFFLINE_FALLBACK_URL);
        return offlineResponse || Response.error();
      }
    },
  );
}

if (PWA_PUSH_ENABLED) {
  self.addEventListener("push", (event) => {
    const payload = parsePushNotificationPayload(event.data?.text());
    if (!payload) return;
    event.waitUntil((async () => {
      const badgeSupported = supportsAppBadgeApi(self.navigator);
      if (shouldUseQuietPushBadgeMode(payload, badgeSupported)) {
        const badged = await syncAppBadge(self.navigator, getPushNotificationUnreadCount(payload));
        if (badged) return;
      }

      const display = buildPushNotificationDisplay(BASE_PATH, self.location.origin, payload);
      await self.registration.showNotification(display.title, display.options);
    })());
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = String(event.notification.data?.url || "").trim() || self.location.origin;

    event.waitUntil((async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })());
  });
}
