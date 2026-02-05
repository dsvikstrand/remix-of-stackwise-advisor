export function getFriendlyErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('unauthorized') || normalized.includes('auth')) {
    return 'Please sign in again and try that request.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'You’re doing that a bit fast. Please wait a moment and try again.';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  if (normalized.includes('storage')) {
    return 'We could not upload the banner. Please try again in a moment.';
  }

  return fallback;
}
