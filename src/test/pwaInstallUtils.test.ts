import {
  getInstallCtaKind,
  isInstallCtaDismissed,
  isLikelyAndroidChromium,
  isLikelyIosSafari,
  PWA_INSTALL_CTA_COOLDOWN_MS,
  shouldShowInstallCta,
} from "@/pwa/installUtils";

describe("pwaInstallUtils", () => {
  it("detects iOS Safari eligibility", () => {
    expect(
      isLikelyIosSafari({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("detects Android Chromium eligibility", () => {
    expect(
      isLikelyAndroidChromium({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
      }),
    ).toBe(true);
  });

  it("returns no CTA in standalone mode", () => {
    expect(
      getInstallCtaKind({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
        isStandalone: true,
        hasBeforeInstallPrompt: false,
      }),
    ).toBeNull();
  });

  it("falls back to manual Android install instructions when no deferred prompt exists", () => {
    expect(
      getInstallCtaKind({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
        platform: "Linux armv9l",
        maxTouchPoints: 5,
        isStandalone: false,
        hasBeforeInstallPrompt: false,
      }),
    ).toBe("android-manual");

    expect(
      getInstallCtaKind({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
        platform: "Linux armv9l",
        maxTouchPoints: 5,
        isStandalone: false,
        hasBeforeInstallPrompt: true,
      }),
    ).toBe("chromium");
  });

  it("does not show a manual Android CTA for unsupported browsers", () => {
    expect(
      getInstallCtaKind({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36 DuckDuckGo/5 Safari/537.36",
        platform: "Linux armv9l",
        maxTouchPoints: 5,
        isStandalone: false,
        hasBeforeInstallPrompt: false,
      }),
    ).toBeNull();
  });

  it("applies the dismissal cooldown window", () => {
    const now = 1_700_000_000_000;
    expect(isInstallCtaDismissed(now, now)).toBe(true);
    expect(isInstallCtaDismissed(now - (PWA_INSTALL_CTA_COOLDOWN_MS - 1), now)).toBe(true);
    expect(isInstallCtaDismissed(now - (PWA_INSTALL_CTA_COOLDOWN_MS + 1), now)).toBe(false);
    expect(isInstallCtaDismissed(null, now)).toBe(false);
  });

  it("applies the final CTA visibility rules", () => {
    const now = 1_700_000_000_000;

    expect(
      shouldShowInstallCta({
        flagEnabled: false,
        installCtaKind: "ios",
        isStandalone: false,
        dismissedAt: null,
        now,
      }),
    ).toBe(false);

    expect(
      shouldShowInstallCta({
        flagEnabled: true,
        installCtaKind: null,
        isStandalone: false,
        dismissedAt: null,
        now,
      }),
    ).toBe(false);

    expect(
      shouldShowInstallCta({
        flagEnabled: true,
        installCtaKind: "ios",
        isStandalone: true,
        dismissedAt: null,
        now,
      }),
    ).toBe(false);

    expect(
      shouldShowInstallCta({
        flagEnabled: true,
        installCtaKind: "chromium",
        isStandalone: false,
        dismissedAt: null,
        now,
      }),
    ).toBe(true);

    expect(
      shouldShowInstallCta({
        flagEnabled: true,
        installCtaKind: "android-manual",
        isStandalone: false,
        dismissedAt: null,
        now,
      }),
    ).toBe(true);
  });
});
