import {
  PWA_PUSH_CTA_SNOOZE_MS,
  isPushCtaSnoozed,
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
});
