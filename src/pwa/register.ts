export type BleupPwaRegistration = {
  checkForUpdate: () => Promise<void>;
  activateWaitingUpdate: () => Promise<void>;
};

type RegisterBleupPwaOptions = {
  enableRefreshCallbacks?: boolean;
  onNeedRefresh?: () => void;
};

export async function registerBleupPwa(
  options: RegisterBleupPwaOptions = {},
): Promise<BleupPwaRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    const updateServiceWorker = registerSW({
      immediate: true,
      ...(options.enableRefreshCallbacks && options.onNeedRefresh
        ? {
            onNeedRefresh() {
              options.onNeedRefresh?.();
            },
          }
        : {}),
      onRegisterError(error) {
        console.warn("[pwa_register_failed]", error);
      },
    });

    return {
      async checkForUpdate() {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      },
      async activateWaitingUpdate() {
        await updateServiceWorker(true);
      },
    };
  } catch (error) {
    console.warn("[pwa_register_import_failed]", error);
    return null;
  }
}
