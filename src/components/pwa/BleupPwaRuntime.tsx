import { useEffect, useMemo, useRef, useState } from "react";

import { config } from "@/config/runtime";
import { registerBleupPwa, type BleupPwaRegistration } from "@/pwa/register";
import {
  buildReleaseMetadataUrl,
  getPwaAvailableReleaseKey,
  sanitizeReleaseSha,
} from "@/pwa/runtimeUtils";

import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

const RELEASE_POLL_INTERVAL_MS = 5 * 60 * 1000;

type ReleaseMetadata = {
  release_sha?: string | null;
};

export function BleupPwaRuntime() {
  const [hasWaitingWorker, setHasWaitingWorker] = useState(false);
  const [latestReleaseSha, setLatestReleaseSha] = useState<string | null>(null);
  const [dismissedReleaseKey, setDismissedReleaseKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => readStandaloneMode());
  const registrationRef = useRef<BleupPwaRegistration | null>(null);

  const runtimeEnabled = import.meta.env.PROD && config.features.pwaRuntimeV1;
  const currentReleaseSha = config.releaseSha;

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateStandaloneMode = () => {
      setIsStandaloneMode(readStandaloneMode());
    };

    updateStandaloneMode();

    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", updateStandaloneMode);
      return () => mediaQuery.removeEventListener("change", updateStandaloneMode);
    }

    mediaQuery.addListener(updateStandaloneMode);
    return () => mediaQuery.removeListener(updateStandaloneMode);
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let isDisposed = false;
    let intervalId: number | null = null;
    let removeFocusListener: (() => void) | null = null;
    let removeVisibilityListener: (() => void) | null = null;

    async function fetchLatestReleaseSha() {
      if (!runtimeEnabled || !currentReleaseSha || typeof window === "undefined") return;

      try {
        const response = await fetch(buildReleaseMetadataUrl(config.basePath, window.location.origin), {
          cache: "no-store",
          headers: {
            "cache-control": "no-cache",
          },
        });
        if (!response.ok) return;

        const body = (await response.json()) as ReleaseMetadata;
        const nextReleaseSha = sanitizeReleaseSha(body.release_sha);
        if (isDisposed) return;

        if (nextReleaseSha && nextReleaseSha !== currentReleaseSha) {
          setLatestReleaseSha(nextReleaseSha);
          void registrationRef.current?.checkForUpdate();
          return;
        }

        setLatestReleaseSha(null);
      } catch {
        // Ignore transient release metadata failures; update checks are best-effort.
      }
    }

    void registerBleupPwa({
      enableRefreshCallbacks: runtimeEnabled,
      onNeedRefresh: () => {
        if (isDisposed || !runtimeEnabled) return;
        setHasWaitingWorker(true);
      },
    }).then((registration) => {
      if (isDisposed) return;
      registrationRef.current = registration;

      if (!runtimeEnabled || !currentReleaseSha || typeof window === "undefined") {
        return;
      }

      void fetchLatestReleaseSha();

      const onFocus = () => {
        void fetchLatestReleaseSha();
      };
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          void fetchLatestReleaseSha();
        }
      };

      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibilityChange);
      intervalId = window.setInterval(() => {
        void fetchLatestReleaseSha();
      }, RELEASE_POLL_INTERVAL_MS);

      removeFocusListener = () => window.removeEventListener("focus", onFocus);
      removeVisibilityListener = () => document.removeEventListener("visibilitychange", onVisibilityChange);
    });

    return () => {
      isDisposed = true;
      registrationRef.current = null;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      removeFocusListener?.();
      removeVisibilityListener?.();
    };
  }, [currentReleaseSha, runtimeEnabled]);

  const availableReleaseKey = useMemo(
    () =>
      getPwaAvailableReleaseKey({
        currentReleaseSha,
        latestReleaseSha,
        hasWaitingWorker,
      }),
    [currentReleaseSha, latestReleaseSha, hasWaitingWorker],
  );

  const shouldShowPrompt =
    runtimeEnabled &&
    isStandaloneMode &&
    Boolean(availableReleaseKey) &&
    availableReleaseKey !== dismissedReleaseKey;

  async function handleRefreshNow() {
    setIsRefreshing(true);
    try {
      if (hasWaitingWorker) {
        await registrationRef.current?.activateWaitingUpdate();
        return;
      }
    } catch {
      // Fall through to a hard reload below.
    }

    window.location.reload();
  }

  function handleLater() {
    if (!availableReleaseKey) return;
    setDismissedReleaseKey(availableReleaseKey);
  }

  if (!shouldShowPrompt) {
    return null;
  }

  return (
    <PwaUpdatePrompt
      isRefreshing={isRefreshing}
      onRefreshNow={handleRefreshNow}
      onLater={handleLater}
    />
  );
}

function readStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const matchesDisplayMode =
    "matchMedia" in window ? window.matchMedia("(display-mode: standalone)").matches : false;
  return matchesDisplayMode || navigatorWithStandalone.standalone === true;
}
