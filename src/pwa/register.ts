export async function registerBleupPwa() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({
      immediate: true,
      onRegisterError(error) {
        console.warn("[pwa_register_failed]", error);
      },
    });
  } catch (error) {
    console.warn("[pwa_register_import_failed]", error);
  }
}
