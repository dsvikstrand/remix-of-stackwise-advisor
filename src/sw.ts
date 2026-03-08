/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const seenUrls = new Set<string>();
const precacheEntries = (self.__WB_MANIFEST || []).filter((entry) => {
  const url = typeof entry === "string" ? entry : entry.url;
  if (url.endsWith("index.html") || url.endsWith("release.json")) {
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
