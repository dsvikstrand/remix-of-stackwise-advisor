import {
  buildReleaseMetadataUrl,
  getPwaAvailableReleaseKey,
  joinBasePath,
  shouldBypassPwaNavigation,
} from "@/pwa/runtimeUtils";

describe("pwaRuntimeUtils", () => {
  it("builds release metadata URLs under the current base path", () => {
    expect(buildReleaseMetadataUrl("/", "https://bleup.app")).toBe("https://bleup.app/release.json");
    expect(buildReleaseMetadataUrl("/app/", "https://bleup.app")).toBe("https://bleup.app/app/release.json");
  });

  it("joins base paths consistently", () => {
    expect(joinBasePath("/", "auth")).toBe("/auth");
    expect(joinBasePath("/bleup/", "auth")).toBe("/bleup/auth");
    expect(joinBasePath("/bleup", "offline.html")).toBe("/bleup/offline.html");
  });

  it("bypasses callback-sensitive and auth navigations", () => {
    expect(shouldBypassPwaNavigation(new URL("https://bleup.app/auth"), "/")).toBe(true);
    expect(shouldBypassPwaNavigation(new URL("https://bleup.app/auth/reset-password"), "/")).toBe(true);
    expect(shouldBypassPwaNavigation(new URL("https://bleup.app/wall?code=abc"), "/")).toBe(true);
    expect(shouldBypassPwaNavigation(new URL("https://bleup.app/app/auth"), "/app/")).toBe(true);
    expect(shouldBypassPwaNavigation(new URL("https://bleup.app/app/auth/reset-password"), "/app/")).toBe(true);
  });

  it("allows normal in-app navigations to use runtime caching", () => {
    expect(shouldBypassPwaNavigation(new URL("https://bleup.app/wall"), "/")).toBe(false);
    expect(shouldBypassPwaNavigation(new URL("https://bleup.app/app/subscriptions"), "/app/")).toBe(false);
  });

  it("builds release keys from waiting workers and newer releases", () => {
    expect(
      getPwaAvailableReleaseKey({
        currentReleaseSha: "abc123",
        latestReleaseSha: "def456",
        hasWaitingWorker: false,
      }),
    ).toBe("release:def456");

    expect(
      getPwaAvailableReleaseKey({
        currentReleaseSha: "abc123",
        latestReleaseSha: null,
        hasWaitingWorker: true,
      }),
    ).toBe("waiting:abc123");

    expect(
      getPwaAvailableReleaseKey({
        currentReleaseSha: "abc123",
        latestReleaseSha: "abc123",
        hasWaitingWorker: false,
      }),
    ).toBeNull();
  });
});
