export const WALL_HOME_REQUEST_EVENT = 'bleup:wall-home-request';

export function requestWallHomeReset() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WALL_HOME_REQUEST_EVENT));
}
