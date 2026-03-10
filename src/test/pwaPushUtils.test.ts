import {
  PWA_PUSH_CTA_SNOOZE_MS,
  isQuietIosPushEligible,
  isPushCtaSnoozed,
  supportsAppBadgeApi,
  syncAppBadge,
  shouldShowPushEnableCta,
  urlBase64ToUint8Array,
} from "@/pwa/pushUtils";

describe("pwaPushUtils", () => {
  it("shows the CTA only for eligible installed authenticated users", () => {
    expect(
      shouldShowPushEnableCta({
        flagEnabled: true,
        isStandalone: true,
        isAuthenticated: true,
        isSupported: true,
        backendEnabled: true,
        isSubscribed: false,
        permissionState: "default",
        dismissedAt: null,
      }),
    ).toBe(true);

    expect(
      shouldShowPushEnableCta({
        flagEnabled: true,
        isStandalone: false,
        isAuthenticated: true,
        isSupported: true,
        backendEnabled: true,
        isSubscribed: false,
        permissionState: "default",
        dismissedAt: null,
      }),
    ).toBe(false);

    expect(
      shouldShowPushEnableCta({
        flagEnabled: true,
        isStandalone: true,
        isAuthenticated: false,
        isSupported: true,
        backendEnabled: true,
        isSubscribed: false,
        permissionState: "default",
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  it("still shows the CTA when permission is denied so the blocked state can render", () => {
    expect(
      shouldShowPushEnableCta({
        flagEnabled: true,
        isStandalone: true,
        isAuthenticated: true,
        isSupported: true,
        backendEnabled: true,
        isSubscribed: false,
        permissionState: "denied",
        dismissedAt: Date.now(),
      }),
    ).toBe(true);
  });

  it("respects the 14-day snooze for promptable users", () => {
    const now = Date.now();
    const dismissedAt = now - 1000;

    expect(isPushCtaSnoozed(dismissedAt, now)).toBe(true);
    expect(isPushCtaSnoozed(now - PWA_PUSH_CTA_SNOOZE_MS - 1, now)).toBe(false);

    expect(
      shouldShowPushEnableCta({
        flagEnabled: true,
        isStandalone: true,
        isAuthenticated: true,
        isSupported: true,
        backendEnabled: true,
        isSubscribed: false,
        permissionState: "default",
        dismissedAt,
        now,
      }),
    ).toBe(false);
  });

  it("does not show the CTA once the current browser is already subscribed", () => {
    expect(
      shouldShowPushEnableCta({
        flagEnabled: true,
        isStandalone: true,
        isAuthenticated: true,
        isSupported: true,
        backendEnabled: true,
        isSubscribed: true,
        permissionState: "granted",
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  it("normalizes the VAPID public key into a byte array", () => {
    const output = urlBase64ToUint8Array("SGVsbG8");
    expect(Array.from(output)).toEqual([72, 101, 108, 108, 111]);
  });

  it("detects quiet iPhone badge eligibility conservatively", () => {
    expect(
      isQuietIosPushEligible({
        flagEnabled: true,
        isStandalone: true,
        isSupported: true,
        backendEnabled: true,
        badgeSupported: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);

    expect(
      isQuietIosPushEligible({
        flagEnabled: true,
        isStandalone: true,
        isSupported: true,
        backendEnabled: true,
        badgeSupported: false,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });

  it("syncs and clears app badges through the badge API when supported", async () => {
    const target = {
      setAppBadge: vi.fn(async () => undefined),
      clearAppBadge: vi.fn(async () => undefined),
    };

    expect(supportsAppBadgeApi(target)).toBe(true);
    await expect(syncAppBadge(target, 4)).resolves.toBe(true);
    expect(target.setAppBadge).toHaveBeenCalledWith(4);

    await expect(syncAppBadge(target, 0)).resolves.toBe(true);
    expect(target.clearAppBadge).toHaveBeenCalledTimes(1);
  });
});
