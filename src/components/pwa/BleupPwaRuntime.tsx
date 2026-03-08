import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { config } from "@/config/runtime";
import {
  getInstallCtaKind,
  PWA_INSTALL_CTA_DISMISS_KEY,
  shouldShowInstallCta,
  type InstallCtaKind,
} from "@/pwa/installUtils";
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

type BleupPwaContextValue = {
  installCtaKind: InstallCtaKind;
  isStandaloneMode: boolean;
  canShowInstallCta: boolean;
  dismissInstallCta: () => void;
  openInstallExperience: () => Promise<void>;
};

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

const BleupPwaContext = createContext<BleupPwaContextValue>({
  installCtaKind: null,
  isStandaloneMode: false,
  canShowInstallCta: false,
  dismissInstallCta: () => undefined,
  openInstallExperience: async () => undefined,
});

export function BleupPwaRuntime({ children }: { children: ReactNode }) {
  const [hasWaitingWorker, setHasWaitingWorker] = useState(false);
  const [latestReleaseSha, setLatestReleaseSha] = useState<string | null>(null);
  const [dismissedReleaseKey, setDismissedReleaseKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => readStandaloneMode());
  const [hasBeforeInstallPrompt, setHasBeforeInstallPrompt] = useState(false);
  const [dismissedInstallAt, setDismissedInstallAt] = useState<number | null>(() => readDismissedInstallAt());
  const registrationRef = useRef<BleupPwaRegistration | null>(null);
  const deferredInstallPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const runtimeEnabled = import.meta.env.PROD && config.features.pwaRuntimeV1;
  const installCtaEnabled = config.features.pwaInstallCtaV1;
  const currentReleaseSha = config.releaseSha;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.displayMode = isStandaloneMode ? "standalone" : "browser";
    return () => {
      delete document.documentElement.dataset.displayMode;
    };
  }, [isStandaloneMode]);

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
    if (!installCtaEnabled || typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      deferredInstallPromptRef.current = installEvent;
      setHasBeforeInstallPrompt(true);
    };

    const handleAppInstalled = () => {
      deferredInstallPromptRef.current = null;
      setHasBeforeInstallPrompt(false);
      clearDismissedInstallAt();
      setDismissedInstallAt(null);
      setIsStandaloneMode(readStandaloneMode());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [installCtaEnabled]);

  useEffect(() => {
    if (!isStandaloneMode) return;
    deferredInstallPromptRef.current = null;
    setHasBeforeInstallPrompt(false);
    clearDismissedInstallAt();
    setDismissedInstallAt(null);
  }, [isStandaloneMode]);

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

  const installCtaKind = useMemo(
    () =>
      installCtaEnabled && typeof window !== "undefined"
        ? getInstallCtaKind({
            userAgent: window.navigator.userAgent,
            platform: window.navigator.platform,
            maxTouchPoints: window.navigator.maxTouchPoints,
            isStandalone: isStandaloneMode,
            hasBeforeInstallPrompt,
          })
        : null,
    [hasBeforeInstallPrompt, installCtaEnabled, isStandaloneMode],
  );

  const canShowInstallCta = shouldShowInstallCta({
    flagEnabled: installCtaEnabled,
    installCtaKind,
    isStandalone: isStandaloneMode,
    dismissedAt: dismissedInstallAt,
  });

  const shouldShowUpdatePrompt =
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

  async function openInstallExperience() {
    if (installCtaKind !== "chromium") return;
    const installEvent = deferredInstallPromptRef.current;
    if (!installEvent) return;

    deferredInstallPromptRef.current = null;
    setHasBeforeInstallPrompt(false);

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        clearDismissedInstallAt();
        setDismissedInstallAt(null);
      }
    } catch {
      // Ignore prompt failures; the CTA remains dismissible and can recover on a later event.
    }
  }

  function dismissInstallCta() {
    const nextDismissedAt = Date.now();
    writeDismissedInstallAt(nextDismissedAt);
    setDismissedInstallAt(nextDismissedAt);
  }

  function handleLaterOnUpdatePrompt() {
    if (!availableReleaseKey) return;
    setDismissedReleaseKey(availableReleaseKey);
  }

  return (
    <BleupPwaContext.Provider
      value={{
        installCtaKind,
        isStandaloneMode,
        canShowInstallCta,
        dismissInstallCta,
        openInstallExperience,
      }}
    >
      {children}
      {shouldShowUpdatePrompt ? (
        <PwaUpdatePrompt
          isRefreshing={isRefreshing}
          onRefreshNow={handleRefreshNow}
          onLater={handleLaterOnUpdatePrompt}
        />
      ) : null}
    </BleupPwaContext.Provider>
  );
}

export function useBleupPwa() {
  return useContext(BleupPwaContext);
}

function readStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const matchesDisplayMode =
    "matchMedia" in window ? window.matchMedia("(display-mode: standalone)").matches : false;
  return matchesDisplayMode || navigatorWithStandalone.standalone === true;
}

function readDismissedInstallAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PWA_INSTALL_CTA_DISMISS_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function writeDismissedInstallAt(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PWA_INSTALL_CTA_DISMISS_KEY, String(value));
}

function clearDismissedInstallAt() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PWA_INSTALL_CTA_DISMISS_KEY);
}
