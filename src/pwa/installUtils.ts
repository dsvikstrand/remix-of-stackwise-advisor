export const PWA_INSTALL_CTA_DISMISS_KEY = "bleup:pwa-install-cta:dismissed-at";
export const PWA_INSTALL_CTA_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export type InstallCtaKind = "ios" | "chromium" | null;

type DetectInstallPlatformOptions = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  isStandalone: boolean;
  hasBeforeInstallPrompt: boolean;
};

function normalizeUserAgent(userAgent: string): string {
  return String(userAgent || "").trim().toLowerCase();
}

export function isLikelyIosDevice(options: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  const userAgent = normalizeUserAgent(options.userAgent);
  const platform = String(options.platform || "").toLowerCase();
  const maxTouchPoints = Number(options.maxTouchPoints || 0);
  if (/iphone|ipad|ipod/.test(userAgent)) return true;
  return platform === "macintel" && maxTouchPoints > 1;
}

export function isLikelyIosSafari(options: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  const userAgent = normalizeUserAgent(options.userAgent);
  if (!isLikelyIosDevice(options)) return false;
  if (!/safari/.test(userAgent)) return false;
  return !/(crios|fxios|edgios|optios|mercury)/.test(userAgent);
}

export function isLikelyAndroidChromium(options: { userAgent: string }): boolean {
  const userAgent = normalizeUserAgent(options.userAgent);
  if (!/android/.test(userAgent)) return false;
  if (!/(chrome|chromium|edga|brave)/.test(userAgent)) return false;
  return !/(firefox|opera|opr\/|duckduckgo|samsungbrowser)/.test(userAgent);
}

export function getInstallCtaKind(options: DetectInstallPlatformOptions): InstallCtaKind {
  if (options.isStandalone) return null;

  if (
    isLikelyIosSafari({
      userAgent: options.userAgent,
      platform: options.platform,
      maxTouchPoints: options.maxTouchPoints,
    })
  ) {
    return "ios";
  }

  if (
    options.hasBeforeInstallPrompt &&
    isLikelyAndroidChromium({
      userAgent: options.userAgent,
    })
  ) {
    return "chromium";
  }

  return null;
}

export function isInstallCtaDismissed(dismissedAt: number | null, now = Date.now()): boolean {
  if (!dismissedAt || !Number.isFinite(dismissedAt)) return false;
  return now - dismissedAt < PWA_INSTALL_CTA_COOLDOWN_MS;
}

export function shouldShowInstallCta(options: {
  flagEnabled: boolean;
  installCtaKind: InstallCtaKind;
  isStandalone: boolean;
  dismissedAt: number | null;
  now?: number;
}): boolean {
  if (!options.flagEnabled) return false;
  if (options.isStandalone) return false;
  if (!options.installCtaKind) return false;
  return !isInstallCtaDismissed(options.dismissedAt, options.now);
}
