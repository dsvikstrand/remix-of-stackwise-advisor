export const HOME_ONBOARDING_REOPEN_EVENT = 'bleup:home-onboarding:reopen';
const HOME_ONBOARDING_OPEN_REQUEST_KEY = 'bleup:home-onboarding:open-request';

export function getHomeOnboardingDismissedKey(userId: string) {
  return `bleup:home-onboarding:dismissed:${userId}`;
}

export function requestHomeOnboardingOpen() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HOME_ONBOARDING_OPEN_REQUEST_KEY, String(Date.now()));
  window.dispatchEvent(new CustomEvent(HOME_ONBOARDING_REOPEN_EVENT));
}

export function consumeHomeOnboardingOpenRequest() {
  if (typeof window === 'undefined') return false;
  const value = window.localStorage.getItem(HOME_ONBOARDING_OPEN_REQUEST_KEY);
  if (!value) return false;
  window.localStorage.removeItem(HOME_ONBOARDING_OPEN_REQUEST_KEY);
  return true;
}
