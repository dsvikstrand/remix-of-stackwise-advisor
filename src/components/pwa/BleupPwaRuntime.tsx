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
import { useAuth } from "@/contexts/AuthContext";
import {
  disableNotificationPushSubscription,
  getNotificationPushConfig,
  upsertNotificationPushSubscription,
} from "@/lib/notificationsApi";
import {
  getInstallCtaKind,
  PWA_INSTALL_CTA_DISMISS_KEY,
  shouldShowInstallCta,
  type InstallCtaKind,
} from "@/pwa/installUtils";
import { registerBleupPwa, type BleupPwaRegistration } from "@/pwa/register";
import {
  PWA_PUSH_CTA_SNOOZE_KEY,
  readPushPermissionState,
  shouldShowPushEnableCta,
  urlBase64ToUint8Array,
} from "@/pwa/pushUtils";
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
  push: {
    isSupported: boolean;
    isAvailable: boolean;
    permissionState: NotificationPermission | "unsupported";
    isSubscribed: boolean;
    isBusy: boolean;
    canShowEnableCta: boolean;
    dismissEnableCta: () => void;
    enable: () => Promise<void>;
    disable: () => Promise<void>;
  };
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
  push: {
    isSupported: false,
    isAvailable: false,
    permissionState: "unsupported",
    isSubscribed: false,
    isBusy: false,
    canShowEnableCta: false,
    dismissEnableCta: () => undefined,
    enable: async () => undefined,
    disable: async () => undefined,
  },
});

export function BleupPwaRuntime({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hasWaitingWorker, setHasWaitingWorker] = useState(false);
  const [latestReleaseSha, setLatestReleaseSha] = useState<string | null>(null);
  const [dismissedReleaseKey, setDismissedReleaseKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => readStandaloneMode());
  const [hasBeforeInstallPrompt, setHasBeforeInstallPrompt] = useState(false);
  const [dismissedInstallAt, setDismissedInstallAt] = useState<number | null>(() => readDismissedInstallAt());
  const [pushBackendEnabled, setPushBackendEnabled] = useState(false);
  const [pushVapidPublicKey, setPushVapidPublicKey] = useState<string | null>(null);
  const [pushPermissionState, setPushPermissionState] = useState<NotificationPermission | "unsupported">(() => readPushPermissionState());
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [dismissedPushAt, setDismissedPushAt] = useState<number | null>(() => readDismissedPushAt());
  const [isPushBusy, setIsPushBusy] = useState(false);
  const registrationRef = useRef<BleupPwaRegistration | null>(null);
  const deferredInstallPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const runtimeEnabled = import.meta.env.PROD && config.features.pwaRuntimeV1;
  const installCtaEnabled = config.features.pwaInstallCtaV1;
  const pushFeatureEnabled = import.meta.env.PROD && config.features.pwaPushV1;
  const currentReleaseSha = config.releaseSha;
  const pushSupported = pushFeatureEnabled
    && typeof window !== "undefined"
    && "Notification" in window
    && "PushManager" in window
    && "serviceWorker" in navigator;

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
    if (!user?.id) {
      clearDismissedPushAt();
      setDismissedPushAt(null);
      setIsPushSubscribed(false);
      setPushEndpoint(null);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isPushSubscribed) return;
    clearDismissedPushAt();
    setDismissedPushAt(null);
  }, [isPushSubscribed]);

  useEffect(() => {
    if (!pushFeatureEnabled || typeof window === "undefined") return;

    let isDisposed = false;

    async function refreshPushState() {
      if (isDisposed) return;

      setPushPermissionState(readPushPermissionState());

      if (!user?.id) {
        setPushBackendEnabled(false);
        setPushVapidPublicKey(null);
        setIsPushSubscribed(false);
        setPushEndpoint(null);
        return;
      }

      try {
        const nextConfig = await getNotificationPushConfig();
        if (isDisposed) return;
        setPushBackendEnabled(Boolean(nextConfig.enabled && nextConfig.vapid_public_key));
        setPushVapidPublicKey(nextConfig.vapid_public_key || null);
      } catch {
        if (isDisposed) return;
        setPushBackendEnabled(false);
        setPushVapidPublicKey(null);
      }

      if (!pushSupported) {
        if (isDisposed) return;
        setIsPushSubscribed(false);
        setPushEndpoint(null);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (isDisposed) return;
        setIsPushSubscribed(Boolean(subscription));
        setPushEndpoint(subscription?.endpoint || null);
      } catch {
        if (isDisposed) return;
        setIsPushSubscribed(false);
        setPushEndpoint(null);
      }
    }

    void refreshPushState();

    const onFocus = () => {
      void refreshPushState();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshPushState();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isDisposed = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pushFeatureEnabled, pushSupported, user?.id]);

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

  const pushAvailable = pushSupported
    && isStandaloneMode
    && Boolean(user?.id)
    && pushBackendEnabled
    && Boolean(pushVapidPublicKey);

  const canShowPushEnableCta = shouldShowPushEnableCta({
    flagEnabled: pushFeatureEnabled,
    isStandalone: isStandaloneMode,
    isAuthenticated: Boolean(user?.id),
    isSupported: pushSupported,
    backendEnabled: pushBackendEnabled,
    isSubscribed: isPushSubscribed,
    permissionState: pushPermissionState,
    dismissedAt: dismissedPushAt,
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

  function dismissPushCta() {
    const nextDismissedAt = Date.now();
    writeDismissedPushAt(nextDismissedAt);
    setDismissedPushAt(nextDismissedAt);
  }

  function handleLaterOnUpdatePrompt() {
    if (!availableReleaseKey) return;
    setDismissedReleaseKey(availableReleaseKey);
  }

  async function enablePush() {
    if (!pushAvailable || !pushVapidPublicKey || !user?.id) return;

    setIsPushBusy(true);
    try {
      let nextPermission = readPushPermissionState();
      if (nextPermission === "default" && typeof Notification !== "undefined") {
        nextPermission = await Notification.requestPermission();
      }
      setPushPermissionState(nextPermission);
      if (nextPermission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushVapidPublicKey),
        });
      }

      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
        throw new Error("PUSH_SUBSCRIPTION_INVALID");
      }

      await upsertNotificationPushSubscription({
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        expiration_time: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null,
        platform: window.navigator.platform || null,
      });

      clearDismissedPushAt();
      setDismissedPushAt(null);
      setIsPushSubscribed(true);
      setPushEndpoint(payload.endpoint);
    } finally {
      setIsPushBusy(false);
    }
  }

  async function disablePush() {
    if (!user?.id) return;

    setIsPushBusy(true);
    try {
      let endpoint = pushEndpoint;
      let subscription: PushSubscription | null = null;

      if (pushSupported) {
        try {
          const registration = await navigator.serviceWorker.ready;
          subscription = await registration.pushManager.getSubscription();
          endpoint = subscription?.endpoint || endpoint;
        } catch {
          // Ignore service worker lookup failures; backend disable still works when endpoint is known.
        }
      }

      if (endpoint) {
        await disableNotificationPushSubscription(endpoint);
      }
      if (subscription) {
        await subscription.unsubscribe();
      }

      setIsPushSubscribed(false);
      setPushEndpoint(null);
      setPushPermissionState(readPushPermissionState());
      dismissPushCta();
    } finally {
      setIsPushBusy(false);
    }
  }

  return (
    <BleupPwaContext.Provider
      value={{
        installCtaKind,
        isStandaloneMode,
        canShowInstallCta,
        dismissInstallCta,
        openInstallExperience,
        push: {
          isSupported: pushSupported,
          isAvailable: pushAvailable,
          permissionState: pushPermissionState,
          isSubscribed: isPushSubscribed,
          isBusy: isPushBusy,
          canShowEnableCta: canShowPushEnableCta,
          dismissEnableCta: dismissPushCta,
          enable: enablePush,
          disable: disablePush,
        },
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

function readDismissedPushAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PWA_PUSH_CTA_SNOOZE_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function writeDismissedPushAt(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PWA_PUSH_CTA_SNOOZE_KEY, String(value));
}

function clearDismissedPushAt() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PWA_PUSH_CTA_SNOOZE_KEY);
}
